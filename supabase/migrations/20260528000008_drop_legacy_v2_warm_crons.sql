-- Drop legacy v2 warm crons (2026-05-28).
--
-- Three crons (warm-en-ko, warm-fr-ko, warm-zh-ko) were scheduled in an
-- earlier session to keep multiple lang pairs hot on word-lookup-v2. They
-- run a real lookup with `forceFresh: true` every 5 minutes, which means
-- each tick fires actual OpenAI calls (~$0.005 per tick × 3 pairs × 288
-- ticks/day ≈ $4/day = ~$120/month).
--
-- After the dict-first cutover (2026-05-22) the client traffic moved
-- entirely to word-lookup-v4. v2 is now only invoked by the curation
-- scripts (scripts/curation/curate-wordlist.js), which run as batch jobs
-- — paying to keep v2 hot between curation runs is pure waste. The v4
-- warm cron (warm-word-lookup-v4-smart) added in 20260528000007 handles
-- the active path.
--
-- Net effect: ~-$4/day. Other lang pairs still pay a small first-call
-- penalty on v4 cold start; revisit if user telemetry shows the miss.

DO $$
BEGIN
  PERFORM cron.unschedule('warm-en-ko');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('warm-fr-ko');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('warm-zh-ko');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
