-- Force community wordlist edits to go through the community-upload edge
-- function so the moderation pipeline (OpenAI Moderation + keyword block-
-- list) cannot be bypassed by editing a previously-clean row.
--
-- Before: authenticated users could PATCH their own row (title/description)
-- directly via PostgREST. Combined with create-time-only moderation, this
-- let an attacker upload a clean "Test" wordlist and then PATCH the title
-- to anything they wanted.
-- After: only service_role (used by the edge function after moderation
-- passes) may UPDATE. Authenticated users still SELECT their own rows
-- and DELETE their own rows.

DROP POLICY IF EXISTS "community_wordlists_update_own" ON community_wordlists;
