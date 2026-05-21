-- Community-uploaded wordlists. Users upload wordlists from their personal
-- library; other users browse, like, and download. Word data is denormalized
-- into a single JSONB blob per wordlist (matching the curated_wordlists shape)
-- so reads stay cheap (no per-word fan-out).

CREATE TABLE IF NOT EXISTS community_wordlists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uploader_name   TEXT,                    -- display name snapshot at upload
  title           TEXT NOT NULL,
  description     TEXT,
  source_lang     TEXT NOT NULL,
  target_lang     TEXT NOT NULL,
  word_count      INTEGER NOT NULL,
  words           JSONB NOT NULL,          -- [{ word, readingKey, result }]
  likes_count     INTEGER NOT NULL DEFAULT 0,
  downloads_count INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_wordlists_likes
  ON community_wordlists (likes_count DESC, created_at DESC) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_community_wordlists_downloads
  ON community_wordlists (downloads_count DESC, created_at DESC) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_community_wordlists_user
  ON community_wordlists (user_id);

-- Per-user like state. Composite PK doubles as the dedup key.
CREATE TABLE IF NOT EXISTS community_wordlist_likes (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wordlist_id  UUID NOT NULL REFERENCES community_wordlists(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, wordlist_id)
);

-- Trigger: keep likes_count consistent with the like table without trusting
-- client-side increments.
CREATE OR REPLACE FUNCTION community_wordlists_recount_likes() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE community_wordlists SET likes_count = likes_count + 1 WHERE id = NEW.wordlist_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE community_wordlists SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.wordlist_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_wordlist_likes_count ON community_wordlist_likes;
CREATE TRIGGER trg_community_wordlist_likes_count
  AFTER INSERT OR DELETE ON community_wordlist_likes
  FOR EACH ROW EXECUTE FUNCTION community_wordlists_recount_likes();

-- updated_at auto-touch on community_wordlists. Skip when client supplies an
-- equal value to keep bidirectional sync happy.
CREATE OR REPLACE FUNCTION community_wordlists_touch_updated() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_wordlists_touch_updated ON community_wordlists;
CREATE TRIGGER trg_community_wordlists_touch_updated
  BEFORE UPDATE ON community_wordlists
  FOR EACH ROW EXECUTE FUNCTION community_wordlists_touch_updated();

-- RLS
ALTER TABLE community_wordlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_wordlist_likes ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous) can read active community wordlists.
CREATE POLICY "community_wordlists_read"
  ON community_wordlists FOR SELECT USING (is_active);

-- Only the uploader can insert / modify / delete their own.
CREATE POLICY "community_wordlists_insert_own"
  ON community_wordlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "community_wordlists_update_own"
  ON community_wordlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "community_wordlists_delete_own"
  ON community_wordlists FOR DELETE USING (auth.uid() = user_id);

-- Likes: read everyone (so we can show who liked what), insert/delete own only.
CREATE POLICY "community_wordlist_likes_read"
  ON community_wordlist_likes FOR SELECT USING (true);
CREATE POLICY "community_wordlist_likes_insert_own"
  ON community_wordlist_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "community_wordlist_likes_delete_own"
  ON community_wordlist_likes FOR DELETE USING (auth.uid() = user_id);

-- RPC: atomic download — increments downloads_count.
CREATE OR REPLACE FUNCTION community_wordlist_increment_downloads(p_wordlist_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE community_wordlists
     SET downloads_count = downloads_count + 1
   WHERE id = p_wordlist_id AND is_active;
END;
$$;

GRANT EXECUTE ON FUNCTION community_wordlist_increment_downloads(UUID) TO authenticated, anon;
