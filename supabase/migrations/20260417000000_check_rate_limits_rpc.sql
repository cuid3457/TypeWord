-- Indexes for rate-limit / budget queries (idempotent)
CREATE INDEX IF NOT EXISTS idx_api_calls_created_at
  ON public.api_calls (created_at);
CREATE INDEX IF NOT EXISTS idx_api_calls_user_created
  ON public.api_calls (user_id, created_at);

-- Single RPC that returns all rate-limit counts + monthly budget in one round trip.
-- Replaces 6 separate queries with 1.
CREATE OR REPLACE FUNCTION public.check_rate_limits(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'user_minute', (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND created_at >= now() - interval '1 minute'),
    'user_hour',   (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND created_at >= now() - interval '1 hour'),
    'user_day',    (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND created_at >= now() - interval '1 day'),
    'sys_minute',  (SELECT count(*) FROM public.api_calls WHERE created_at >= now() - interval '1 minute'),
    'sys_hour',    (SELECT count(*) FROM public.api_calls WHERE created_at >= now() - interval '1 hour'),
    'month_cost',  (SELECT coalesce(sum(cost_usd), 0)::float8 FROM public.api_calls WHERE created_at >= date_trunc('month', now()))
  );
$$;

-- Only Edge Functions (service_role) may call this.
REVOKE ALL ON FUNCTION public.check_rate_limits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limits(uuid) TO service_role;
