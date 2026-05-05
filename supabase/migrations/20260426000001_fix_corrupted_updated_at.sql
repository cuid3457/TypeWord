-- ============================================================
-- One-off data cleanup: restore user_words.updated_at for rows
-- corrupted by the (now-fixed) tg_set_updated_at trigger bug.
--
-- The previous trigger overwrote every UPDATE's updated_at with NOW(),
-- which caused sync round-trips to mark old activity as "today" and
-- broke streak/todayDone calculation. The trigger was fixed in
-- 20260426000000_preserve_client_updated_at.sql.
--
-- This migration restores updated_at = created_at for the dev account's
-- rows that got bumped to 2026-04-26. Safe / no-op on environments
-- where this user doesn't exist or no corrupted rows are present.
-- ============================================================

UPDATE public.user_words
SET updated_at = created_at
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'junesung07@gmail.com'
)
  AND updated_at >= '2026-04-26 00:00:00+00'::timestamptz
  AND updated_at <  '2026-04-27 00:00:00+00'::timestamptz;
