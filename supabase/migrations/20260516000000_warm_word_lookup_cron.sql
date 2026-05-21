-- Warm-ping cron for word-lookup-v2.
-- Edge Function isolates unload after ~10-15 min idle, so the first user
-- after an idle period eats Deno boot + module load + client init (~1-3s
-- on top of the actual work). A 5-min self-ping keeps the isolate hot.
-- Cost is trivial (~8.6K invocations/month, free-tier territory) and the
-- ping path is the GET branch which returns "ok" without auth, DB, or
-- OpenAI calls.
--
-- NOTE: Legacy JWT redacted (rotated 2026-05-21 to new sb_publishable_ format).
-- Superseded by 20260521000003_warm_cron_publishable_key.sql.
-- This migration's runtime effect on production DB is preserved by the
-- superseding migration; the placeholder below is historical record only.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotency: drop any prior schedule with the same name before re-adding.
DO $$
BEGIN
  PERFORM cron.unschedule('warm-word-lookup-v2');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'warm-word-lookup-v2',
  '*/5 * * * *',
  $cron$
    SELECT net.http_get(
      url := 'https://dvdufzwdtmiuzkivjpxb.supabase.co/functions/v1/word-lookup-v2',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <<REDACTED_LEGACY_ANON_JWT_ROTATED_2026-05-21>>'
      )
    );
  $cron$
);
