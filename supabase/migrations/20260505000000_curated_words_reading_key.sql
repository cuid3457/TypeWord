-- Polysemy split: characters with multiple readings (e.g. 长 cháng / zhǎng) need
-- to coexist as separate entries in a curated wordlist so each reading gets its
-- own meanings, examples, and TTS pronunciation. The previous UNIQUE on
-- (curated_wordlist_id, word) collapsed them.
--
-- reading_key '' (empty string) = no disambiguation needed (the default).
-- Polysemous entries set reading_key to a stable lower-ascii tag like 'chang',
-- 'zhang', 'hai', 'huan' so the row identity survives re-curation.

ALTER TABLE curated_words
  ADD COLUMN IF NOT EXISTS reading_key TEXT NOT NULL DEFAULT '';

-- Drop the old UNIQUE on (curated_wordlist_id, word) regardless of its
-- auto-generated name, then add the wider UNIQUE that includes reading_key.
DO $$
DECLARE
  conname_to_drop TEXT;
BEGIN
  SELECT con.conname INTO conname_to_drop
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  WHERE cls.relname = 'curated_words'
    AND con.contype = 'u'
    AND con.conname <> 'curated_words_unique_word_reading'
    AND (
      SELECT array_agg(att.attname::text ORDER BY att.attname::text)
      FROM unnest(con.conkey) AS k
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
    ) = ARRAY['curated_wordlist_id', 'word']::text[]
  LIMIT 1;
  IF conname_to_drop IS NOT NULL THEN
    EXECUTE 'ALTER TABLE curated_words DROP CONSTRAINT ' || quote_ident(conname_to_drop);
  END IF;
END $$;

ALTER TABLE curated_words
  ADD CONSTRAINT curated_words_unique_word_reading
  UNIQUE (curated_wordlist_id, word, reading_key);

-- Mirror the same change on user_words so curated polysemy entries can sync
-- without collapsing back to a single row. The unique index moves from
-- (user_id, COALESCE(book_id), word) → (user_id, COALESCE(book_id), word, reading_key).
ALTER TABLE public.user_words
  ADD COLUMN IF NOT EXISTS reading_key TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS public.idx_user_words_unique;
CREATE UNIQUE INDEX idx_user_words_unique
  ON public.user_words(
    user_id,
    COALESCE(book_id, '00000000-0000-0000-0000-000000000000'::uuid),
    word,
    reading_key
  );
