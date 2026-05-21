-- Community wordlist feed must hide uploads from users the viewer has
-- blocked. App Store Guideline 1.2 (UGC) requires the ability to block
-- abusive users from the service; the feed level is the highest-leverage
-- place to enforce that, since friend-based block alone doesn't help
-- when the offender isn't (and likely won't be) a friend.

DROP POLICY IF EXISTS "community_wordlists_read" ON community_wordlists;

CREATE POLICY "community_wordlists_read"
  ON community_wordlists FOR SELECT
  USING (
    is_active
    AND NOT EXISTS (
      SELECT 1 FROM friend_blocks
      WHERE blocker_id = auth.uid()
        AND blocked_id = community_wordlists.user_id
    )
  );
