-- Trial-ending reminder support (2026-05-28).
--
-- 1. profiles columns to track when a user's RC trial ends and whether
--    they've already received the D-2 reminder email.
-- 2. Partial index to make the daily cron's "needs reminder" query cheap
--    (only rows still waiting for a reminder are indexed).
-- 3. pg_cron job that fires the trial-reminder edge function daily.
--
-- The cron uses vault.decrypted_secrets to fetch the Authorization bearer
-- so the secret never lives in this migration file. Run this BEFORE the
-- cron will actually succeed:
--   SELECT vault.create_secret('<CRON_SECRET>', 'trial_reminder_cron_secret');
-- The same string must be set as the CRON_SECRET edge-function secret.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_trial_ends_at_pending
  ON profiles (trial_ends_at)
  WHERE trial_reminder_sent_at IS NULL;

-- Unschedule prior version if present, then (re)create. Wrapped so a
-- fresh DB without the job doesn't fail.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'trial-reminder-daily';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'trial-reminder-daily',
  '0 0 * * *',  -- 00:00 UTC daily (= 09:00 KST)
  $$
  SELECT net.http_post(
    url := 'https://dvdufzwdtmiuzkivjpxb.supabase.co/functions/v1/trial-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'trial_reminder_cron_secret' LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
