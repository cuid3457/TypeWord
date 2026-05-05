-- Add pg_trgm-based fuzzy match indexes on lexicon tables for typo suggestion
-- (Layer 3 of the word-lookup pipeline). Used by lexicon_suggest_word RPC.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- Trigram GIN indexes power the % similarity operator. Per-language partial
-- indexes keep each index small and lookup fast.
CREATE INDEX idx_word_lexicon_trgm   ON word_lexicon   USING GIN (normalized_word gin_trgm_ops);
CREATE INDEX idx_phrase_lexicon_trgm ON phrase_lexicon USING GIN (normalized_phrase gin_trgm_ops);
CREATE INDEX idx_slang_lexicon_trgm  ON slang_lexicon  USING GIN (normalized_term gin_trgm_ops);

-- Lower the similarity threshold for the % operator. Default 0.3 is too permissive;
-- 0.5 reduces noise. We override per-query when needed.
SELECT set_limit(0.5);

-- ── RPC: classify a single-token input against the static lexicons ───────────
-- Returns classification + canonical form + suggestion candidates.
-- Used by the word-lookup edge function before calling OpenAI.
CREATE OR REPLACE FUNCTION lexicon_classify_single(
  p_language TEXT,
  p_normalized TEXT
) RETURNS TABLE(
  source TEXT,           -- 'word' | 'slang' | 'dynamic' | NULL
  matched_form TEXT,
  category TEXT,         -- slang category if from slang_lexicon
  suggestions TEXT[]
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_word TEXT;
  v_slang_term TEXT;
  v_slang_category TEXT;
  v_dyn_form TEXT;
  v_suggestions TEXT[];
BEGIN
  -- 1. Direct hits
  SELECT word INTO v_word
    FROM word_lexicon
   WHERE language = p_language AND normalized_word = p_normalized
   LIMIT 1;

  IF v_word IS NOT NULL THEN
    RETURN QUERY SELECT 'word'::TEXT, v_word, NULL::TEXT, NULL::TEXT[];
    RETURN;
  END IF;

  SELECT term, sl.category INTO v_slang_term, v_slang_category
    FROM slang_lexicon sl
   WHERE language = p_language AND normalized_term = p_normalized
   LIMIT 1;

  IF v_slang_term IS NOT NULL THEN
    RETURN QUERY SELECT 'slang'::TEXT, v_slang_term, v_slang_category, NULL::TEXT[];
    RETURN;
  END IF;

  SELECT input INTO v_dyn_form
    FROM dynamic_lexicon
   WHERE language = p_language AND normalized_input = p_normalized AND NOT is_phrase
   LIMIT 1;

  IF v_dyn_form IS NOT NULL THEN
    RETURN QUERY SELECT 'dynamic'::TEXT, v_dyn_form, NULL::TEXT, NULL::TEXT[];
    RETURN;
  END IF;

  -- 2. Miss — gather typo suggestions via trigram similarity (Latin scripts only;
  -- CJK input typos are handled separately by the edge function).
  SELECT ARRAY(
    SELECT word FROM (
      SELECT word, similarity(normalized_word, p_normalized) AS sim
        FROM word_lexicon
       WHERE language = p_language
         AND normalized_word % p_normalized
       ORDER BY sim DESC
       LIMIT 5
    ) s
  ) INTO v_suggestions;

  RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TEXT, v_suggestions;
END;
$$;

GRANT EXECUTE ON FUNCTION lexicon_classify_single TO service_role, authenticated, anon;

-- ── RPC: classify a multi-token (phrase) input ───────────────────────────────
CREATE OR REPLACE FUNCTION lexicon_classify_phrase(
  p_language TEXT,
  p_normalized TEXT
) RETURNS TABLE(
  source TEXT,           -- 'phrase' | 'slang' | 'dynamic' | NULL
  matched_form TEXT,
  category TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_phrase TEXT;
  v_phrase_cat TEXT;
  v_slang_term TEXT;
  v_slang_category TEXT;
  v_dyn_form TEXT;
BEGIN
  SELECT phrase, pl.category INTO v_phrase, v_phrase_cat
    FROM phrase_lexicon pl
   WHERE language = p_language AND normalized_phrase = p_normalized
   LIMIT 1;

  IF v_phrase IS NOT NULL THEN
    RETURN QUERY SELECT 'phrase'::TEXT, v_phrase, v_phrase_cat;
    RETURN;
  END IF;

  SELECT term, sl.category INTO v_slang_term, v_slang_category
    FROM slang_lexicon sl
   WHERE language = p_language AND normalized_term = p_normalized AND is_phrase
   LIMIT 1;

  IF v_slang_term IS NOT NULL THEN
    RETURN QUERY SELECT 'slang'::TEXT, v_slang_term, v_slang_category;
    RETURN;
  END IF;

  SELECT input INTO v_dyn_form
    FROM dynamic_lexicon
   WHERE language = p_language AND normalized_input = p_normalized AND is_phrase
   LIMIT 1;

  IF v_dyn_form IS NOT NULL THEN
    RETURN QUERY SELECT 'dynamic'::TEXT, v_dyn_form, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION lexicon_classify_phrase TO service_role, authenticated, anon;
