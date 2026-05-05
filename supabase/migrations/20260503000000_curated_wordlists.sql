-- Curated wordlists: pre-built test prep / topic packs that users add to their
-- own wordlist library. Read-only public; populated by an admin script.
--
-- Two-table design:
--   curated_wordlists — list metadata (name, source_lang, exam_type, ...)
--   curated_words     — words in each list, with pre-generated results per
--                       target_lang stored as a JSONB map so a single curated
--                       list serves users learning in multiple languages.

CREATE TABLE curated_wordlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name_i18n JSONB NOT NULL,        -- {"ko": "HSK 1급", "en": "HSK Level 1", ...}
  description_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_lang TEXT NOT NULL,        -- 단어 언어 (e.g., 'zh-CN', 'ko', 'en')
  exam_type TEXT,                   -- 'HSK' | 'TOPIK' | 'AWL' | 'TOEIC' | 'TOEFL' | 'JLPT' | 'IELTS' | NULL for non-exam topics
  level TEXT,                       -- '1' | 'B2' | 'N3', etc.
  category TEXT NOT NULL,           -- 'exam' | 'topic'
  word_count INT NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE curated_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curated_wordlist_id UUID NOT NULL REFERENCES curated_wordlists(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  -- Pre-generated word lookup results, keyed by target_lang. Shape:
  --   { "ko": { meanings: [...], examples: [...], reading: "...", ipa: "...", synonyms: [], antonyms: [] },
  --     "en": { ... } }
  -- A user adding the list in target=ko gets results['ko']; if missing the
  -- client falls back to live word-lookup (slower but always works).
  results_by_target_lang JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curated_wordlist_id, word)
);

CREATE INDEX idx_curated_wordlists_lang_active
  ON curated_wordlists(source_lang, is_active);

CREATE INDEX idx_curated_wordlists_exam
  ON curated_wordlists(exam_type, source_lang)
  WHERE is_active = true;

CREATE INDEX idx_curated_words_wordlist_order
  ON curated_words(curated_wordlist_id, display_order);

-- RLS: read-only public, write only via service_role.
ALTER TABLE curated_wordlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "curated_wordlists are publicly readable when active"
  ON curated_wordlists
  FOR SELECT
  TO authenticated, anon
  USING (is_active);

ALTER TABLE curated_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "curated_words readable when their list is active"
  ON curated_words
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM curated_wordlists w
      WHERE w.id = curated_wordlist_id AND w.is_active
    )
  );

-- Trigger to keep word_count in sync.
CREATE OR REPLACE FUNCTION update_curated_word_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE curated_wordlists SET word_count = word_count + 1, updated_at = NOW()
      WHERE id = NEW.curated_wordlist_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE curated_wordlists SET word_count = GREATEST(0, word_count - 1), updated_at = NOW()
      WHERE id = OLD.curated_wordlist_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_curated_words_count
  AFTER INSERT OR DELETE ON curated_words
  FOR EACH ROW EXECUTE FUNCTION update_curated_word_count();
