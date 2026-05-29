-- Consolidate warm-ping crons to v4 only (2026-05-28).
--
-- Background: app/user traffic moved to word-lookup-v4 at the dict-first
-- cutover (2026-05-22). The legacy v2 endpoint is now only hit by the
-- curation scripts (scripts/curation/curate-wordlist.js), which run as
-- batch jobs at operator-chosen times — paying $1.4/day to keep v2 warm
-- between curation runs is wasted budget.
--
-- This migration:
--   1. Unschedules the v2 warm cron (no live user traffic relies on it).
--   2. Replaces the existing v4 cron with one that also fires an OpenAI
--      dummy call on en→ko (the primary user pair) when warm_state is
--      stale. Keeps OpenAI prompt cache hot for the most common path
--      instead of just keeping the Deno isolate alive.
--
-- Cost shift: -$1.4/day (v2 ping) + ~$1/day (v4 OpenAI ping) = neutral.
-- Other lang pairs (ja→ko, zh-CN→ko, ...) still pay first-call cache
-- miss on rare cold start; revisit if user mix justifies a rotation pool.

DO $$
BEGIN
  PERFORM cron.unschedule('warm-word-lookup-v2-smart');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Drop the old v4 cron too; we replace it with one that hits the upgraded
-- warm handler (v4 now accepts a `warm_lang` hint to choose the pair).
DO $$
BEGIN
  PERFORM cron.unschedule('warm-word-lookup-v4-smart');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'warm-word-lookup-v4-smart',
  '*/5 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://dvdufzwdtmiuzkivjpxb.supabase.co/functions/v1/word-lookup-v4',
      headers := jsonb_build_object(
        'Authorization', 'Bearer sb_publishable_4F4Pg9-i3au4lyoO9tQZOA_f1WCWQ9R',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'warm_only', true,
        'warm_source', 'en',
        'warm_target', 'ko'
      )
    );
  $cron$
);
