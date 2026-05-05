-- System-wide rate-limit guard now also counts only `word-lookup`.
-- Drops the unused sys_hour key (we only enforce sys_minute).

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
    'sys_minute',  (SELECT count(*) FROM public.api_calls WHERE endpoint = 'word-lookup' AND created_at >= now() - interval '1 minute'),
    'month_cost',  (SELECT coalesce(sum(cost_usd), 0)::float8 FROM public.api_calls WHERE created_at >= date_trunc('month', now()))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limits(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_api_calls_endpoint_created
  ON public.api_calls (endpoint, created_at);
