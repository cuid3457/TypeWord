-- Honor referral bonus premium in server-side rate limits.
--
-- Until now, check_rate_limits returned `plan` from profiles directly, which
-- only reflects the RevenueCat entitlement. The friend-referral bonus
-- (profiles.bonus_premium_until, set by apply_referral) was wired through
-- the client tier computer but not the server gate, so users receiving the
-- 7-day bonus still hit free-tier daily/monthly caps on word-lookup-v4,
-- tts-synthesize, ipa-generate, and image-extract.
--
-- Patch only the plan resolution; counts and signature unchanged.

DROP FUNCTION IF EXISTS public.check_rate_limits(uuid, text);

CREATE OR REPLACE FUNCTION public.check_rate_limits(
  p_user_id  uuid,
  p_endpoint text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_bonus_until TIMESTAMPTZ;
  v_timezone TEXT;
  v_month_bucket TEXT;
  v_effective_plan TEXT;
BEGIN
  SELECT plan, bonus_premium_until, timezone
    INTO v_plan, v_bonus_until, v_timezone
    FROM public.profiles
   WHERE user_id = p_user_id;

  -- RC entitlement wins; otherwise bonus window upgrades free → premium.
  IF v_plan IN ('premium', 'pro', 'plus') THEN
    v_effective_plan := v_plan;
  ELSIF v_bonus_until IS NOT NULL AND v_bonus_until > now() THEN
    v_effective_plan := 'premium';
  ELSE
    v_effective_plan := coalesce(v_plan, 'free');
  END IF;

  v_month_bucket := to_char(
    (now() AT TIME ZONE coalesce(v_timezone, 'UTC')),
    'YYYY-MM'
  );

  RETURN json_build_object(
    'plan',        v_effective_plan,
    'user_minute', (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = p_endpoint AND created_at >= now() - interval '1 minute'),
    'user_hour',   (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = p_endpoint AND created_at >= now() - interval '1 hour'),
    'user_day',    (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = p_endpoint AND created_at >= now() - interval '1 day'),
    'user_month',  (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = p_endpoint AND month_bucket = v_month_bucket),
    'sys_minute',  (SELECT count(*) FROM public.api_calls WHERE endpoint = p_endpoint AND created_at >= now() - interval '1 minute')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limits(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limits(uuid, text) TO service_role;
