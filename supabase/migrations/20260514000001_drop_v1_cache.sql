-- Drop v1 cache infrastructure. v2 (word_entries + word_translations
-- + reverse_lookups) is the sole canonical path as of 2026-05-14.
--
-- What this removes:
--   • RPCs `check_word_updates` and `check_word_freshness` — v1 cache
--     update propagation, replaced by client-side userWordsSyncService
--     comparing word_entries.updated_at + prompt_version.
--   • Table `global_word_cache` — v1's flat cache (was 15K rows before
--     the recent purge; only ~14.6K curated entries plus a small tail
--     of legacy non-curated entries remained). All meaningful content
--     now lives in word_entries/word_translations/curated_words.
--
-- The v1 edge function `word-lookup` is removed separately via
-- `supabase functions delete word-lookup`.

DROP FUNCTION IF EXISTS public.check_word_updates(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.check_word_freshness(TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP TABLE IF EXISTS public.global_word_cache CASCADE;
