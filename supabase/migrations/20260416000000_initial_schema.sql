-- ============================================================
-- Typeword Initial Schema
-- ============================================================
-- Tables: books, global_word_cache, user_words, review_logs, api_calls
-- All user-owned tables use RLS with auth.uid() = user_id
-- Anonymous sign-ins (Supabase Auth) required for Phase 1
-- ============================================================

-- ---- Books ----
CREATE TABLE public.books (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  author         TEXT,
  genre          TEXT,
  source_lang    TEXT NOT NULL,
  isbn           TEXT,
  cover_url      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_books_user ON public.books(user_id);

-- ---- Global word cache (shared across all users) ----
-- Cached AI lookup results. Keyed by (word + genre + langs).
CREATE TABLE public.global_word_cache (
  cache_key      TEXT PRIMARY KEY,
  word           TEXT NOT NULL,
  source_lang    TEXT NOT NULL,
  target_lang    TEXT NOT NULL,
  genre          TEXT,
  result         JSONB NOT NULL,
  hit_count      INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cache_word ON public.global_word_cache(word);

-- ---- User's personal word list ----
CREATE TABLE public.user_words (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id          UUID REFERENCES public.books(id) ON DELETE SET NULL,
  word             TEXT NOT NULL,
  cache_key        TEXT REFERENCES public.global_word_cache(cache_key),
  user_note        TEXT,
  source_sentence  TEXT,
  ease_factor      REAL NOT NULL DEFAULT 2.5,
  interval_days    INT NOT NULL DEFAULT 0,
  next_review      TIMESTAMPTZ,
  review_count     INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_words_user ON public.user_words(user_id);
CREATE INDEX idx_user_words_book ON public.user_words(book_id);
CREATE INDEX idx_user_words_review ON public.user_words(user_id, next_review)
  WHERE next_review IS NOT NULL;
CREATE UNIQUE INDEX idx_user_words_unique ON public.user_words(user_id, COALESCE(book_id, '00000000-0000-0000-0000-000000000000'::uuid), word);

-- ---- Review logs (SRS history) ----
CREATE TABLE public.review_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_word_id   UUID NOT NULL REFERENCES public.user_words(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quality        INT NOT NULL CHECK (quality BETWEEN 0 AND 5),
  reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_logs_user_word ON public.review_logs(user_word_id);
CREATE INDEX idx_review_logs_user_time ON public.review_logs(user_id, reviewed_at DESC);

-- ---- API calls (cost tracking + rate limiting) ----
CREATE TABLE public.api_calls (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint       TEXT NOT NULL,
  cache_hit      BOOLEAN NOT NULL DEFAULT FALSE,
  tokens_input   INT,
  tokens_output  INT,
  cost_usd       REAL,
  duration_ms    INT,
  status         TEXT NOT NULL,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_calls_user_time ON public.api_calls(user_id, created_at DESC);
CREATE INDEX idx_api_calls_time ON public.api_calls(created_at DESC);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_word_cache ENABLE ROW LEVEL SECURITY;

-- Users manage their own books
CREATE POLICY "books_owner_all" ON public.books
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users manage their own words
CREATE POLICY "user_words_owner_all" ON public.user_words
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users manage their own review logs
CREATE POLICY "review_logs_owner_all" ON public.review_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users see only their own api calls (Edge Function uses service role to write)
CREATE POLICY "api_calls_owner_select" ON public.api_calls
  FOR SELECT
  USING (auth.uid() = user_id);

-- Global word cache is read-only for authenticated users.
-- Only Edge Functions (service role) write to it.
CREATE POLICY "global_cache_read_all" ON public.global_word_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Triggers: auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER books_set_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER user_words_set_updated_at
  BEFORE UPDATE ON public.user_words
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER global_word_cache_set_updated_at
  BEFORE UPDATE ON public.global_word_cache
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- RPC: increment global cache hit counter (service-role writable)
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_cache_hit(p_cache_key TEXT)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.global_word_cache
  SET hit_count = hit_count + 1
  WHERE cache_key = p_cache_key;
$$;

REVOKE ALL ON FUNCTION public.increment_cache_hit(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_cache_hit(TEXT) TO authenticated, service_role;
