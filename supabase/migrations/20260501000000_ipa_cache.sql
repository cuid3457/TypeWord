-- IPA cache: deterministic phonetic transcription via espeak-ng. Same word
-- in same language always produces the same IPA, so we cache forever.

CREATE TABLE IF NOT EXISTS public.ipa_cache (
  cache_key   TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  language    TEXT NOT NULL,
  ipa         TEXT NOT NULL,
  hit_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ipa_cache_text_lang ON public.ipa_cache (text, language);

ALTER TABLE public.ipa_cache ENABLE ROW LEVEL SECURITY;

-- Service role only — reads/writes via edge function. No direct user access.
CREATE POLICY "ipa_cache service-role full access"
  ON public.ipa_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Hit counter bump (avoid conflicts with full-row updates).
CREATE OR REPLACE FUNCTION public.increment_ipa_hit(p_cache_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.ipa_cache
     SET hit_count = hit_count + 1, updated_at = NOW()
   WHERE cache_key = p_cache_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ipa_hit TO service_role;
