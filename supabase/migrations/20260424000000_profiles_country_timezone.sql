-- ============================================================
-- Add country + timezone to profiles (for timezone-aware quota reset)
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone_last_changed_at TIMESTAMPTZ;

-- ============================================================
-- RPC: count user's successful API calls for a given endpoint
-- within the current calendar month of the user's timezone.
-- Falls back to UTC if timezone is null/invalid.
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_user_calls_this_month(
  p_user_id UUID,
  p_endpoint TEXT,
  p_timezone TEXT
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT;
  v_month_start TIMESTAMPTZ;
  v_count INT;
BEGIN
  -- Validate timezone: if unknown to PostgreSQL, fall back to UTC
  BEGIN
    PERFORM now() AT TIME ZONE COALESCE(p_timezone, 'UTC');
    v_tz := COALESCE(p_timezone, 'UTC');
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
  END;

  -- Start of the current calendar month in user's timezone, as UTC instant
  v_month_start := date_trunc('month', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;

  SELECT count(*)::INT INTO v_count
  FROM public.api_calls
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND status = 'ok'
    AND created_at >= v_month_start;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.count_user_calls_this_month(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_user_calls_this_month(UUID, TEXT, TEXT) TO authenticated, service_role;
