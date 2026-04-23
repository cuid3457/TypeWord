-- Cache update propagation: when admin fixes a cache entry, propagate to all users' words.

-- Batch check: find user's words where the global cache has been updated since last check.
-- Called during sync for logged-in users.
CREATE OR REPLACE FUNCTION check_word_updates(p_user_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE (word_id UUID, cache_result JSONB, cache_mode TEXT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT DISTINCT ON (uw.id, split_part(c.cache_key, '|', 3))
    uw.id,
    c.result,
    split_part(c.cache_key, '|', 3)
  FROM user_words uw
  JOIN books b ON b.id = uw.book_id AND b.user_id = p_user_id
  JOIN global_word_cache c
    ON c.word = lower(uw.word)
    AND c.source_lang = b.source_lang
    AND c.target_lang = COALESCE(b.target_lang, b.source_lang)
    AND c.updated_at > p_since
  WHERE uw.user_id = p_user_id
  ORDER BY uw.id, split_part(c.cache_key, '|', 3)
  LIMIT 200
$$;

-- Single-word freshness check: used on word display for immediate updates.
-- Accessible to both anonymous and authenticated users.
CREATE OR REPLACE FUNCTION check_word_freshness(
  p_word TEXT,
  p_source_lang TEXT,
  p_target_lang TEXT,
  p_since TIMESTAMPTZ
)
RETURNS TABLE (cache_result JSONB, cache_mode TEXT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT result, split_part(cache_key, '|', 3)
  FROM global_word_cache
  WHERE word = lower(p_word)
    AND source_lang = p_source_lang
    AND target_lang = p_target_lang
    AND updated_at > p_since
$$;

GRANT EXECUTE ON FUNCTION check_word_updates TO authenticated;
GRANT EXECUTE ON FUNCTION check_word_freshness TO anon, authenticated;
