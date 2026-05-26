-- Switch compute_user_streak to read from the study_dates table (the
-- persistent record of "user qualified for streak on day X") instead of
-- user_words.updated_at / created_at.
--
-- Why: user_words.updated_at gets bumped by the sync-user-words edge
-- function whenever it refreshes result_json against newer word_entries.
-- That cache-refresh write was indistinguishable from real user activity,
-- so the friend-list streak (compute_user_streak) inflated by counting
-- days on which the user merely had the app open while a cache sync ran.
--
-- The fix points the function at study_dates, which only records days
-- where the user crossed the streak qualification thresholds (≥20 reviews
-- or ≥10 manual adds). Clients already push their local study_dates to
-- this table via syncService.pushStudyDates, so it is a faithful
-- multi-device record of actual study activity.
--
-- Behavioral change: compute_user_streak now matches what each device's
-- local dashboard computes (modulo unsynced days). For users whose
-- friend-list streak was inflated by sync-only activity, the displayed
-- streak will decrease — which is the correct value.

CREATE OR REPLACE FUNCTION compute_user_streak(p_user UUID) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt INT := 0;
  today DATE := CURRENT_DATE;
  d DATE;
BEGIN
  -- Anchor: today if studied today, else yesterday if studied yesterday,
  -- else streak is 0. Mirrors the existing client-side logic so that
  -- the friend-list value lines up with the user's own dashboard.
  IF EXISTS (SELECT 1 FROM study_dates WHERE user_id = p_user AND date = to_char(today, 'YYYY-MM-DD')) THEN
    d := today;
  ELSIF EXISTS (SELECT 1 FROM study_dates WHERE user_id = p_user AND date = to_char(today - 1, 'YYYY-MM-DD')) THEN
    d := today - 1;
  ELSE
    RETURN 0;
  END IF;

  WHILE EXISTS (SELECT 1 FROM study_dates WHERE user_id = p_user AND date = to_char(d, 'YYYY-MM-DD')) LOOP
    cnt := cnt + 1;
    d := d - 1;
  END LOOP;
  RETURN cnt;
END;
$$;
