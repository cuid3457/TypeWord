-- One-time data scrub: remove ** markers from every example translation
-- across all server-side word data. The prompt no longer requires markers
-- in translations (they cause more breakage than they help on inflected
-- target languages), so existing rows still carry stale ** that the client
-- has been stripping at render time. Scrubbing the data lets us drop the
-- defensive client-side replace later and keeps re-curation cheap.
--
-- Tables touched:
--   • global_word_cache.result                  — single result object
--   • curated_words.results_by_target_lang      — object keyed by lang → result
--   • community_wordlists.words                 — array of { word, readingKey, result }
-- Source-sentence markers are KEPT (still required by the new prompt).

-- ── helper: scrub `examples[].translation` inside a single result object ──
CREATE OR REPLACE FUNCTION strip_translation_markers_in_result(j jsonb) RETURNS jsonb AS $$
DECLARE
  examples jsonb;
  cleaned  jsonb;
BEGIN
  IF j IS NULL OR jsonb_typeof(j) <> 'object' THEN RETURN j; END IF;
  examples := j -> 'examples';
  IF examples IS NULL OR jsonb_typeof(examples) <> 'array' THEN RETURN j; END IF;

  SELECT jsonb_agg(
    CASE
      WHEN ex ? 'translation' AND jsonb_typeof(ex -> 'translation') = 'string'
        THEN jsonb_set(ex, '{translation}', to_jsonb(replace(ex ->> 'translation', '**', '')))
      ELSE ex
    END
  )
  INTO cleaned
  FROM jsonb_array_elements(examples) AS ex;

  RETURN jsonb_set(j, '{examples}', COALESCE(cleaned, '[]'::jsonb));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── global_word_cache ──────────────────────────────────────────
-- Cheap WHERE filter: skip rows whose stringified examples don't contain **.
UPDATE global_word_cache
   SET result = strip_translation_markers_in_result(result)
 WHERE result -> 'examples' IS NOT NULL
   AND (result -> 'examples')::text LIKE '%**%';

-- ── curated_words ──────────────────────────────────────────────
-- results_by_target_lang is { "ko": {…}, "en": {…} }. Walk each lang.
UPDATE curated_words
   SET results_by_target_lang = (
     SELECT jsonb_object_agg(lang_key, strip_translation_markers_in_result(lang_value))
       FROM jsonb_each(results_by_target_lang) AS t(lang_key, lang_value)
   )
 WHERE results_by_target_lang::text LIKE '%**%';

-- ── community_wordlists ────────────────────────────────────────
-- words is array of { word, readingKey, result }.
UPDATE community_wordlists
   SET words = (
     SELECT jsonb_agg(
       CASE
         WHEN w ? 'result'
           THEN jsonb_set(w, '{result}', strip_translation_markers_in_result(w -> 'result'))
         ELSE w
       END
     )
       FROM jsonb_array_elements(words) AS w
   )
 WHERE words::text LIKE '%**%';
