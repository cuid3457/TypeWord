-- Per-user rate limits now count only `word-lookup` endpoint.
--
-- Why: every word search fans out to ~10 api_calls (2× word-lookup +
-- 8× tts-synthesize prefetch for both genders + examples). Counting all
-- endpoints made perMinute=30 trip after just 3 searches. tts-synthesize
-- is cache-heavy and near-zero cost, and other endpoints either run
-- downstream of word-lookup or have their own quotas (OCR daily cap),
-- so word-lookup is the only meaningful throttle target for OpenAI cost.
--
-- System-wide guards (sys_minute, sys_hour, month_cost) still count
-- all endpoints for DDoS / budget protection.

DROP FUNCTION IF EXISTS public.check_rate_limits(uuid);

CREATE OR REPLACE FUNCTION public.check_rate_limits(p_user_id uuid)
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
    'user_minute', (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = 'word-lookup' AND created_at >= now() - interval '1 minute'),
    'user_hour',   (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = 'word-lookup' AND created_at >= now() - interval '1 hour'),
    'user_day',    (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = 'word-lookup' AND created_at >= now() - interval '1 day'),
    'user_month',  (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND endpoint = 'word-lookup' AND month_bucket = v_month_bucket),
    'sys_minute',  (SELECT count(*) FROM public.api_calls WHERE created_at >= now() - interval '1 minute'),
    'sys_hour',    (SELECT count(*) FROM public.api_calls WHERE created_at >= now() - interval '1 hour'),
    'month_cost',  (SELECT coalesce(sum(cost_usd), 0)::float8 FROM public.api_calls WHERE created_at >= date_trunc('month', now()))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limits(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_api_calls_user_endpoint_created
  ON public.api_calls (user_id, endpoint, created_at);
