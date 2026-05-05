-- Add free/pro tiered rate limits + per-user monthly quota.
--
-- Changes vs. the previous check_rate_limits:
--   - Joins profiles to return the user's plan ('free' | 'pro').
--   - Adds user_month count (timezone-aware via month_bucket column).
--   - Caller (limits.ts) decides which limit set to apply based on plan.
--
-- month_bucket is the column we already write into api_calls per-row at log
-- time using the user's then-current timezone, so timezone changes can't
-- reset a month's quota retroactively (see feedback memory).

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
  -- Profile lookup (plan + timezone). Anonymous users may not have a row yet.
  SELECT plan, timezone
    INTO v_plan, v_timezone
    FROM public.profiles
   WHERE user_id = p_user_id;

  -- Current month_bucket in the user's timezone (UTC fallback).
  v_month_bucket := to_char(
    (now() AT TIME ZONE coalesce(v_timezone, 'UTC')),
    'YYYY-MM'
  );

  RETURN json_build_object(
    'plan',        coalesce(v_plan, 'free'),
    'user_minute', (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND created_at >= now() - interval '1 minute'),
    'user_hour',   (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND created_at >= now() - interval '1 hour'),
    'user_day',    (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND created_at >= now() - interval '1 day'),
    'user_month',  (SELECT count(*) FROM public.api_calls WHERE user_id = p_user_id AND month_bucket = v_month_bucket),
    'sys_minute',  (SELECT count(*) FROM public.api_calls WHERE created_at >= now() - interval '1 minute'),
    'sys_hour',    (SELECT count(*) FROM public.api_calls WHERE created_at >= now() - interval '1 hour'),
    'month_cost',  (SELECT coalesce(sum(cost_usd), 0)::float8 FROM public.api_calls WHERE created_at >= date_trunc('month', now()))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limits(uuid) TO service_role;

-- Speeds up the user_month count (filtered by user_id + month_bucket).
CREATE INDEX IF NOT EXISTS idx_api_calls_user_month
  ON public.api_calls (user_id, month_bucket);
