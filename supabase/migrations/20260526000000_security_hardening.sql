-- Security hardening pass (2026-05-26 audit).
-- Covers Critical/High DB findings from the five-area security audit:
--   • C-1: jmdict_entries / cedict_entries had RLS off → anon could DELETE/UPDATE
--   • C-2: profiles.points (+ xp_total + report_*_count + username) writable
--          directly by clients, bypassing award_points cap / username moderation
--   • C-3: friend_reports direct-INSERT policy bypassed the 30/day cap in
--          report_user RPC
--   • H-1: increment_report_counters used WRONG column (id vs user_id),
--          had no auth check, and default-PUBLIC grant
--   • H-2: ~25 SECURITY DEFINER functions lacked SET search_path
--   • H-3: report_fixes_admin_update policy missing WITH CHECK
--   • H-4: username_available callable without auth → username enumeration
--   • C-3b: content_reports.reason/description had no length cap → prompt
--          injection + cost amplification in process-report

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- C-1: Enable RLS on dictionary tables (217K + 125K rows).
-- Dictionary content is public read, write-only by service_role for imports.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.jmdict_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cedict_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jmdict public read" ON public.jmdict_entries;
CREATE POLICY "jmdict public read"
  ON public.jmdict_entries FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "cedict public read" ON public.cedict_entries;
CREATE POLICY "cedict public read"
  ON public.cedict_entries FOR SELECT
  TO anon, authenticated
  USING (TRUE);

-- service_role bypasses RLS by design → imports continue to work.

-- ─────────────────────────────────────────────────────────────────
-- C-2: Expand tg_profiles_protect_columns to cover currency / trust /
-- username. Client legitimately writes display_name, push_token,
-- push_platform, stats_public, timezone, country_code, native_language,
-- email — those stay editable. Everything below is server-only (RPC or
-- service_role).
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

  -- Currency (award_points / purchase_item RPCs only).
  IF NEW.points IS DISTINCT FROM OLD.points THEN
    RAISE EXCEPTION 'profiles.points is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.points_awarded_today IS DISTINCT FROM OLD.points_awarded_today THEN
    RAISE EXCEPTION 'profiles.points_awarded_today is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.points_awarded_day IS DISTINCT FROM OLD.points_awarded_day THEN
    RAISE EXCEPTION 'profiles.points_awarded_day is read-only for clients' USING ERRCODE = '42501';
  END IF;

  -- XP (set_xp_total RPC only).
  IF NEW.xp_total IS DISTINCT FROM OLD.xp_total THEN
    RAISE EXCEPTION 'profiles.xp_total is read-only for clients' USING ERRCODE = '42501';
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

  -- Username goes through set_username RPC (SECURITY DEFINER) which runs as
  -- 'postgres' and gets the bypass above. Edge function username-set also
  -- writes via service_role. Direct PATCH bypassed reserved-word + OpenAI
  -- moderation + homoglyph checks.
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'profiles.username must be set via username-set RPC' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger is already attached from 20260509000000; CREATE OR REPLACE above
-- updates the body in place.

-- ─────────────────────────────────────────────────────────────────
-- C-3: friend_reports direct-INSERT policy bypasses the 30/day cap in
-- report_user RPC. Drop the policy; only the RPC (SECURITY DEFINER) writes.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users can insert their own reports" ON public.friend_reports;

-- ─────────────────────────────────────────────────────────────────
-- C-3b: content_reports length caps. process-report ships these fields
-- verbatim into the gpt-4.1 judge prompt; 1 MB of attacker text =
-- expensive prompt injection vector.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.content_reports
  DROP CONSTRAINT IF EXISTS content_reports_reason_length,
  DROP CONSTRAINT IF EXISTS content_reports_description_length,
  DROP CONSTRAINT IF EXISTS content_reports_context_length,
  DROP CONSTRAINT IF EXISTS content_reports_word_length;

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_reason_length      CHECK (char_length(reason)      <= 200),
  ADD CONSTRAINT content_reports_description_length CHECK (description IS NULL OR char_length(description) <= 2000),
  ADD CONSTRAINT content_reports_context_length     CHECK (char_length(context)     <= 4000),
  ADD CONSTRAINT content_reports_word_length        CHECK (char_length(word)        <= 200);

-- ─────────────────────────────────────────────────────────────────
-- H-1: increment_report_counters had three bugs:
--   1) WHERE id = p_user_id  →  profiles PK is user_id, no id column.
--      Function silently no-op'd since 2026-05-18.
--   2) No auth/role check; default GRANT EXECUTE to PUBLIC.
--   3) Missing SET search_path.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_report_counters(
  p_user_id UUID,
  p_valid_delta INT,
  p_invalid_delta INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- service_role only. The legacy 'role' claim path is gone (sb_secret
  -- cutover 2026-05-21). current_user check covers both the new
  -- service_role and definer-context pg_cron calls.
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'increment_report_counters is service-only' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles
  SET report_count = COALESCE(report_count, 0) + p_valid_delta + p_invalid_delta,
      report_valid_count = COALESCE(report_valid_count, 0) + p_valid_delta,
      report_invalid_count = COALESCE(report_invalid_count, 0) + p_invalid_delta,
      last_report_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_report_counters(UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_report_counters(UUID, INT, INT) FROM authenticated;
REVOKE ALL ON FUNCTION public.increment_report_counters(UUID, INT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_report_counters(UUID, INT, INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- H-3: report_fixes_admin_update missing WITH CHECK. Without it, the
-- policy gates which rows are visible for UPDATE but not the new column
-- values. Add a symmetric WITH CHECK.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "report_fixes_admin_update" ON public.report_fixes;
CREATE POLICY "report_fixes_admin_update" ON public.report_fixes
  FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'junesung07@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'junesung07@gmail.com');

-- ─────────────────────────────────────────────────────────────────
-- H-4: username_available callable with no auth → username space
-- enumeration. Gate to authenticated, and reject overly short inputs
-- (length < 3 cannot match the format CHECK anyway).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  IF p_username IS NULL OR char_length(trim(p_username)) < 3 THEN
    RETURN FALSE;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE LOWER(username) = LOWER(trim(p_username))
  );
END;
$$;

-- search_users_by_username: require min query length of 3 (was 1) to slow
-- prefix-walk enumeration.
CREATE OR REPLACE FUNCTION public.search_users_by_username(p_query TEXT)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  has_pending_request BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  q TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RETURN;
  END IF;
  q := LOWER(trim(p_query));
  IF q IS NULL OR char_length(q) < 3 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    p.user_id,
    p.username,
    COALESCE(p.display_name, '')::TEXT,
    EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE fr.sender_id = uid AND fr.recipient_id = p.user_id
    )
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND LOWER(p.username) LIKE q || '%'
    AND p.user_id <> uid
    AND NOT EXISTS (
      SELECT 1 FROM public.friend_blocks b
      WHERE (b.blocker_id = uid AND b.blocked_id = p.user_id)
         OR (b.blocker_id = p.user_id AND b.blocked_id = uid)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.user_id = uid AND f.friend_id = p.user_id
    )
  ORDER BY char_length(p.username), LOWER(p.username)
  LIMIT 10;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- H-2: Apply SET search_path = public, pg_temp to existing SECURITY
-- DEFINER functions. Idempotent — re-running is safe.
--
-- The threat is shadow-resolution: a SECURITY DEFINER function with no
-- search_path defaults to the caller's search_path, which can include
-- pg_temp (always reachable). An attacker who creates pg_temp.auth or
-- pg_temp.profiles can intercept critical lookups.
--
-- All ALTER FUNCTION uses dynamic signature lookup via pg_proc — robust to
-- signature drift across migrations (same name, different args).
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn_name TEXT;
  fn_names TEXT[] := ARRAY[
    'generate_friend_code',
    'ensure_friend_code',
    'add_friend_by_code',
    'remove_friend',
    'block_user',
    'get_my_friends',
    'set_username',
    'send_friend_request',
    'accept_friend_request',
    'reject_friend_request',
    'cancel_friend_request',
    'list_incoming_friend_requests',
    'list_outgoing_friend_requests',
    'report_user',
    'report_wordlist',
    'award_points',
    'send_poke',
    'list_recent_pokes',
    'mark_pokes_seen',
    'delete_poke',
    'count_unseen_pokes',
    'compute_user_streak',
    'set_xp_total',
    'get_my_xp_total',
    'purchase_item',
    'consume_streak_freeze',
    'get_inventory',
    'apply_referral',
    'increment_reverse_lookup_hit',
    'award_uploader_on_like',
    'award_uploader_on_download',
    'enqueue_process_report',
    'enforce_content_report_rate_limit',
    'sync_community_uploader_name'
  ];
  alter_stmts TEXT;
BEGIN
  FOREACH fn_name IN ARRAY fn_names LOOP
    SELECT string_agg(
      format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
             fn_name, pg_get_function_identity_arguments(p.oid)),
      '; '
    )
    INTO alter_stmts
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = fn_name;
    IF alter_stmts IS NOT NULL THEN
      EXECUTE alter_stmts;
    END IF;
  END LOOP;

  -- Same fix as M-2 from medium_hardening: lock increment_reverse_lookup_hit
  -- to service_role only.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'increment_reverse_lookup_hit') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.increment_reverse_lookup_hit(UUID) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.increment_reverse_lookup_hit(UUID) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.increment_reverse_lookup_hit(UUID) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.increment_reverse_lookup_hit(UUID) TO service_role';
  END IF;

  -- Flip sync_community_uploader_name to SECURITY DEFINER so the trigger
  -- UPDATE bypasses the post-20260509000004 lockdown on community_wordlists.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'sync_community_uploader_name') THEN
    EXECUTE 'ALTER FUNCTION public.sync_community_uploader_name() SECURITY DEFINER';
  END IF;
END
$$;

COMMIT;
