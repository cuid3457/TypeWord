-- Smart warm-check cron: replace the old GET-only ping with a POST
-- {warm_only:true} request. The edge function checks warm_state and only
-- fires OpenAI if the cache is stale (>5 min since last real call). During
-- high-traffic periods this is a $0 round trip; during idle periods it
-- fires one ~$0.005 OpenAI call to refresh the prompt cache.
--
-- NOTE: Legacy JWT redacted (rotated 2026-05-21 to new sb_publishable_ format).
-- Superseded by 20260521000003_warm_cron_publishable_key.sql.
-- Runtime effect preserved by the superseding migration; placeholder below
-- is historical record only.

-- Drop the old GET-only schedule (it only warmed the isolate, not the
-- OpenAI prompt cache).
DO $$
BEGIN
  PERFORM cron.unschedule('warm-word-lookup-v2');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'warm-word-lookup-v2-smart',
  '*/5 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://dvdufzwdtmiuzkivjpxb.supabase.co/functions/v1/word-lookup-v2',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <<REDACTED_LEGACY_ANON_JWT_ROTATED_2026-05-21>>',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('warm_only', true)
    );
  $cron$
);
