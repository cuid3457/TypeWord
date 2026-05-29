-- check_rate_limits perf rewrite (2026-05-28).
--
-- Symptom: every word-lookup-v4 invocation paid ~1.9s for this RPC, even
-- on cache hits, dominating the user-perceived latency. Cause: the function
-- returned a `month_cost` field that ran `SELECT sum(cost_usd) FROM
-- api_calls WHERE created_at >= date_trunc('month', now())` — no endpoint
-- filter, so it summed all ~270K rows of the current month every call. The
-- application code never even reads month_cost (limits.ts line 158:
-- "No per-app monthly cost cap. The OpenAI dashboard's hard usage limit
-- is the real safety net"). It was dead weight.
--
-- Drop month_cost entirely. The remaining 5 counts are all indexed
-- lookups on small slices (1 min / 1 hour / 1 day / 1 month per user +
-- 1 min system-wide) and return in <5ms each. Function should now finish
-- well under 100ms.

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
    'sys_minute',  (SELECT count(*) FROM public.api_calls WHERE endpoint = p_endpoint AND created_at >= now() - interval '1 minute')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limits(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limits(uuid, text) TO service_role;
