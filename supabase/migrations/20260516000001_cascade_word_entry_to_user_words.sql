-- Cascade word_entries field changes into matching user_words.result_json
-- so server-side updates (IPA backfill, future curation edits) propagate
-- to clients on the next pullWords cycle WITHOUT waiting for the
-- 24h-throttled sync-user-words RPC.
--
-- Scope (this migration): IPA only.
--   - The IPA backfill flow needs immediate propagation (the LLM regularly
--     omits IPA for inflected forms; we backfill server-side and want
--     users' saved wordlist entries to pick it up).
--   - Other field cascades (meanings/examples/syn/ant) require running the
--     full stitch pipeline because result_json is a TARGET_LANG-stitched
--     view, not a raw copy of word_entries. Those stay on the
--     sync-user-words RPC path; reducing its throttle is the separate
--     follow-up fix.
--
-- Trigger fires only when ipa actually changed AND new value is non-null:
--   - DISTINCT FROM handles NULL→value, value→value, value→NULL
--   - Skip when NEW.ipa IS NULL: we never want to clear a previously-good
--     IPA on the client just because a server retry happened to fail.

CREATE OR REPLACE FUNCTION public.cascade_word_entry_ipa_to_user_words()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ipa IS DISTINCT FROM OLD.ipa AND NEW.ipa IS NOT NULL THEN
    UPDATE public.user_words uw
    SET
      result_json = jsonb_set(uw.result_json, '{ipa}', to_jsonb(NEW.ipa)),
      updated_at = NOW()
    FROM public.books b
    WHERE uw.book_id = b.id
      AND b.source_lang = NEW.word_lang
      AND lower(uw.word) = lower(NEW.word);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_word_entry_ipa ON public.word_entries;
CREATE TRIGGER trg_cascade_word_entry_ipa
  AFTER UPDATE OF ipa ON public.word_entries
  FOR EACH ROW EXECUTE FUNCTION public.cascade_word_entry_ipa_to_user_words();
