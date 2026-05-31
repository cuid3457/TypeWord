-- Multilingual translations extracted from kaikki wiktextract dumps.
-- Each row = one (source_word, source_lang) → (target_word, target_lang)
-- mapping. Symmetric: a single table serves both
--   forward lookup (dog → 개)            via (source_word, source_lang, target_lang)
--   reverse lookup (개 → dog)            via (target_word, target_lang) with optional source_lang filter
-- which is what enables dict-first reverse lookup for en/es/fr/de/it native
-- users. Other native langs (ko/ja/zh) use their own dicts (krdict/JMdict/
-- cedict) — this table is wiktionary-sourced only.
--
-- Why a separate table rather than a JSONB column on wiktionary_entries:
--   (a) wiktionary_entries has 3.65M rows including inflections; translations
--       only apply to ~1.26M lemmas. JSONB on the wide table would waste
--       storage on inflections + complicate the polymorphic schema.
--   (b) Reverse lookup index (target_lang, target_word) is unrelated to
--       wiktionary_entries' (word, lang) primary access pattern. Separate
--       index → no interference with forward dict latency.
--   (c) Translations re-import doesn't need to touch wiktionary_entries —
--       can rebuild this table independently without locking the main dict.

BEGIN;

CREATE TABLE IF NOT EXISTS wiktionary_translations (
  id BIGSERIAL PRIMARY KEY,
  source_word TEXT NOT NULL,           -- lowercased headword
  source_lang TEXT NOT NULL,           -- 'en'|'es'|'fr'|'de'|'it' (kaikki source wiktionary)
  source_pos TEXT,                     -- 'noun'|'verb'|... (helps polysemy disambiguation)
  source_etymology_number INTEGER,     -- match wiktionary_entries.etymology_number
  target_lang TEXT NOT NULL,           -- 'ko'|'ja'|'zh-CN'|'es'|'fr'|'de'|'it'|'en'
  target_word TEXT NOT NULL,           -- '개' / 'chien' / 'Hund' (NOT lowercased — preserves Korean/Chinese/Japanese capitalization where applicable)
  sense_hint TEXT,                     -- e.g. 'animal' / 'contemptible person' — used by reverse verifier
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Forward lookup: source_word + source_lang + target_lang
-- Used when a learner looks up an en word and asks for the ko translation.
CREATE INDEX IF NOT EXISTS idx_wikt_trans_forward
  ON wiktionary_translations (source_word, source_lang, target_lang);

-- Reverse lookup: target_lang + target_word
-- Used when a learner types in their native lang and asks for study-lang candidates.
-- target_word kept case-preserved; reverse lookup must compare on normalized form
-- in the Edge Function (NFC + trim).
CREATE INDEX IF NOT EXISTS idx_wikt_trans_reverse
  ON wiktionary_translations (target_lang, target_word, source_lang);

COMMENT ON TABLE wiktionary_translations IS
  'Multi-lingual translations parsed from kaikki wiktextract (CC BY-SA 4.0). One row per (source_word, source_lang) → (target_word, target_lang). Serves forward and reverse dict-first lookup for en/es/fr/de/it native users.';

COMMIT;
