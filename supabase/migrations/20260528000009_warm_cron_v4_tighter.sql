-- Tighten v4 warm-ping cadence (2026-05-28).
--
-- Empirical test (scripts/_diag-v4-warm.js) showed two consecutive cold
-- isolate hits at ~2.4s even though a cron tick fired only 3 minutes
-- prior. Supabase Edge Runtime appears to retire idle isolates well
-- before the 5-min window, so the 5-min cron alone doesn't guarantee
-- every user lookup lands on a warm isolate.
--
-- Move to a 2-min cadence. Inside the v4 warm handler the `warm_state`
-- 5-min window still gates the OpenAI dummy call (no per-tick OpenAI
-- cost when warm_state is fresh), so the extra ticks are just DB reads
-- + isolate keep-alive — negligible cost (~0.005¢/day worth of net.http_post +
-- a single SELECT each tick).

DO $$
BEGIN
  PERFORM cron.unschedule('warm-word-lookup-v4-smart');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'warm-word-lookup-v4-smart',
  '*/2 * * * *',
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
