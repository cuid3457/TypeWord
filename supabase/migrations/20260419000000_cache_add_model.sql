-- Add model column to global_word_cache so we can invalidate cache per model.
ALTER TABLE public.global_word_cache
  ADD COLUMN IF NOT EXISTS model TEXT;

CREATE INDEX IF NOT EXISTS idx_cache_model ON public.global_word_cache(model);
