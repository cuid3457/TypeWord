-- Force community wordlist uploads to go through the community-upload edge
-- function so moderation (OpenAI Moderation API + keyword blocklist) cannot
-- be bypassed by hitting PostgREST directly.
--
-- Before: authenticated users could INSERT directly via
--   POST /rest/v1/community_wordlists  with WITH CHECK (auth.uid()=user_id)
-- After: only service_role (used by the edge function after moderation
-- passes) may INSERT. authenticated users still SELECT/UPDATE/DELETE their
-- own rows for browsing + later edits + soft-delete.
--
-- Also tightens the UPDATE policy with WITH CHECK so a future edit flow
-- can't change ownership or reactivate moderator-disabled rows by re-
-- toggling is_active.

DROP POLICY IF EXISTS "community_wordlists_insert_own" ON community_wordlists;

-- New UPDATE policy: keep ownership, prevent re-activating a moderator-
-- disabled row from the client. is_active flips require service_role.
DROP POLICY IF EXISTS "community_wordlists_update_own" ON community_wordlists;
CREATE POLICY "community_wordlists_update_own"
  ON community_wordlists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND is_active = (SELECT cw.is_active FROM community_wordlists cw WHERE cw.id = community_wordlists.id)
  );
