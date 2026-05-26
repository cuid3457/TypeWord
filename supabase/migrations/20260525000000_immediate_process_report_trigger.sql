-- Trigger immediate process-report invocation on content_reports INSERT.
-- ────────────────────────────────────────────────────────────────────────
-- Background: the 10-minute pg_cron `process-report-queue` job already drains
-- the queue (kept as a fallback for any trigger misses), but waiting up to
-- 10 minutes is too long when AUTO_APPLY_MIN_REPORTS=1 — a single legitimate
-- report should reach auto-apply within seconds, not minutes.
--
-- Design:
--   AFTER INSERT trigger fires pg_net.http_post (async — queued by pg_net,
--   doesn't block the inserting transaction). The HTTP call uses the same
--   Vault-stored secret the cron job uses.
--
-- Race conditions:
--   process-report deduplicates by (word, source_lang, target_lang) in the
--   report_fixes table — concurrent invocations on the same group land on
--   `skipped_existing`. Per-report work is also idempotent: each report row
--   is marked processed_at after the first claim.

CREATE OR REPLACE FUNCTION public.enqueue_process_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  secret_value text;
BEGIN
  -- Skip rows without lang info — process-report's aggregator filters them out anyway.
  IF NEW.source_lang IS NULL OR NEW.target_lang IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = 'process_report_cron_secret'
  LIMIT 1;

  IF secret_value IS NULL THEN
    -- Secret not provisioned — silently skip. Cron job will pick it up.
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://dvdufzwdtmiuzkivjpxb.supabase.co/functions/v1/process-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || secret_value,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_reports_immediate_process ON public.content_reports;
CREATE TRIGGER trg_content_reports_immediate_process
  AFTER INSERT ON public.content_reports
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_process_report();

COMMENT ON FUNCTION public.enqueue_process_report() IS
  'Fires process-report edge function immediately on new content_reports rows via pg_net (async). 10-min pg_cron job remains as fallback.';
