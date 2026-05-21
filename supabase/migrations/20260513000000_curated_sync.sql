-- Curated wordlist sync state.
-- Adds two columns + triggers so clients can detect when a curated wordlist's
-- content changed and pull only the diff (e.g. IPA backfill, example
-- improvements). Without this, the local copy is a one-shot snapshot from
-- import time and never refreshes.
--
-- Server side:
--   curated_wordlists.content_version : monotonically bumped whenever any
--     curated_words row in the list is inserted/updated/deleted. Cheap to
--     query (one int per list) for the "anything new?" check.
--   curated_words.updated_at          : per-row timestamp so the client can
--     fetch ONLY rows changed since its last sync, not the whole list.
--
-- Client side (separate local SQLite migration V18) tracks
-- (curated_wordlist_id, content_version, last_synced_at) on each book.

ALTER TABLE curated_wordlists
  ADD COLUMN content_version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE curated_words
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX idx_curated_words_wordlist_updated
  ON curated_words(curated_wordlist_id, updated_at);

-- BEFORE trigger: stamp updated_at on every INSERT/UPDATE.
CREATE OR REPLACE FUNCTION stamp_curated_words_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_curated_words_stamp_updated
  BEFORE INSERT OR UPDATE ON curated_words
  FOR EACH ROW EXECUTE FUNCTION stamp_curated_words_updated_at();

-- AFTER trigger: bump parent wordlist's content_version on any change.
-- The pre-existing trg_curated_words_count handled INSERT/DELETE only and
-- updated word_count; this one also covers UPDATE and bumps the version
-- counter that the client polls.
CREATE OR REPLACE FUNCTION bump_curated_wordlist_version() RETURNS TRIGGER AS $$
DECLARE
  list_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    list_id := OLD.curated_wordlist_id;
  ELSE
    list_id := NEW.curated_wordlist_id;
  END IF;
  UPDATE curated_wordlists
    SET content_version = content_version + 1, updated_at = NOW()
    WHERE id = list_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_curated_words_bump_version
  AFTER INSERT OR UPDATE OR DELETE ON curated_words
  FOR EACH ROW EXECUTE FUNCTION bump_curated_wordlist_version();

-- Seed: bump version once so first-sync clients (which start at
-- locally-stored content_version = 0) detect a delta and pull the current
-- snapshot — covers the IPA backfill that happened before this migration.
UPDATE curated_wordlists SET content_version = content_version + 1;
