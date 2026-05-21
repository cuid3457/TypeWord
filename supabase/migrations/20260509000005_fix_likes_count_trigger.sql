-- Fix likes_count never incrementing.
--
-- The community_wordlists_recount_likes trigger (from migration
-- 20260507000000) issues an UPDATE on community_wordlists. When the
-- direct-UPDATE RLS policy was DROPped in migration 20260509000004 to
-- force edits through the moderation edge function, the trigger lost its
-- ability to update likes_count: it runs with the inserter's role (the
-- liker), and authenticated has no UPDATE policy on community_wordlists.
-- Result: every like INSERT silently fails to bump the counter, so
-- likes_count stays 0 forever.
--
-- Fix: re-declare the trigger function with SECURITY DEFINER so it runs
-- as the function owner (postgres) and bypasses RLS for the counter
-- maintenance UPDATE. The counter is bookkeeping, not user-facing data
-- ownership, so DEFINER-mode is the correct posture.

CREATE OR REPLACE FUNCTION community_wordlists_recount_likes() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE community_wordlists SET likes_count = likes_count + 1 WHERE id = NEW.wordlist_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE community_wordlists SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.wordlist_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Backfill: recompute likes_count for all rows from the actual likes table
-- so existing wordlists show their real count after the trigger starts
-- working. Without this, all rows that received likes during the broken
-- window would display 0 even though the like rows exist.
UPDATE community_wordlists cw
   SET likes_count = COALESCE(c.cnt, 0)
  FROM (
    SELECT wordlist_id, COUNT(*)::INT AS cnt
      FROM community_wordlist_likes
     GROUP BY wordlist_id
  ) c
 WHERE c.wordlist_id = cw.id;
