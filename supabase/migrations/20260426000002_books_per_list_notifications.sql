-- Per-wordlist notification settings: enable/disable + reminder hour (0-23 local).
-- NULL hour means "use global preferred hour".

ALTER TABLE public.books ADD COLUMN IF NOT EXISTS notif_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS notif_hour SMALLINT;

ALTER TABLE public.books
  ADD CONSTRAINT books_notif_hour_range
  CHECK (notif_hour IS NULL OR (notif_hour >= 0 AND notif_hour <= 23));
