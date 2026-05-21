-- Phase 8 cron: trigger process-report every 10 min to process accumulated
-- user reports. Each invocation aggregates unprocessed reports by
-- (word, source_lang, target_lang), runs gpt-4.1 judge x2, and queues
-- report_fixes for moderator review.
--
-- 10-min interval = balance between report response time and OpenAI cost.
-- Empty-queue invocations cost ~$0 (just a DB query). Real work fires only
-- when fresh reports exist.
--
-- NOTE: Legacy service_role JWT redacted (rotated 2026-05-21 to new
-- sb_secret_ format per the JWT-key disable cutover). The cron schedule
-- has been re-applied with the new key in production; the placeholder
-- below is historical record only and is not a runnable credential.

SELECT cron.schedule(
  'process-report-queue',
  '*/10 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://dvdufzwdtmiuzkivjpxb.supabase.co/functions/v1/process-report',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <<REDACTED_LEGACY_SERVICE_ROLE_JWT_ROTATED_2026-05-21>>',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object()
    );
  $cron$
);

-- Reporter trust RPC: bumps profiles.report_*_count atomically.
-- Called by process-report after each judgment.
CREATE OR REPLACE FUNCTION public.increment_report_counters(
  p_user_id UUID,
  p_valid_delta INT,
  p_invalid_delta INT
) RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET report_count = report_count + p_valid_delta + p_invalid_delta,
      report_valid_count = report_valid_count + p_valid_delta,
      report_invalid_count = report_invalid_count + p_invalid_delta,
      last_report_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
