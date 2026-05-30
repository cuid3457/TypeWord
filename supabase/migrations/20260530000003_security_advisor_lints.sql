-- Security Advisor (splinter) lint fixes — 2026-05-30
--
-- Closes 3 categories of warnings from the 141-warning audit:
--   Part A: Function Search Path Mutable (15 functions) — non-SD functions
--   Part B: SECURITY DEFINER EXECUTE grants (49 functions) — REVOKE PUBLIC, GRANT selectively
--   Part C: Public Bucket Allows Listing (1: tts) — drop the broad SELECT policy
--
-- Out of scope (documented separately):
--   • Anonymous Access Policies (23) — needs per-table review re: 익명 사인인 정책
--   • Extension in Public (3) — low risk, moving requires dependent-object rebuild
--   • Leaked Password Protection — Auth dashboard setting, not SQL
--
-- All sections idempotent — safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Part A: SET search_path on 15 mutable-search-path functions
--
-- Same dynamic-signature pattern as 20260526000000_security_hardening
-- so signature drift across earlier migrations doesn't break this.
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn_name TEXT;
  fn_names TEXT[] := ARRAY[
    'bump_curated_wordlist_version',
    'cascade_word_entry_ipa_to_user_words',
    'community_wordlists_touch_updated',
    'increment_ipa_hit',
    'increment_word_entry_hit',
    'increment_word_translation_hit',
    'report_fixes_set_updated_at',
    'stamp_curated_words_updated_at',
    'strip_translation_markers_in_result',
    'tg_profiles_protect_columns',
    'tg_set_updated_at',
    'tg_web_subscriptions_touch',
    'touch_word_entries_updated_at',
    'touch_word_translations_updated_at',
    'update_curated_word_count'
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
END $$;

-- ─────────────────────────────────────────────────────────────────
-- Part B: SECURITY DEFINER EXECUTE — REVOKE PUBLIC, GRANT selectively
--
-- Default PostgreSQL: new functions GRANT EXECUTE TO PUBLIC, so anon
-- inherits execute. Splinter flags this even when auth.uid() inside
-- the function would null-out for anon. We tighten so anon can no
-- longer call user-context RPCs at all.
--
-- Classification source: grep across src/ app/ components/ supabase/
-- for actual rpc() call sites (2026-05-30).
-- ─────────────────────────────────────────────────────────────────

-- B1. Client-callable user-context functions (28)
--     → authenticated + service_role only
DO $$
DECLARE
  fn_name TEXT;
  fn_names TEXT[] := ARRAY[
    'accept_friend_request',
    'add_friend_by_code',
    'apply_referral',
    'award_points',
    'award_streak_milestone',
    'block_user',
    'cancel_friend_request',
    'community_wordlist_increment_downloads',
    'consume_streak_freeze',
    'count_unseen_pokes',
    'delete_poke',
    'ensure_friend_code',
    'get_inventory',
    'get_my_friends',
    'get_my_xp_total',
    'list_incoming_friend_requests',
    'list_outgoing_friend_requests',
    'list_recent_pokes',
    'mark_pokes_seen',
    'purchase_item',
    'reject_friend_request',
    'remove_friend',
    'report_user',
    'report_wordlist',
    'search_users_by_username',
    'send_friend_request',
    'send_poke',
    'set_xp_total'
  ];
  args TEXT;
BEGIN
  FOREACH fn_name IN ARRAY fn_names LOOP
    FOR args IN
      SELECT pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', fn_name, args);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', fn_name, args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', fn_name, args);
    END LOOP;
  END LOOP;
END $$;

-- B2. Conservatively-client functions — no grep hit but readable surface
--     → authenticated + service_role only
DO $$
DECLARE
  fn_name TEXT;
  fn_names TEXT[] := ARRAY[
    'compute_user_streak',
    'count_user_calls_this_month',
    'fn_user_has_active_web_subscription'
  ];
  args TEXT;
BEGIN
  FOREACH fn_name IN ARRAY fn_names LOOP
    FOR args IN
      SELECT pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', fn_name, args);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', fn_name, args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', fn_name, args);
    END LOOP;
  END LOOP;
END $$;

-- B3. Strictly server-side / trigger functions (18)
--     → service_role only (triggers fire regardless of EXECUTE grant)
DO $$
DECLARE
  fn_name TEXT;
  fn_names TEXT[] := ARRAY[
    'award_uploader_on_download',
    'award_uploader_on_like',
    'check_and_inc_ip_limit',
    'check_rate_limits',
    'community_wordlists_recount_likes',
    'dynamic_lexicon_record',
    'enqueue_process_report',
    'generate_friend_code',
    'handle_new_user',
    'increment_cache_hit',
    'reconcile_plan_from_sources',
    'refund_image_extract_quota',
    'rls_auto_enable',
    'set_username',
    'sync_community_uploader_name',
    'try_consume_image_extract_quota',
    'tts_cache_bump',
    'username_available'
  ];
  args TEXT;
BEGIN
  FOREACH fn_name IN ARRAY fn_names LOOP
    FOR args IN
      SELECT pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', fn_name, args);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', fn_name, args);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', fn_name, args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', fn_name, args);
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- Part C: tts bucket — drop broad SELECT policy, keep public reads
--
-- The bucket itself stays public (bucket.public = TRUE), so direct
-- file fetch via the /storage/v1/object/public/tts/... CDN URL still
-- works without any SELECT policy on storage.objects.
--
-- Dropping the policy removes the .list() capability that splinter
-- flags — clients cannot enumerate the bucket anymore, but they can
-- still play any cached MP3 they have the URL for.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tts public read" ON storage.objects;

COMMIT;
