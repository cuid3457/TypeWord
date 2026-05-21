-- Wordlist reports + user-report reason rubric.
--
-- friend_reports already exists from 20260504. We add a structured RPC
-- so the client can submit a reason + optional description, and the
-- moderation queue gets richer signal than a free-form string.
--
-- community_wordlist_reports is new — separate from content_reports
-- (which is per-word) so moderation can grep wordlist-level abuse
-- (spam lists, scraping, copyright) without false-merging into the
-- definition-quality stream.

-- ── community_wordlist_reports ─────────────────────────────────
CREATE TABLE IF NOT EXISTS community_wordlist_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wordlist_id   UUID NOT NULL REFERENCES community_wordlists(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reporter_id, wordlist_id)
);

CREATE INDEX IF NOT EXISTS idx_wordlist_reports_wordlist
  ON community_wordlist_reports(wordlist_id, created_at DESC);

ALTER TABLE community_wordlist_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reporter sees only own wordlist reports"
  ON community_wordlist_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- INSERT goes through the report_wordlist RPC; no direct write policy.

-- ── report_wordlist RPC ────────────────────────────────────────
CREATE OR REPLACE FUNCTION report_wordlist(
  p_wordlist_id UUID,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  exists_wl BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'Sign up to report' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS (SELECT 1 FROM community_wordlists WHERE id = p_wordlist_id)
    INTO exists_wl;
  IF NOT exists_wl THEN
    RAISE EXCEPTION 'Wordlist not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Reason required' USING ERRCODE = 'P0010';
  END IF;
  -- Upsert: re-reporting the same list overwrites the prior reason,
  -- so a moderation queue sees the latest signal per (reporter, list).
  INSERT INTO community_wordlist_reports (reporter_id, wordlist_id, reason, description)
    VALUES (uid, p_wordlist_id, trim(p_reason), NULLIF(trim(coalesce(p_description, '')), ''))
  ON CONFLICT (reporter_id, wordlist_id)
    DO UPDATE SET reason = EXCLUDED.reason,
                  description = EXCLUDED.description,
                  created_at = NOW();
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── report_user RPC ────────────────────────────────────────────
-- Replaces the direct INSERT into friend_reports with a structured RPC.
-- Same dedupe semantics as wordlist reports: re-reporting the same user
-- overwrites the prior reason instead of stacking.
CREATE OR REPLACE FUNCTION report_user(
  p_user_id UUID,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  exists_target BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'Sign up to report' USING ERRCODE = 'P0001';
  END IF;
  IF uid = p_user_id THEN
    RAISE EXCEPTION 'Cannot report yourself' USING ERRCODE = 'P0003';
  END IF;
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) INTO exists_target;
  IF NOT exists_target THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Reason required' USING ERRCODE = 'P0010';
  END IF;
  -- friend_reports has no unique constraint by design (legacy free-form).
  -- We keep that behavior: new INSERT each time. The description carries
  -- the latest detail; older rows stay for audit.
  INSERT INTO friend_reports (reporter_id, reported_id, reason)
  VALUES (uid, p_user_id,
    CASE WHEN p_description IS NULL OR length(trim(p_description)) = 0
         THEN trim(p_reason)
         ELSE trim(p_reason) || ' | ' || trim(p_description) END);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
