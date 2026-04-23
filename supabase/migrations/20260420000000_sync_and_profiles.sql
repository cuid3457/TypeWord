-- ============================================================
-- Sync support: align server schema with local SQLite
-- Add profiles table for subscription state
-- ============================================================

-- ---- Profiles (subscription state) ----
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan        TEXT NOT NULL DEFAULT 'free',
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_owner_all" ON public.profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---- Books: add missing columns for sync ----
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS target_lang TEXT;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS bidirectional BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS study_lang TEXT;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- ---- User words: add result_json for full offline data ----
ALTER TABLE public.user_words ADD COLUMN IF NOT EXISTS result_json JSONB;

-- ---- Soft delete support for sync ----
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.user_words ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
