-- Fire send-inquiry-notification edge function on new inquiries INSERT.
-- Pattern mirrors enqueue_process_report (20260525000000): pg_net.http_post
-- is async, so the inserting transaction is not blocked. Secret comes from
-- Supabase Vault under name 'inquiry_notify_secret' and must match the
-- INQUIRY_NOTIFY_SECRET env var set on the edge function.
--
-- If the secret is missing the trigger no-ops silently — the inquiry still
-- lands in the table, and the admin can read it via Supabase Studio.

CREATE OR REPLACE FUNCTION public.enqueue_inquiry_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  secret_value text;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = 'inquiry_notify_secret'
  LIMIT 1;

  IF secret_value IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://dvdufzwdtmiuzkivjpxb.supabase.co/functions/v1/send-inquiry-notification',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || secret_value,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'inquiries',
      'record', jsonb_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'email', NEW.email,
        'body', NEW.body,
        'image_urls', NEW.image_urls,
        'created_at', NEW.created_at
      )
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiries_notify ON public.inquiries;
CREATE TRIGGER trg_inquiries_notify
  AFTER INSERT ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_inquiry_notification();

COMMENT ON FUNCTION public.enqueue_inquiry_notification() IS
  'Fires send-inquiry-notification edge function on new inquiries via pg_net (async). Uses Vault secret inquiry_notify_secret matched against INQUIRY_NOTIFY_SECRET env on the function.';
