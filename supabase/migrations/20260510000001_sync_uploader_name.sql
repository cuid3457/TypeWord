-- Keep community_wordlists.uploader_name in sync with profiles.display_name.
--
-- The column was originally a snapshot taken at upload time. When a user
-- changes their display_name, every community wordlist they uploaded should
-- reflect the new name immediately (otherwise other users keep seeing the
-- old @ in the library list).
--
-- Strategy: AFTER UPDATE trigger on profiles.display_name. The trigger only
-- fires when the column actually changes, so it's a no-op for unrelated
-- updates. A one-time backfill aligns existing rows to the current
-- display_name so users with stale uploader_name from before this migration
-- get fixed in the same transaction.

CREATE OR REPLACE FUNCTION sync_community_uploader_name() RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.display_name, '') IS DISTINCT FROM COALESCE(OLD.display_name, '') THEN
    UPDATE community_wordlists
       SET uploader_name = NEW.display_name
     WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_sync_uploader_name ON profiles;
CREATE TRIGGER profiles_sync_uploader_name
  AFTER UPDATE OF display_name ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_community_uploader_name();

-- Backfill: align any pre-existing stale uploader_name with the current
-- display_name. Skips rows that already match (cheap NULL-safe compare).
UPDATE community_wordlists cw
   SET uploader_name = p.display_name
  FROM profiles p
 WHERE cw.user_id = p.user_id
   AND COALESCE(cw.uploader_name, '') IS DISTINCT FROM COALESCE(p.display_name, '');
