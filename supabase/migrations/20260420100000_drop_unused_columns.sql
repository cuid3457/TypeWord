-- Drop unused columns from books and user_words

ALTER TABLE public.books
  DROP COLUMN IF EXISTS author,
  DROP COLUMN IF EXISTS genre,
  DROP COLUMN IF EXISTS isbn,
  DROP COLUMN IF EXISTS cover_url,
  DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE public.user_words
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS cache_key,
  DROP COLUMN IF EXISTS user_note;
