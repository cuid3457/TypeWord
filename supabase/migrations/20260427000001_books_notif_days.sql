-- Per-wordlist notification day-of-week bitmask.
-- Bit 0 = Sunday, bit 1 = Monday, ..., bit 6 = Saturday.
-- Default 127 (binary 1111111) = all days enabled, matching prior behavior.

ALTER TABLE public.books ADD COLUMN IF NOT EXISTS notif_days SMALLINT NOT NULL DEFAULT 127;

ALTER TABLE public.books
  ADD CONSTRAINT books_notif_days_range
  CHECK (notif_days >= 0 AND notif_days <= 127);
