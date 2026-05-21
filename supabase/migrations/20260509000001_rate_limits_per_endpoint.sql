-- Endpoint-aware rate limits.
--
-- Previous check_rate_limits filtered `endpoint = 'word-lookup'` for all
-- counters, which meant tts-synthesize / ipa-generate / image-extract had
-- no per-minute throttle at all — an attacker could spam unique inputs to
-- bypass the cache and burn Azure / OpenAI cost without limit.
--
-- New signature accepts p_endpoint and counts only that endpoint. Callers
-- pass their own function name. The system-wide guard (sys_minute) is also
-- per-endpoint so a runaway in one endpoint doesn't trip the gate for
-- another (e.g. a TTS spam shouldn't disable word-lookup).

DROP FUNCTION IF EXISTS public.check_rate_limits(uuid);
DROP FUNCTION IF EXISTS public.check_rate_limits(uuid, text);

CREATE OR REPLACE FUNCTION public.check_rate_limits(
  p_user_id  uuid,
  p_endpoint text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_timezone TEXT;
  v_month_bucket TEXT;
BEGIN
  SELECT plan, timezone
    INTO v_plan, v_timezone
    FROM public.profiles
   WHERE user_id = p_user_id;

  v_month_bucket := to_char(
    (now() AT TIME ZONE coalesce(v_timezone, 'UTC')),
    'YYYY-MM'
  );

  RETURN json_build_object(
    'plan',        coalesce(v_plan, 'free'),
    'user_minute', (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = p_endpoint AND created_at >= now() - interval '1 minute'),
    'user_hour',   (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = p_endpoint AND created_at >= now() - interval '1 hour'),
    'user_day',    (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = p_endpoint AND created_at >= now() - interval '1 day'),
    'user_month',  (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = p_endpoint AND month_bucket = v_month_bucket),
    'sys_minute',  (SELECT count(*) FROM public.api_calls WHERE endpoint = p_endpoint AND created_at >= now() - interval '1 minute'),
    'month_cost',  (SELECT coalesce(sum(cost_usd), 0)::float8 FROM public.api_calls WHERE created_at >= date_trunc('month', now()))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limits(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limits(uuid, text) TO service_role;

-- Speeds up the per-endpoint per-user lookups (existing endpoint+created_at
-- index from migration 20260503000002 still helps the system-wide query).
CREATE INDEX IF NOT EXISTS idx_api_calls_user_endpoint_created
  ON public.api_calls (user_id, endpoint, created_at);
