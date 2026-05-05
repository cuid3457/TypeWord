-- Add a fuzzy fallback to lexicon_classify_phrase so near-variants of known
-- idioms/proverbs (e.g. "don't count your chickens before they hatch" vs
-- the canonical "...before they're hatched", or 발 없는 말이 천리 간다 vs
-- 발 없는 말이 천 리 간다) still classify as known fixed expressions.
--
-- The fuzzy fallback runs only after exact phrase / slang / dynamic lookups
-- miss, and only returns the single closest trigram match with similarity
-- ≥ 0.5. The edge function's hint then tells the AI to normalize the input
-- to the canonical form returned here.

DROP FUNCTION IF EXISTS public.lexicon_classify_phrase(text, text);

CREATE OR REPLACE FUNCTION public.lexicon_classify_phrase(
  p_language TEXT,
  p_normalized TEXT
) RETURNS TABLE(
  source TEXT,        -- 'phrase' | 'slang' | 'dynamic' | 'phrase_fuzzy' | NULL
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
  v_fuzzy_phrase TEXT;
  v_fuzzy_cat TEXT;
  v_fuzzy_sim FLOAT;
BEGIN
  -- 1. Exact phrase
  SELECT phrase, pl.category INTO v_phrase, v_phrase_cat
    FROM phrase_lexicon pl
   WHERE language = p_language AND normalized_phrase = p_normalized
   LIMIT 1;
  IF v_phrase IS NOT NULL THEN
    RETURN QUERY SELECT 'phrase'::TEXT, v_phrase, v_phrase_cat;
    RETURN;
  END IF;

  -- 2. Exact slang (multi-token only)
  SELECT term, sl.category INTO v_slang_term, v_slang_category
    FROM slang_lexicon sl
   WHERE language = p_language AND normalized_term = p_normalized AND is_phrase
   LIMIT 1;
  IF v_slang_term IS NOT NULL THEN
    RETURN QUERY SELECT 'slang'::TEXT, v_slang_term, v_slang_category;
    RETURN;
  END IF;

  -- 3. Exact dynamic
  SELECT input INTO v_dyn_form
    FROM dynamic_lexicon
   WHERE language = p_language AND normalized_input = p_normalized AND is_phrase
   LIMIT 1;
  IF v_dyn_form IS NOT NULL THEN
    RETURN QUERY SELECT 'dynamic'::TEXT, v_dyn_form, NULL::TEXT;
    RETURN;
  END IF;

  -- 4. Fuzzy phrase: closest trigram match with similarity ≥ 0.5.
  -- The pg_trgm `%` operator already filters by the global similarity
  -- threshold (set to 0.5 in the trgm migration), but we also order by
  -- explicit similarity() and keep an explicit ≥ 0.5 guard for clarity.
  SELECT phrase, pl.category, similarity(normalized_phrase, p_normalized) AS sim
    INTO v_fuzzy_phrase, v_fuzzy_cat, v_fuzzy_sim
    FROM phrase_lexicon pl
   WHERE language = p_language
     AND normalized_phrase % p_normalized
   ORDER BY sim DESC
   LIMIT 1;
  IF v_fuzzy_phrase IS NOT NULL AND v_fuzzy_sim >= 0.5 THEN
    RETURN QUERY SELECT 'phrase_fuzzy'::TEXT, v_fuzzy_phrase, v_fuzzy_cat;
    RETURN;
  END IF;

  -- 5. Miss
  RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lexicon_classify_phrase TO service_role, authenticated, anon;
