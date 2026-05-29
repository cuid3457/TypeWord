-- v4 warm-ping cron — keeps the word-lookup-v4 Deno isolate hot so user
-- lookups (even cache hits) don't pay the 1-2s cold-start tax during idle
-- periods. Mirrors the v2 schedule from 20260521000003_warm_cron_publishable_key.sql
-- but targets the v4 endpoint, which became the primary lookup path after
-- the dict-first migration (2026-05-22).
--
-- v2 cron stays in place because curation scripts (curate-wordlist.js)
-- still invoke v2. Running both is fine — each ping is a cheap DB-only
-- check unless warm_state is older than 5 min.

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
      body := jsonb_build_object('warm_only', true)
    );
  $cron$
);
