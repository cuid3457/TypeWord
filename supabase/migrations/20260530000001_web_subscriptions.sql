-- Phase 2 prep: web-payment infrastructure.
--
-- Today profiles.plan is set exclusively by the RevenueCat webhook (iOS/Android
-- IAP). This migration adds the data shape needed for a parallel web payment
-- channel (Paddle / Toss / Stripe — TBD) without committing to any provider.
--
-- Design constraints:
--   1. Multi-source entitlement (RC + web PG + bonus_premium_until) — the user
--      is premium if ANY source says so. profiles.plan stays the single
--      column the rest of the app reads.
--   2. Both webhooks must converge to the same plan without trampling each
--      other. The reconcile_plan_from_sources() RPC encapsulates the union.
--   3. profiles.plan stays server-only (existing tg_profiles_protect_columns
--      trigger). The new subscription_source column joins that protection.
--   4. Historical sub records survive on web_subscriptions even after a row
--      goes 'expired' — useful for support, refund audits, churn analysis.

-- 1. web_subscriptions — provider-agnostic record of every web sub event.
CREATE TABLE IF NOT EXISTS public.web_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                       -- 'paddle' | 'toss' | 'stripe'
  provider_subscription_id TEXT NOT NULL,       -- provider's stable sub id
  provider_customer_id TEXT,                    -- provider's customer/billing id
  status TEXT NOT NULL,                         -- 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired'
  current_period_end TIMESTAMPTZ,               -- access expires at this point if not renewed
  cancelled_at TIMESTAMPTZ,                     -- user cancelled (still active until current_period_end)
  trial_ends_at TIMESTAMPTZ,
  price_amount_cents INT,                       -- diagnostics; canonical price lives in provider
  price_currency TEXT,
  raw_event JSONB,                              -- last event payload, for support replay
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_web_subscriptions_user_active
  ON public.web_subscriptions (user_id)
  WHERE status IN ('trialing', 'active');

ALTER TABLE public.web_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owners may read their own subscription history (billing portal, status UI).
-- Writes are server-only (webhook + admin tooling); no client-side policy.
DROP POLICY IF EXISTS web_subscriptions_owner_read ON public.web_subscriptions;
CREATE POLICY web_subscriptions_owner_read
  ON public.web_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Track which source last set profiles.plan to 'premium'. Used by the
--    billing portal to deep-link to the correct provider's cancel page,
--    and by the reconcile RPC to break ties when multiple sources are active.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_source TEXT;
COMMENT ON COLUMN public.profiles.subscription_source IS
  'Which source last set plan=premium. NULL when plan=free. Values: rc | web_<provider> | bonus.';

-- 3. Extend the protect-columns trigger to lock down subscription_source.
--    (Migration must replay safely; OR REPLACE is sufficient.)
CREATE OR REPLACE FUNCTION public.tg_profiles_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    current_setting('request.jwt.claims', true)::json->>'role'
  );
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'profiles.user_id is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'profiles.plan is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.subscription_source IS DISTINCT FROM OLD.subscription_source THEN
    RAISE EXCEPTION 'profiles.subscription_source is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.bonus_premium_until IS DISTINCT FROM OLD.bonus_premium_until THEN
    RAISE EXCEPTION 'profiles.bonus_premium_until is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.image_extract_count IS DISTINCT FROM OLD.image_extract_count THEN
    RAISE EXCEPTION 'profiles.image_extract_count is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.image_extract_bucket IS DISTINCT FROM OLD.image_extract_bucket THEN
    RAISE EXCEPTION 'profiles.image_extract_bucket is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.friend_code IS DISTINCT FROM OLD.friend_code THEN
    RAISE EXCEPTION 'profiles.friend_code is read-only for clients' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Helper: does the user have an active web subscription right now?
--    'active' covers paid; 'trialing' covers free-trial period.
CREATE OR REPLACE FUNCTION public.fn_user_has_active_web_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.web_subscriptions
    WHERE user_id = p_user_id
      AND status IN ('trialing', 'active')
      AND (current_period_end IS NULL OR current_period_end > NOW())
  );
$$;

-- 5. Reconcile profiles.plan from the union of all entitlement sources.
--    Caller passes the authoritative RC state (computed by the RC webhook
--    against the live RC API). Web sub state is read inline from this DB.
--    bonus_premium_until is read inline too.
--
--    Source priority (for subscription_source labelling, NOT for the boolean):
--      rc > web > bonus
--    The boolean is OR — any active source makes plan='premium'.
--
--    On free→premium transition, resets the monthly image_extract quota
--    (matches existing RC webhook behavior; preserves quota-on-upgrade UX).
CREATE OR REPLACE FUNCTION public.reconcile_plan_from_sources(
  p_user_id UUID,
  p_rc_active BOOLEAN,
  p_extra JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (new_plan TEXT, new_source TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old_plan TEXT;
  v_web_active BOOLEAN;
  v_bonus_active BOOLEAN;
  v_new_plan TEXT;
  v_new_source TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_year TEXT;
  v_month TEXT;
  v_bucket TEXT;
BEGIN
  -- Read current state + protected fields.
  SELECT plan, fn_user_has_active_web_subscription(user_id),
         (bonus_premium_until IS NOT NULL AND bonus_premium_until > v_now)
    INTO v_old_plan, v_web_active, v_bonus_active
    FROM public.profiles
    WHERE user_id = p_user_id;

  IF v_old_plan IS NULL THEN
    -- No profile row → skip silently; matches RC webhook behavior.
    RETURN;
  END IF;

  IF p_rc_active OR v_web_active OR v_bonus_active THEN
    v_new_plan := 'premium';
    -- Priority: prefer the most "owned" source so the billing portal links
    -- to the right provider. RC > web > bonus.
    IF p_rc_active THEN
      v_new_source := 'rc';
    ELSIF v_web_active THEN
      v_new_source := COALESCE(
        (SELECT 'web_' || provider
           FROM public.web_subscriptions
           WHERE user_id = p_user_id
             AND status IN ('trialing', 'active')
             AND (current_period_end IS NULL OR current_period_end > v_now)
           ORDER BY current_period_end DESC NULLS LAST
           LIMIT 1),
        'web'
      );
    ELSE
      v_new_source := 'bonus';
    END IF;
  ELSE
    v_new_plan := 'free';
    v_new_source := NULL;
  END IF;

  -- free → premium: reset monthly image-extract quota (existing RC behavior).
  IF v_old_plan = 'free' AND v_new_plan = 'premium' THEN
    v_year := to_char(v_now AT TIME ZONE 'UTC', 'YYYY');
    v_month := to_char(v_now AT TIME ZONE 'UTC', 'MM');
    v_bucket := v_year || '-' || v_month;
    UPDATE public.profiles
       SET plan = v_new_plan,
           subscription_source = v_new_source,
           image_extract_count = 0,
           image_extract_bucket = v_bucket,
           trial_ends_at = COALESCE((p_extra->>'trial_ends_at')::timestamptz, trial_ends_at),
           trial_reminder_sent_at = CASE
             WHEN p_extra ? 'trial_ends_at' THEN NULL
             ELSE trial_reminder_sent_at
           END
     WHERE user_id = p_user_id;
  ELSE
    UPDATE public.profiles
       SET plan = v_new_plan,
           subscription_source = v_new_source,
           trial_ends_at = COALESCE((p_extra->>'trial_ends_at')::timestamptz, trial_ends_at),
           trial_reminder_sent_at = CASE
             WHEN p_extra ? 'trial_ends_at' THEN NULL
             ELSE trial_reminder_sent_at
           END
     WHERE user_id = p_user_id;
  END IF;

  new_plan := v_new_plan;
  new_source := v_new_source;
  RETURN NEXT;
END;
$$;

-- Only the webhook service role calls this. No anon/auth grants.
REVOKE ALL ON FUNCTION public.reconcile_plan_from_sources(UUID, BOOLEAN, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_plan_from_sources(UUID, BOOLEAN, JSONB) TO service_role;

-- 6. updated_at maintenance for web_subscriptions.
CREATE OR REPLACE FUNCTION public.tg_web_subscriptions_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_web_subscriptions_touch ON public.web_subscriptions;
CREATE TRIGGER tg_web_subscriptions_touch
  BEFORE UPDATE ON public.web_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_web_subscriptions_touch();
