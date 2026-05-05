-- ============================================================
-- api_calls.month_bucket: permanent month assignment per call.
-- Prevents retroactive reclassification when a user changes
-- their country/timezone. Format: 'YYYY-MM' in user's timezone
-- at the moment of the call.
-- ============================================================

ALTER TABLE public.api_calls ADD COLUMN IF NOT EXISTS month_bucket TEXT;

-- Backfill: use the user's CURRENT profile.timezone as best-effort
-- retroactive assignment for historical rows. For rows without
-- matching profile or missing timezone, fall back to UTC.
UPDATE public.api_calls ac
SET month_bucket = to_char(
  ac.created_at AT TIME ZONE COALESCE(p.timezone, 'UTC'),
  'YYYY-MM'
)
FROM public.profiles p
WHERE ac.user_id = p.user_id
  AND ac.month_bucket IS NULL;

UPDATE public.api_calls
SET month_bucket = to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM')
WHERE month_bucket IS NULL;

-- Fast lookup for per-user per-endpoint monthly counts.
CREATE INDEX IF NOT EXISTS idx_api_calls_user_endpoint_month_bucket
  ON public.api_calls (user_id, endpoint, month_bucket)
  WHERE status = 'ok';

-- Replace count_user_calls_this_month to use month_bucket directly.
-- Signature unchanged — clients (Edge Functions) need no update to callsite.
CREATE OR REPLACE FUNCTION public.count_user_calls_this_month(
  p_user_id UUID,
  p_endpoint TEXT,
  p_timezone TEXT
)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::INT
  FROM public.api_calls
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND status = 'ok'
    AND month_bucket = to_char(
      now() AT TIME ZONE COALESCE(p_timezone, 'UTC'),
      'YYYY-MM'
    );
$$;
