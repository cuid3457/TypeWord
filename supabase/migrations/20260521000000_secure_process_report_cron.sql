-- Replace process-report cron auth from hard-coded service-role JWT to a
-- Vault-stored shared secret. The previous migration (20260518000001) baked
-- a service-role JWT directly into the cron SQL, meaning any leak of the
-- repo would compromise the entire database (service_role bypasses RLS).
--
-- Pre-launch hardening: cron now reads a dedicated PROCESS_REPORT_SECRET
-- from Supabase Vault. The process-report edge function verifies the
-- shared secret on every invocation. Compromise of this secret only allows
-- triggering report processing (rate-limited) — never DB write access.
--
-- DEPLOYMENT STEPS (cannot be expressed in pure SQL):
--   1. Generate a random secret (e.g. `openssl rand -hex 32`).
--   2. Set it in Supabase Vault:
--        INSERT INTO vault.secrets (name, secret)
--        VALUES ('process_report_cron_secret', '<the-secret>');
--   3. Set the SAME value in the edge function env via Supabase Dashboard
--      → Functions → process-report → Secrets → PROCESS_REPORT_SECRET.
--   4. Apply this migration.
--   5. Rotate the previously-hardcoded service_role JWT in
--      Dashboard → Project Settings → API → Reset service_role.

-- Drop the old schedule that embedded the service_role JWT.
DO $$
BEGIN
  PERFORM cron.unschedule('process-report-queue');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- New schedule: reads the shared secret from Vault. The Vault view is
-- accessible to the postgres role that pg_cron runs as, but NOT exposed
-- via PostgREST (no API surface). The secret never appears in the SQL
-- text the migration system stores.
SELECT cron.schedule(
  'process-report-queue',
  '*/10 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://dvdufzwdtmiuzkivjpxb.supabase.co/functions/v1/process-report',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'process_report_cron_secret'
          LIMIT 1
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object()
    );
  $cron$
);
