-- Security hardening pass 2 (2026-05-29).
--
-- Follow-up to 20260526000000_security_hardening.sql. Closes gaps that were
-- (re)introduced by migrations created AFTER that baseline:
--
--   C-1  award_streak_milestone mints points but lacks SET search_path
--        (H-2 class) AND its idempotency key (last_streak_milestone_awarded)
--        is not protected by tg_profiles_protect_columns — so a client can
--        PATCH the key back to 0 and re-claim 200 points per milestone
--        indefinitely. Lock both.
--   H-1  trial_ends_at / trial_reminder_sent_at are client-writable, letting
--        a user spoof trial state and replay/suppress the reminder email cron.
--   L-1  send_poke / list_recent_pokes / delete_poke were DROP+CREATE'd after
--        the baseline's H-2 loop, dropping their SET search_path.
--   L-2  wiktionary_entries shipped with RLS OFF (jmdict/cedict were fixed in
--        the baseline C-1). anon/authenticated could DELETE/UPDATE all rows.
--   L-3  check_rate_limits search_path omits pg_temp (baseline convention).

-- ─────────────────────────────────────────────────────────────────
-- C-1a + H-1: extend the profiles column guard to the columns added after
-- the baseline. Server writers (RPCs running as 'postgres' / service_role)
-- still bypass via the role check at the top.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_profiles_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
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

  -- Currency (award_points / purchase_item / award_streak_milestone RPCs only).
  IF NEW.points IS DISTINCT FROM OLD.points THEN
    RAISE EXCEPTION 'profiles.points is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.points_awarded_today IS DISTINCT FROM OLD.points_awarded_today THEN
    RAISE EXCEPTION 'profiles.points_awarded_today is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.points_awarded_day IS DISTINCT FROM OLD.points_awarded_day THEN
    RAISE EXCEPTION 'profiles.points_awarded_day is read-only for clients' USING ERRCODE = '42501';
  END IF;
  -- Idempotency key for award_streak_milestone — resetting it re-opens the
  -- 200-pt milestone grant. Server-only.
  IF NEW.last_streak_milestone_awarded IS DISTINCT FROM OLD.last_streak_milestone_awarded THEN
    RAISE EXCEPTION 'profiles.last_streak_milestone_awarded is read-only for clients' USING ERRCODE = '42501';
  END IF;

  -- XP (set_xp_total RPC only).
  IF NEW.xp_total IS DISTINCT FROM OLD.xp_total THEN
    RAISE EXCEPTION 'profiles.xp_total is read-only for clients' USING ERRCODE = '42501';
  END IF;

  -- Trial state — written only by revenuecat-webhook (service_role) from RC's
  -- authoritative entitlement; client must not spoof trial window or replay
  -- the reminder cron.
  IF NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
    RAISE EXCEPTION 'profiles.trial_ends_at is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.trial_reminder_sent_at IS DISTINCT FROM OLD.trial_reminder_sent_at THEN
    RAISE EXCEPTION 'profiles.trial_reminder_sent_at is read-only for clients' USING ERRCODE = '42501';
  END IF;

  -- Reporter trust counters (process-report → increment_report_counters only).
  IF NEW.report_count IS DISTINCT FROM OLD.report_count THEN
    RAISE EXCEPTION 'profiles.report_count is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.report_valid_count IS DISTINCT FROM OLD.report_valid_count THEN
    RAISE EXCEPTION 'profiles.report_valid_count is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.report_invalid_count IS DISTINCT FROM OLD.report_invalid_count THEN
    RAISE EXCEPTION 'profiles.report_invalid_count is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.last_report_at IS DISTINCT FROM OLD.last_report_at THEN
    RAISE EXCEPTION 'profiles.last_report_at is read-only for clients' USING ERRCODE = '42501';
  END IF;

  IF NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'profiles.username must be set via username-set RPC' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- C-1b + L-1 + L-3: restore SET search_path on SECURITY DEFINER functions
-- (re)created after the baseline H-2 loop. ALTER avoids re-pasting bodies.
-- ─────────────────────────────────────────────────────────────────
ALTER FUNCTION public.award_streak_milestone(INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.send_poke(UUID)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.list_recent_pokes()             SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_poke(BIGINT)             SET search_path = public, pg_temp;
ALTER FUNCTION public.check_rate_limits(uuid, text)   SET search_path = public, pg_temp;

-- ─────────────────────────────────────────────────────────────────
-- L-2: wiktionary_entries is public dictionary data (mirrors jmdict/cedict).
-- Enable RLS + public SELECT; writes go through service_role (bypasses RLS).
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.wiktionary_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wiktionary public read" ON public.wiktionary_entries;
CREATE POLICY "wiktionary public read" ON public.wiktionary_entries
  FOR SELECT TO anon, authenticated
  USING (TRUE);
