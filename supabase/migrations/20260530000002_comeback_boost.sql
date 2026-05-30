-- Comeback Boost: re-engagement reward for users returning after 3+ days away.
-- On activation: 24h of 1.5x point credit + 1 free streak freeze.
-- Server-authoritative — client cannot trigger without meeting the inactivity
-- threshold, and cannot stack against itself (next activation requires another
-- 3+ day gap after the current boost expires).

ALTER TABLE user_inventory
  ADD COLUMN IF NOT EXISTS comeback_boost_until TIMESTAMPTZ;

-- get_inventory: extend response with comeback_boost_until.
-- Return type change requires DROP — CREATE OR REPLACE can't widen RETURNS TABLE.
DROP FUNCTION IF EXISTS get_inventory();
CREATE OR REPLACE FUNCTION get_inventory()
RETURNS TABLE (
  points INTEGER,
  streak_freezes INTEGER,
  xp_boost_active_until TIMESTAMPTZ,
  comeback_boost_until TIMESTAMPTZ
) AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN QUERY SELECT 0, 0, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(p.points, 0),
    COALESCE(inv.streak_freezes, 0),
    inv.xp_boost_active_until,
    inv.comeback_boost_until
  FROM profiles p
  LEFT JOIN user_inventory inv ON inv.user_id = p.user_id
  WHERE p.user_id = uid;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- award_points: apply Comeback Boost (1.5x) when active.
-- Daily cap (300) is measured against the *input* amount, so boost gives users
-- the full normal-day cap + 50% bonus on top — equivalent to ~450 max per day.
CREATE OR REPLACE FUNCTION award_points(p_amount INTEGER) RETURNS INTEGER AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  new_total INTEGER;
  today DATE := (NOW() AT TIME ZONE 'UTC')::date;
  used INTEGER;
  cap INTEGER := 300;
  boost_until TIMESTAMPTZ;
  credit INTEGER;
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
  IF p_amount > 50 THEN p_amount := 50; END IF;

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

  SELECT inv.comeback_boost_until INTO boost_until
    FROM user_inventory inv WHERE inv.user_id = uid;
  IF boost_until IS NOT NULL AND boost_until > NOW() THEN
    credit := ROUND(p_amount * 1.5);
  ELSE
    credit := p_amount;
  END IF;

  UPDATE profiles
    SET points = COALESCE(points, 0) + credit,
        points_awarded_today = COALESCE(points_awarded_today, 0) + p_amount
    WHERE user_id = uid
    RETURNING points INTO new_total;
  RETURN COALESCE(new_total, 0);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- activate_comeback_boost_if_eligible: server checks inactivity gap and
-- activates atomically. Idempotent — re-calls during an active boost window
-- do nothing (no double-grant of freeze, no extension of expiry).
CREATE OR REPLACE FUNCTION activate_comeback_boost_if_eligible()
RETURNS TABLE (
  activated BOOLEAN,
  boost_until TIMESTAMPTZ,
  freezes_after INTEGER
) AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  last_study DATE;
  current_until TIMESTAMPTZ;
  new_until TIMESTAMPTZ;
  out_freezes INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  -- Ensure inventory row exists so we can read/write atomically.
  INSERT INTO user_inventory (user_id, streak_freezes, xp_boost_active_until)
    VALUES (uid, 0, NULL)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT inv.comeback_boost_until INTO current_until
    FROM user_inventory inv WHERE inv.user_id = uid;

  -- Already-active boost: silently noop with current state.
  IF current_until IS NOT NULL AND current_until > NOW() THEN
    SELECT inv.streak_freezes INTO out_freezes
      FROM user_inventory inv WHERE inv.user_id = uid;
    RETURN QUERY SELECT FALSE, current_until, COALESCE(out_freezes, 0);
    RETURN;
  END IF;

  -- Eligibility: at least one prior study day AND most recent ≥3 days ago.
  SELECT MAX(date)::DATE INTO last_study FROM study_dates WHERE user_id = uid;
  IF last_study IS NULL OR (CURRENT_DATE - last_study) < 3 THEN
    SELECT inv.streak_freezes INTO out_freezes
      FROM user_inventory inv WHERE inv.user_id = uid;
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, COALESCE(out_freezes, 0);
    RETURN;
  END IF;

  new_until := NOW() + INTERVAL '24 hours';
  UPDATE user_inventory
    SET comeback_boost_until = new_until,
        streak_freezes = streak_freezes + 1,
        updated_at = NOW()
    WHERE user_id = uid
    RETURNING streak_freezes INTO out_freezes;

  RETURN QUERY SELECT TRUE, new_until, COALESCE(out_freezes, 0);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.activate_comeback_boost_if_eligible() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_comeback_boost_if_eligible() TO authenticated;
