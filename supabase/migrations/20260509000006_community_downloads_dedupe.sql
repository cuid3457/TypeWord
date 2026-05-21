-- Dedupe download counter per (user, wordlist).
--
-- Before: every call to community_wordlist_increment_downloads bumped
-- downloads_count, so a user re-downloading the same wordlist multiple
-- times inflated the counter. The number stopped reflecting "unique
-- downloaders" and just measured raw button presses.
-- After: a download tracking table records (user_id, wordlist_id) with a
-- composite PK; the counter only increments when an INSERT actually
-- happens (i.e., this is the user's first download of that wordlist).
-- Re-downloads still succeed locally (download flow is untouched), they
-- just don't bump the counter again.

CREATE TABLE IF NOT EXISTS community_wordlist_downloads (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wordlist_id  UUID NOT NULL REFERENCES community_wordlists(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, wordlist_id)
);

CREATE INDEX IF NOT EXISTS idx_community_wordlist_downloads_wordlist
  ON community_wordlist_downloads (wordlist_id);

ALTER TABLE community_wordlist_downloads ENABLE ROW LEVEL SECURITY;

-- Users can see their own download history (useful later for "already
-- downloaded" UI). All inserts/deletes are gated through the RPC so no
-- write policies are exposed to authenticated.
CREATE POLICY "community_wordlist_downloads_read_own"
  ON community_wordlist_downloads FOR SELECT
  USING (auth.uid() = user_id);

-- Replace the RPC to dedupe per user.
CREATE OR REPLACE FUNCTION community_wordlist_increment_downloads(p_wordlist_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_inserted BOOLEAN := FALSE;
BEGIN
  -- Anonymous callers don't get tracked or counted.
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Record this user's download. ON CONFLICT keeps the original row so
  -- the counter only bumps on the first download per (user, wordlist).
  INSERT INTO community_wordlist_downloads (user_id, wordlist_id)
  VALUES (v_user_id, p_wordlist_id)
  ON CONFLICT (user_id, wordlist_id) DO NOTHING
  RETURNING TRUE INTO v_inserted;

  IF v_inserted THEN
    UPDATE community_wordlists
       SET downloads_count = downloads_count + 1
     WHERE id = p_wordlist_id AND is_active;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION community_wordlist_increment_downloads(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION community_wordlist_increment_downloads(UUID) TO authenticated, anon;
