-- Friend list stats overhaul: drop the noisy {words / mastered / langs} trio
-- in favor of {streak / xp}, the two metrics that actually convey "is this
-- person actively studying right now" at a glance.
--
-- Streak is computed on the fly from user_words activity dates (cheap for
-- per-friend lookups; the friend list is bounded by ~50). XP is now mirrored
-- to profiles.xp_total so it's queryable cross-user — until this migration
-- it lived only in each device's AsyncStorage.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp_total BIGINT NOT NULL DEFAULT 0;

-- ── compute_user_streak helper ─────────────────────────────────
-- Walks back from today (or yesterday if today is empty so a still-active
-- streak shows up before the user has logged in for the day) and counts
-- consecutive activity days. Activity = any user_words row whose
-- updated_at OR created_at falls on that calendar date (UTC).
CREATE OR REPLACE FUNCTION compute_user_streak(p_user UUID) RETURNS INT AS $$
DECLARE
  cnt INT := 0;
  today DATE := CURRENT_DATE;
  d DATE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM user_words w
    WHERE w.user_id = p_user
      AND (w.updated_at::date = today OR w.created_at::date = today)
  ) THEN
    d := today;
  ELSIF EXISTS (
    SELECT 1 FROM user_words w
    WHERE w.user_id = p_user
      AND (w.updated_at::date = today - 1 OR w.created_at::date = today - 1)
  ) THEN
    d := today - 1;
  ELSE
    RETURN 0;
  END IF;

  WHILE EXISTS (
    SELECT 1 FROM user_words w
    WHERE w.user_id = p_user
      AND (w.updated_at::date = d OR w.created_at::date = d)
  ) LOOP
    cnt := cnt + 1;
    d := d - 1;
  END LOOP;
  RETURN cnt;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── get_my_friends — updated columns ───────────────────────────
DROP FUNCTION IF EXISTS get_my_friends();
CREATE OR REPLACE FUNCTION get_my_friends()
RETURNS TABLE (
  friend_id UUID,
  display_name TEXT,
  username TEXT,
  stats_public BOOLEAN,
  streak_current INT,
  xp_total BIGINT
) AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  SELECT
    p.user_id,
    COALESCE(p.display_name, 'Friend')::TEXT,
    p.username,
    p.stats_public,
    CASE WHEN p.stats_public THEN compute_user_streak(p.user_id) ELSE NULL END,
    CASE WHEN p.stats_public THEN p.xp_total ELSE NULL END
  FROM friendships f
  JOIN profiles p ON p.user_id = f.friend_id
  WHERE f.user_id = uid
  ORDER BY p.display_name NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── set_xp_total RPC ───────────────────────────────────────────
-- Client persists local XP total to profiles. Idempotent; rejects decreasing
-- writes so a stale device can't roll the cloud value backward (each user
-- learns from multiple devices, and the greater value is the source of truth).
CREATE OR REPLACE FUNCTION set_xp_total(p_xp BIGINT) RETURNS VOID AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF p_xp IS NULL OR p_xp < 0 THEN RAISE EXCEPTION 'Invalid XP'; END IF;
  INSERT INTO profiles (user_id, xp_total) VALUES (uid, p_xp)
    ON CONFLICT (user_id) DO UPDATE
      SET xp_total = GREATEST(profiles.xp_total, EXCLUDED.xp_total);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── get_my_xp_total RPC (for cloud-pull at app start) ──────────
CREATE OR REPLACE FUNCTION get_my_xp_total() RETURNS BIGINT AS $$
DECLARE
  uid UUID := auth.uid();
  v BIGINT;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  SELECT xp_total INTO v FROM profiles WHERE user_id = uid;
  RETURN COALESCE(v, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
