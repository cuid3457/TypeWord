-- TTS cache table — stores Azure Neural TTS mp3s keyed by (text, language, gender).
-- Cache hit returns the storage URL immediately (~50-200ms via CDN); miss
-- triggers Azure synthesis + Supabase Storage upload + insert here.
--
-- Why one row per (text, language, gender):
--   - User picks F or M voice in settings; both forms cached separately.
--   - Same word listened by multiple users hits cache after first generation.
--   - Cache hit rate climbs to 90%+ over a few weeks (vocabulary repeats).

CREATE TABLE tts_cache (
  cache_key      TEXT PRIMARY KEY,        -- normalized(text)|language|gender
  text           TEXT NOT NULL,           -- original input
  language       TEXT NOT NULL,           -- 'en' | 'ko' | 'ja' | 'zh-CN' | 'zh-TW' | ...
  gender         CHAR(1) NOT NULL CHECK (gender IN ('M','F')),
  storage_path   TEXT NOT NULL,           -- 'tts/<sha256>.mp3' (relative to bucket)
  byte_size      INTEGER,                 -- mp3 bytes — for cleanup analytics
  hit_count      INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tts_cache_recent ON tts_cache (last_accessed DESC);

COMMENT ON TABLE tts_cache IS 'Cache of synthesized TTS mp3s. service_role-managed; clients only get URL via edge function.';
COMMENT ON COLUMN tts_cache.cache_key IS 'NFC-normalized lowercased text + | + language + | + gender. Stable across whitespace/case variants.';

-- RLS: tts_cache is internal, only the edge function (service_role) writes/reads.
ALTER TABLE tts_cache ENABLE ROW LEVEL SECURITY;
-- No policies = no anon/authenticated access. service_role bypasses RLS.

-- Atomic hit counter bump (called on cache HIT). SECURITY DEFINER so the edge
-- function can call without granting UPDATE on the table to clients.
CREATE OR REPLACE FUNCTION tts_cache_bump(p_key TEXT) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tts_cache
     SET hit_count = hit_count + 1,
         last_accessed = NOW()
   WHERE cache_key = p_key;
END;
$$;

GRANT EXECUTE ON FUNCTION tts_cache_bump TO service_role;

-- ── Storage bucket for mp3s ─────────────────────────────────────────────────
-- Public read so client apps can stream the URL directly without auth headers.
INSERT INTO storage.buckets (id, name, public)
VALUES ('tts', 'tts', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- Public read policy on tts bucket — anyone can fetch an mp3 by URL.
-- (URL itself is unguessable since path is sha256 hash of cache_key.)
DROP POLICY IF EXISTS "tts public read" ON storage.objects;
CREATE POLICY "tts public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'tts');

-- service_role implicitly bypasses RLS for writes; no insert/update policy needed.
