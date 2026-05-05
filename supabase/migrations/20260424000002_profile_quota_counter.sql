-- ============================================================
-- Move image-extract monthly quota enforcement from COUNT over
-- api_calls to a per-user atomic counter on profiles.
--
-- Why:
--   • profiles counter = O(1) lookup + O(1) update, scales
--     regardless of api_calls table size.
--   • api_calls stays a pure audit log (reads no longer on the
--     hot path of quota decisions).
--
-- Compatibility:
--   • api_calls.month_bucket column preserved (cheap, used only
--     for retrospective analytics).
--   • Old RPC count_user_calls_this_month left in place — can be
--     removed in a future migration after confirming no callers.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS image_extract_bucket TEXT,
  ADD COLUMN IF NOT EXISTS image_extract_count  INT NOT NULL DEFAULT 0;

-- Backfill existing usage from api_calls (retroactive, best effort).
-- Uses each user's current profile.timezone to compute the current
-- bucket, then sums api_calls rows matching that bucket.
UPDATE public.profiles p
SET
  image_extract_bucket = sub.bucket,
  image_extract_count  = sub.used
FROM (
  SELECT
    pp.user_id,
    to_char(now() AT TIME ZONE COALESCE(pp.timezone, 'UTC'), 'YYYY-MM') AS bucket,
    (
      SELECT count(*)::INT
      FROM public.api_calls ac
      WHERE ac.user_id = pp.user_id
        AND ac.endpoint = 'image-extract'
        AND ac.status = 'ok'
        AND ac.month_bucket = to_char(now() AT TIME ZONE COALESCE(pp.timezone, 'UTC'), 'YYYY-MM')
    ) AS used
  FROM public.profiles pp
) sub
WHERE p.user_id = sub.user_id;

-- ──────────────────────────────────────────────────────────────
-- Atomic consume: increment counter if within limit, resetting
-- to 1 when the user's current month bucket differs from stored.
-- Returns JSON { allowed, used, limit }.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.try_consume_image_extract_quota(
  p_user_id  UUID,
  p_timezone TEXT,
  p_limit    INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket TEXT := to_char(now() AT TIME ZONE COALESCE(p_timezone, 'UTC'), 'YYYY-MM');
  v_count  INT;
BEGIN
  -- Atomic UPSERT-like update. Succeeds when:
  --  (a) stored bucket differs from current → new month, reset to 1
  --  (b) stored bucket equals current AND count < limit → increment
  -- Fails silently (no row returned) when at/over limit for current month.
  UPDATE public.profiles
  SET
    image_extract_bucket = v_bucket,
    image_extract_count  = CASE
      WHEN image_extract_bucket IS DISTINCT FROM v_bucket THEN 1
      ELSE image_extract_count + 1
    END
  WHERE user_id = p_user_id
    AND (
      image_extract_bucket IS DISTINCT FROM v_bucket
      OR image_extract_count < p_limit
    )
  RETURNING image_extract_count INTO v_count;

  IF v_count IS NOT NULL THEN
    RETURN json_build_object('allowed', true, 'used', v_count, 'limit', p_limit);
  END IF;

  -- Over limit: fetch current state for error payload.
  SELECT image_extract_count INTO v_count
  FROM public.profiles
  WHERE user_id = p_user_id;

  RETURN json_build_object('allowed', false, 'used', COALESCE(v_count, p_limit), 'limit', p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.try_consume_image_extract_quota(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_consume_image_extract_quota(UUID, TEXT, INT) TO service_role;

-- ──────────────────────────────────────────────────────────────
-- Refund: decrement counter (for OpenAI-side failures).
-- Clamped at 0; no-op if already at 0. Bucket check prevents
-- refunding into a previous month after a month rollover.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refund_image_extract_quota(
  p_user_id  UUID,
  p_timezone TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket TEXT := to_char(now() AT TIME ZONE COALESCE(p_timezone, 'UTC'), 'YYYY-MM');
BEGIN
  UPDATE public.profiles
  SET image_extract_count = GREATEST(image_extract_count - 1, 0)
  WHERE user_id = p_user_id
    AND image_extract_bucket = v_bucket;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_image_extract_quota(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_image_extract_quota(UUID, TEXT) TO service_role;
