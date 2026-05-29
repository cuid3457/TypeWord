-- Streak milestone reward: replaces 24h ad-free reward with a flat 200-point
-- grant at every 10-day milestone (10, 20, 30, ...).
--
-- award_points enforces 50/call + 300/day caps which would prevent a single
-- 200-pt milestone grant from going through atomically, and would also
-- compete with normal session points on the same day. Idempotent RPC keyed
-- on the milestone integer (last_streak_milestone_awarded) prevents
-- replaying the same milestone twice from the client.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_streak_milestone_awarded INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION award_streak_milestone(p_streak INTEGER)
RETURNS INTEGER AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  reward INTEGER := 200;
  new_total INTEGER;
  last_awarded INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN RETURN 0; END IF;

  IF p_streak IS NULL OR p_streak < 10 OR p_streak % 10 <> 0 THEN
    SELECT COALESCE(points, 0) INTO new_total FROM profiles WHERE user_id = uid;
    RETURN COALESCE(new_total, 0);
  END IF;

  -- Idempotent: skip if this milestone (or higher) was already credited.
  SELECT COALESCE(last_streak_milestone_awarded, 0)
    INTO last_awarded
    FROM profiles WHERE user_id = uid;
  IF last_awarded >= p_streak THEN
    SELECT COALESCE(points, 0) INTO new_total FROM profiles WHERE user_id = uid;
    RETURN COALESCE(new_total, 0);
  END IF;

  UPDATE profiles
    SET points = COALESCE(points, 0) + reward,
        last_streak_milestone_awarded = p_streak
    WHERE user_id = uid
    RETURNING points INTO new_total;

  RETURN COALESCE(new_total, 0);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.award_streak_milestone(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_streak_milestone(INTEGER) TO authenticated;
