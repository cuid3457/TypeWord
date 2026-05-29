-- Wiktionary (kaikki.org wiktextract) entries for the 5 Latin-script
-- languages that previously hit freedictionaryapi.com live on every lookup
-- (en/es/fr/de/it). Storing them in-DB removes the ~0.4-1.3s external API
-- call from the cache-miss path (measured freedict latency for "paradise":
-- 393-1273ms, highly variable). Mirrors the jmdict/cedict in-DB pattern.
--
-- One row per (word, lang, pos, etymology). A headword with multiple parts
-- of speech or etymologies → multiple rows, matching how freedict.ts already
-- emits one DictEntry per etymology. Inflected forms are included (kaikki
-- emits them as their own entries with form_of senses) so "runs" resolves
-- just like "run".
--
-- Data source: kaikki.org-dictionary-{Language}.jsonl (CC BY-SA 4.0 —
-- attribution already required by freedict, no new license obligation).

BEGIN;

CREATE TABLE IF NOT EXISTS wiktionary_entries (
  id BIGSERIAL PRIMARY KEY,
  word TEXT NOT NULL,               -- headword, stored lowercased for case-insensitive match
  lang TEXT NOT NULL,               -- 'en' | 'es' | 'fr' | 'de' | 'it'
  pos TEXT,                         -- part of speech (noun, verb, adj, ...)
  ipa TEXT,                         -- first IPA pronunciation, if any
  etymology_number INTEGER,         -- disambiguates homographs from different etymologies
  is_lemma BOOLEAN NOT NULL DEFAULT TRUE,  -- false when every sense is a form_of (inflection)
  senses JSONB NOT NULL DEFAULT '[]', -- [{ gloss, examples: [text], tags: [] }]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup: exact (word, lang). word is pre-lowercased on import so the
-- client lowercases the query too. Composite index covers the WHERE clause.
CREATE INDEX IF NOT EXISTS idx_wiktionary_word_lang
  ON wiktionary_entries (word, lang);

COMMENT ON TABLE wiktionary_entries IS
  'Wiktionary (kaikki.org wiktextract) for en/es/fr/de/it. CC BY-SA 4.0. Replaces live freedictionaryapi.com calls. One row per (word,lang,pos,etymology).';

COMMIT;
