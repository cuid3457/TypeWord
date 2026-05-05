-- ============================================================
-- Make try_consume_image_extract_quota INSERT-or-UPDATE so it
-- works for users without a pre-existing profile row (e.g.
-- anonymous sessions, freshly created accounts where profile
-- sync hasn't completed yet).
--
-- Previous version used a plain UPDATE, which silently returned
-- "over limit" when no row matched — a very confusing error for
-- a user who's never consumed anything.
-- ============================================================

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
  -- Atomic upsert:
  --  • No row yet → INSERT with count=1 (first use).
  --  • Same bucket + under limit → UPDATE count = count + 1.
  --  • Different bucket (new month) → UPDATE count = 1.
  --  • Same bucket + at/over limit → DO NOTHING (returns no row).
  INSERT INTO public.profiles (user_id, image_extract_bucket, image_extract_count)
  VALUES (p_user_id, v_bucket, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET
      image_extract_bucket = v_bucket,
      image_extract_count  = CASE
        WHEN public.profiles.image_extract_bucket IS DISTINCT FROM v_bucket THEN 1
        ELSE public.profiles.image_extract_count + 1
      END
    WHERE
      public.profiles.image_extract_bucket IS DISTINCT FROM v_bucket
      OR public.profiles.image_extract_count < p_limit
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
