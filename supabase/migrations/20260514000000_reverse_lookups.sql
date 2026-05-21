-- Reverse-lookup cache for v2 word-lookup.
--
-- Reverse lookup = user types a word in their NATIVE language (e.g. "사과")
-- and gets candidates in the STUDY language (e.g. "apple"). v1's
-- word-lookup endpoint handled this via `translate: true` + a
-- (word, source_lang, target_lang, "translate") row in global_word_cache.
-- v2 splits forward and reverse caches: word_entries/word_translations
-- for forward, this new table for reverse.
--
-- Public-read; writes via service-role only (edge function).

CREATE TABLE public.reverse_lookups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_word      TEXT NOT NULL,
  input_lang      TEXT NOT NULL,    -- the user's native language (what they typed)
  target_lang     TEXT NOT NULL,    -- the wordlist's study language (what we resolve to)
  candidates      JSONB NOT NULL,   -- [{ headword: string, hint: string }]
  note            TEXT,             -- 'sentence' | 'non_word' | 'wrong_language' | NULL
  model           TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  prompt_version  TEXT NOT NULL DEFAULT 'v1',
  hit_count       INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (input_word, input_lang, target_lang)
);

CREATE INDEX idx_reverse_lookups_lookup
  ON public.reverse_lookups(input_word, input_lang, target_lang);

ALTER TABLE public.reverse_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reverse_lookups public read"
  ON public.reverse_lookups
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Hit counter bump RPC (mirrors increment_word_entry_hit for word_entries).
CREATE OR REPLACE FUNCTION public.increment_reverse_lookup_hit(p_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.reverse_lookups SET hit_count = hit_count + 1 WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_reverse_lookup_hit TO authenticated, anon;
