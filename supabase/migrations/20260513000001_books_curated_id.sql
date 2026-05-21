-- Track the source curated wordlist for books that originated from
-- "add HSK 1 to my library" etc. Carries across devices via the regular
-- books push/pull sync; legacy books (imported before this column existed)
-- keep it NULL until the client-side adoption step matches them up by
-- sampling their words against curated_words.
ALTER TABLE books
  ADD COLUMN curated_wordlist_id UUID REFERENCES curated_wordlists(id) ON DELETE SET NULL;

CREATE INDEX idx_books_curated_wordlist
  ON books(curated_wordlist_id)
  WHERE curated_wordlist_id IS NOT NULL;
