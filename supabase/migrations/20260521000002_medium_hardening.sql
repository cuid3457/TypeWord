-- Medium-severity hardening (audit M-1, M-2).
-- M-1: award_points has no per-day cap. Server caps at 50/call, but a
--      determined attacker can hammer the RPC and accumulate unlimited
--      points → unlimited freeze/boost items.
-- M-2: increment_word_entry_hit / increment_word_translation_hit RPCs
--      lack explicit GRANT/REVOKE. PostgreSQL defaults grant EXECUTE to
--      PUBLIC, letting anon/authenticated callers bump hit counters and
--      poison cache-rank signals.

-- ── M-1: award_points daily cap ─────────────────────────────────
-- Track day bucket via a per-user counter that resets daily. 300 pts/day
-- is comfortably above the legitimate maximum (≈ 6 perfect sessions of
-- 20 words × 50pts cap = 300), so honest users never hit it.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS points_awarded_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_awarded_day DATE;

CREATE OR REPLACE FUNCTION award_points(p_amount INTEGER) RETURNS INTEGER AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  new_total INTEGER;
  today DATE := (NOW() AT TIME ZONE 'UTC')::date;
  used INTEGER;
  cap INTEGER := 300;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN RETURN 0; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    SELECT COALESCE(points, 0) INTO new_total FROM profiles WHERE user_id = uid;
    RETURN COALESCE(new_total, 0);
  END IF;
  -- Per-call cap (existing).
  IF p_amount > 50 THEN p_amount := 50; END IF;

  -- Per-day cap (new). Read + roll over to today if needed, atomic with the
  -- UPDATE below to avoid race.
  UPDATE profiles
    SET
      points_awarded_today = CASE
        WHEN points_awarded_day = today THEN points_awarded_today
        ELSE 0
      END,
      points_awarded_day = today
    WHERE user_id = uid
    RETURNING points_awarded_today INTO used;
  IF COALESCE(used, 0) + p_amount > cap THEN
    p_amount := GREATEST(0, cap - COALESCE(used, 0));
  END IF;
  IF p_amount <= 0 THEN
    SELECT COALESCE(points, 0) INTO new_total FROM profiles WHERE user_id = uid;
    RETURN COALESCE(new_total, 0);
  END IF;

  UPDATE profiles
    SET points = COALESCE(points, 0) + p_amount,
        points_awarded_today = COALESCE(points_awarded_today, 0) + p_amount
    WHERE user_id = uid
    RETURNING points INTO new_total;
  RETURN COALESCE(new_total, 0);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── M-2: lock hit-counter RPCs to service_role only ───────────────
REVOKE ALL ON FUNCTION public.increment_word_entry_hit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_word_entry_hit(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.increment_word_entry_hit(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_word_entry_hit(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.increment_word_translation_hit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_word_translation_hit(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.increment_word_translation_hit(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_word_translation_hit(UUID) TO service_role;
