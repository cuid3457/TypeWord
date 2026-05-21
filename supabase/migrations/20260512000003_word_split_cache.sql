-- ============================================================
-- Split word cache: canonical word data (word_entries) and
-- per-target-language translations (word_translations).
--
-- Motivation:
--   global_word_cache is keyed by (word, source_lang, target_lang),
--   so "apple|en-ko" and "apple|en-ja" cache as separate rows.
--   Each one triggers an LLM call and produces independent
--   examples — the example sentence for "apple" is regenerated for
--   every target language, leading to drift.
--
-- This migration introduces a 2-layer model:
--   word_entries       — canonical, target-agnostic data
--                        (headword, IPA, reading, gender, meanings
--                         written in WORD_LANG, examples written in
--                         WORD_LANG only). One row per (word, word_lang).
--   word_translations  — per-pair translation layer
--                        (each meaning's definition in target_lang,
--                         each example sentence's translation in
--                         target_lang). One row per (word_entry_id,
--                         target_lang).
--
-- Both tables run alongside global_word_cache. Cutover is by edge-
-- function routing; no destructive change to the existing cache.
-- ============================================================

-- ---- word_entries: canonical word data ----
CREATE TABLE public.word_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalized input (lowercased, trimmed). One canonical row per
  -- (word, word_lang); the same source word looked up against any
  -- target reuses this row.
  word            TEXT NOT NULL,
  word_lang       TEXT NOT NULL,

  -- AI output (canonical, written in word_lang).
  headword        TEXT NOT NULL,
  -- IPA: Latin-script European languages only (en/es/fr/de/it/pt).
  ipa             TEXT,
  -- Reading: CJK only. Array of strings (multiple readings for
  -- polyphone single chars; one joined string for compounds).
  reading         JSONB,
  -- Confidence 0-100 from the AI's recognition assessment.
  confidence      INT NOT NULL DEFAULT 100,
  -- Rejection note when meanings is empty (sentence/non_word/wrong_language).
  note            TEXT,
  -- Echo of the raw input (used to surface "did you mean X" correction).
  original_input  TEXT,

  -- Meanings written in word_lang (the canonical source of truth).
  -- Shape: [{ definition, partOfSpeech, relevanceScore, gender? }]
  meanings        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Synonyms/antonyms — words in word_lang (target-agnostic).
  synonyms        TEXT[] NOT NULL DEFAULT '{}',
  antonyms        TEXT[] NOT NULL DEFAULT '{}',
  -- Examples with source sentence in word_lang ONLY (no translation
  -- field). Shape: [{ sentence, meaning_index }]. Translation lives
  -- in word_translations, keyed by example index.
  -- Populated by ANALYZE_ENRICH (separate from QUICK).
  examples        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Enrichment status flag. False when only QUICK has run (meanings/
  -- IPA/reading only). True after ANALYZE_ENRICH has populated
  -- examples + synonyms + antonyms. Used by edge function to decide
  -- whether to call ANALYZE_ENRICH when user adds the word.
  -- Distinguishes "not enriched yet" from "enriched but legitimately
  -- empty" (e.g. slurs where shouldForceEmptyExamples=true).
  has_enrich      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Lineage / cost tracking.
  model           TEXT NOT NULL,
  prompt_version  TEXT NOT NULL DEFAULT 'v1',
  hit_count       INT NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- (word, word_lang) uniquely identifies a canonical entry.
  UNIQUE (word, word_lang)
);

CREATE INDEX idx_word_entries_word ON public.word_entries(word, word_lang);
CREATE INDEX idx_word_entries_lookup ON public.word_entries(word_lang, word) WHERE note IS NULL;

-- ---- word_translations: per-pair translation layer ----
CREATE TABLE public.word_translations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_entry_id   UUID NOT NULL REFERENCES public.word_entries(id) ON DELETE CASCADE,
  target_lang     TEXT NOT NULL,

  -- meanings_translated parallels word_entries.meanings (same order).
  -- Shape: [{ definition, partOfSpeech }] in target_lang.
  -- gender/relevanceScore come from word_entries.meanings (no need
  -- to duplicate target-agnostic fields here).
  meanings_translated  JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- examples_translated parallels word_entries.examples (same order).
  -- Shape: [{ translation }] in target_lang. Plain prose, no ** markers
  -- (markers belong on the source sentence only per design).
  examples_translated  JSONB NOT NULL DEFAULT '[]'::jsonb,

  model           TEXT NOT NULL,
  prompt_version  TEXT NOT NULL DEFAULT 'v1',
  hit_count       INT NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (word_entry_id, target_lang)
);

CREATE INDEX idx_word_translations_lookup ON public.word_translations(word_entry_id, target_lang);

-- ---- updated_at triggers (preserve client timestamps when no real change) ----
CREATE OR REPLACE FUNCTION public.touch_word_entries_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_word_entries_updated_at
  BEFORE UPDATE ON public.word_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_word_entries_updated_at();

CREATE OR REPLACE FUNCTION public.touch_word_translations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_word_translations_updated_at
  BEFORE UPDATE ON public.word_translations
  FOR EACH ROW EXECUTE FUNCTION public.touch_word_translations_updated_at();

-- ---- Hit counter RPCs (single-statement bumps, fire-and-forget from edge) ----
CREATE OR REPLACE FUNCTION public.increment_word_entry_hit(p_id UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.word_entries SET hit_count = hit_count + 1 WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_word_translation_hit(p_id UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.word_translations SET hit_count = hit_count + 1 WHERE id = p_id;
$$;

-- ---- RLS: both tables are read-only for authenticated users,
-- writes via service role (edge function) only ----
ALTER TABLE public.word_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "word_entries: anyone may read"
  ON public.word_entries FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "word_translations: anyone may read"
  ON public.word_translations FOR SELECT TO authenticated, anon USING (true);

-- Service role writes — no explicit policy needed; service_role bypasses RLS.
