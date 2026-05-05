-- Lexicon system: 4 tables that pre-validate user input across all 11 languages
-- before falling through to OpenAI. Used by word-lookup edge function.
--
--   word_lexicon    — single-token canonical words (Hunspell + CC-CEDICT + JMdict + KR sources)
--   phrase_lexicon  — multi-token fixed expressions (Wiktionary phrasebook + multi-word entries)
--   slang_lexicon   — slang / internet slang / neologisms (Wiktionary slang categories)
--   dynamic_lexicon — auto-populated from AI lookups with confidence ≥ 70 (organic growth)
--
-- All tables are PUBLIC READ for anonymous role (lexicon is non-secret reference data).
-- Writes are restricted to service_role (admin-controlled bulk import + edge function).

-- ── 1. word_lexicon ──────────────────────────────────────────────────────────
CREATE TABLE word_lexicon (
  language        TEXT NOT NULL,
  normalized_word TEXT NOT NULL,
  word            TEXT NOT NULL,
  source          TEXT NOT NULL,
  PRIMARY KEY (language, normalized_word)
);
CREATE INDEX idx_word_lexicon_lookup ON word_lexicon (language, normalized_word);

COMMENT ON TABLE  word_lexicon IS 'Canonical single-token lexicon per language. normalized_word is lowercased + NFKC.';
COMMENT ON COLUMN word_lexicon.source IS 'hunspell-{lang} | cc-cedict | jmdict | wiktionary-{lang} | nikl';

-- ── 2. phrase_lexicon ────────────────────────────────────────────────────────
CREATE TABLE phrase_lexicon (
  language          TEXT NOT NULL,
  normalized_phrase TEXT NOT NULL,
  phrase            TEXT NOT NULL,
  category          TEXT,        -- 'greeting' | 'courtesy' | 'idiom' | 'proverb' | 'mwe'
  source            TEXT NOT NULL,
  PRIMARY KEY (language, normalized_phrase)
);
CREATE INDEX idx_phrase_lexicon_lookup ON phrase_lexicon (language, normalized_phrase);

COMMENT ON TABLE  phrase_lexicon IS 'Multi-token fixed expressions: phrasebook entries + Wiktionary multi-word entries.';
COMMENT ON COLUMN phrase_lexicon.category IS 'mwe = multi-word expression (catch-all for Wiktionary entries without specific phrasebook category)';

-- ── 3. slang_lexicon ─────────────────────────────────────────────────────────
CREATE TABLE slang_lexicon (
  language        TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  term            TEXT NOT NULL,
  is_phrase       BOOLEAN NOT NULL DEFAULT FALSE,
  category        TEXT,          -- 'slang' | 'internet_slang' | 'neologism'
  source          TEXT NOT NULL,
  PRIMARY KEY (language, normalized_term)
);
CREATE INDEX idx_slang_lexicon_lookup ON slang_lexicon (language, normalized_term);

COMMENT ON TABLE slang_lexicon IS 'Slang, internet slang, and neologisms from Wiktionary categories.';
COMMENT ON COLUMN slang_lexicon.is_phrase IS 'TRUE if term contains whitespace (multi-token slang like "no cap"); FALSE if single token like "rizz".';

-- ── 4. dynamic_lexicon ───────────────────────────────────────────────────────
-- Organic growth: every successful AI lookup with confidence ≥ 70 lands here.
-- Used as a "warm cache hint" layer between the static lexicons and AI.
CREATE TABLE dynamic_lexicon (
  language          TEXT NOT NULL,
  normalized_input  TEXT NOT NULL,
  input             TEXT NOT NULL,
  is_phrase         BOOLEAN NOT NULL DEFAULT FALSE,
  ai_confidence     SMALLINT NOT NULL,
  hit_count         INTEGER NOT NULL DEFAULT 1,
  first_seen        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT now(),
  source            TEXT NOT NULL DEFAULT 'ai-resolved',
  PRIMARY KEY (language, normalized_input)
);
CREATE INDEX idx_dynamic_lexicon_lookup ON dynamic_lexicon (language, normalized_input);
-- For analytics: which terms are newly trending?
CREATE INDEX idx_dynamic_lexicon_recent ON dynamic_lexicon (first_seen DESC);

COMMENT ON TABLE dynamic_lexicon IS 'Auto-populated from word-lookup edge function: every AI result with confidence ≥ 70 is recorded here for future hint use and trending analysis.';

-- ── RLS — reference data is public-readable, only service_role writes ────────
ALTER TABLE word_lexicon    ENABLE ROW LEVEL SECURITY;
ALTER TABLE phrase_lexicon  ENABLE ROW LEVEL SECURITY;
ALTER TABLE slang_lexicon   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dynamic_lexicon ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lexicon read public" ON word_lexicon    FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "lexicon read public" ON phrase_lexicon  FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "lexicon read public" ON slang_lexicon   FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "lexicon read public" ON dynamic_lexicon FOR SELECT TO anon, authenticated USING (TRUE);

-- ── RPC: dynamic_lexicon upsert with hit counter increment ───────────────────
-- Atomic upsert: insert if missing, increment hit_count + bump last_seen if exists.
CREATE OR REPLACE FUNCTION dynamic_lexicon_record(
  p_language TEXT,
  p_normalized_input TEXT,
  p_input TEXT,
  p_is_phrase BOOLEAN,
  p_ai_confidence SMALLINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO dynamic_lexicon (language, normalized_input, input, is_phrase, ai_confidence)
  VALUES (p_language, p_normalized_input, p_input, p_is_phrase, p_ai_confidence)
  ON CONFLICT (language, normalized_input) DO UPDATE SET
    hit_count     = dynamic_lexicon.hit_count + 1,
    last_seen     = now(),
    -- Keep the highest confidence ever recorded; AI can vary call-to-call.
    ai_confidence = GREATEST(dynamic_lexicon.ai_confidence, EXCLUDED.ai_confidence);
END;
$$;
GRANT EXECUTE ON FUNCTION dynamic_lexicon_record TO service_role;
