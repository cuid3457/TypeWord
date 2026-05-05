-- Add minute precision to per-wordlist notification times.
-- Default 0 (top of the hour). Range 0-59.

ALTER TABLE public.books ADD COLUMN IF NOT EXISTS notif_minute SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.books
  ADD CONSTRAINT books_notif_minute_range
  CHECK (notif_minute >= 0 AND notif_minute <= 59);
