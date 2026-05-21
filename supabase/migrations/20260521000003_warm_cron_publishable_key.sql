-- Replace warm-cron-smart's hardcoded legacy anon JWT with the new
-- publishable key. Once "Disable JWT-based API keys" flips the gateway
-- to new-format auth, the previous schedule would 401 on every tick.
--
-- Publishable keys are intended-public (same as the legacy anon JWT they
-- replace), so hardcoding here is acceptable per audit guidance — only
-- service_role secrets need Vault.

DO $$
BEGIN
  PERFORM cron.unschedule('warm-word-lookup-v2-smart');
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
        'Authorization', 'Bearer sb_publishable_4F4Pg9-i3au4lyoO9tQZOA_f1WCWQ9R',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('warm_only', true)
    );
  $cron$
);
