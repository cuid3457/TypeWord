-- Points + in-app inventory system.
--
-- XP stays the leveling/competition metric (untouched). Points is a new
-- consumable currency earned from review sessions + community engagement,
-- spendable in the store on streak freezes and XP boosts.
--
-- Daily cap was intentionally NOT applied: the launch goal is to maximize
-- engagement, and the accuracy-weighted formula already prevents low-effort
-- grinding (5-word perfect session ≈ 8 pts vs 20-word perfect ≈ 30 pts).

-- ── Points balance on profiles ────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_profiles_points ON profiles(points) WHERE points > 0;

-- ── User inventory: freezes + active boost ────────────────────
CREATE TABLE IF NOT EXISTS user_inventory (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  streak_freezes INTEGER NOT NULL DEFAULT 0 CHECK (streak_freezes >= 0),
  xp_boost_active_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_inventory_read_own"
  ON user_inventory FOR SELECT
  USING (auth.uid() = user_id);

-- ── award_points: client calls after session completion ───────
-- p_amount is computed client-side from (correct × accuracy_mult); server
-- enforces a per-call cap as light anti-abuse. Threat model matches XP —
-- a determined attacker can spoof, but the cost ceiling keeps damage low.
CREATE OR REPLACE FUNCTION award_points(p_amount INTEGER) RETURNS INTEGER AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  new_total INTEGER;
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
  -- Per-call cap: equivalent to a single perfect 20-word session × 1.5x.
  IF p_amount > 50 THEN p_amount := 50; END IF;
  UPDATE profiles
    SET points = COALESCE(points, 0) + p_amount
    WHERE user_id = uid
    RETURNING points INTO new_total;
  RETURN COALESCE(new_total, 0);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── purchase_item: atomic deduction + inventory grant ─────────
CREATE OR REPLACE FUNCTION purchase_item(p_item_id TEXT)
RETURNS TABLE (points_after INTEGER, freezes_after INTEGER, boost_until TIMESTAMPTZ) AS $$
DECLARE
  uid UUID := auth.uid();
  cost INTEGER;
  freeze_grant INTEGER := 0;
  boost_minutes INTEGER := 0;
  current_points INTEGER;
  current_boost_end TIMESTAMPTZ;
  new_boost_end TIMESTAMPTZ;
  result_freezes INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Server-side price table — clients cannot tamper.
  CASE p_item_id
    WHEN 'freeze_1' THEN cost := 50; freeze_grant := 1;
    WHEN 'freeze_3' THEN cost := 120; freeze_grant := 3;
    WHEN 'boost_15' THEN cost := 20; boost_minutes := 15;
    WHEN 'boost_60' THEN cost := 60; boost_minutes := 60;
    ELSE RAISE EXCEPTION 'unknown_item' USING ERRCODE = 'P0001';
  END CASE;

  SELECT COALESCE(points, 0) INTO current_points FROM profiles WHERE user_id = uid;
  IF current_points < cost THEN
    RAISE EXCEPTION 'insufficient_points' USING ERRCODE = 'P0002';
  END IF;

  UPDATE profiles SET points = points - cost WHERE user_id = uid;

  INSERT INTO user_inventory (user_id, streak_freezes, xp_boost_active_until)
    VALUES (uid, 0, NULL)
    ON CONFLICT (user_id) DO NOTHING;

  IF freeze_grant > 0 THEN
    UPDATE user_inventory
      SET streak_freezes = streak_freezes + freeze_grant, updated_at = NOW()
      WHERE user_id = uid;
  END IF;

  IF boost_minutes > 0 THEN
    SELECT xp_boost_active_until INTO current_boost_end
      FROM user_inventory WHERE user_id = uid;
    -- Stack onto remaining boost time if already active.
    new_boost_end := GREATEST(COALESCE(current_boost_end, NOW()), NOW())
                       + (boost_minutes || ' minutes')::INTERVAL;
    UPDATE user_inventory
      SET xp_boost_active_until = new_boost_end, updated_at = NOW()
      WHERE user_id = uid;
  END IF;

  SELECT streak_freezes, xp_boost_active_until
    INTO result_freezes, new_boost_end
    FROM user_inventory WHERE user_id = uid;

  RETURN QUERY SELECT (current_points - cost), result_freezes, new_boost_end;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── consume_streak_freeze: called by streak service when hearts run out
CREATE OR REPLACE FUNCTION consume_streak_freeze() RETURNS BOOLEAN AS $$
DECLARE
  uid UUID := auth.uid();
  remaining INTEGER;
BEGIN
  IF uid IS NULL THEN RETURN FALSE; END IF;
  UPDATE user_inventory
    SET streak_freezes = streak_freezes - 1, updated_at = NOW()
    WHERE user_id = uid AND streak_freezes > 0
    RETURNING streak_freezes INTO remaining;
  RETURN remaining IS NOT NULL;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── get_inventory: read current inventory state in one round-trip ────
CREATE OR REPLACE FUNCTION get_inventory()
RETURNS TABLE (points INTEGER, streak_freezes INTEGER, xp_boost_active_until TIMESTAMPTZ) AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN QUERY SELECT 0, 0, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(p.points, 0),
    COALESCE(inv.streak_freezes, 0),
    inv.xp_boost_active_until
  FROM profiles p
  LEFT JOIN user_inventory inv ON inv.user_id = p.user_id
  WHERE p.user_id = uid;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── Like trigger: uploader gets +1 pt when someone likes their wordlist
CREATE OR REPLACE FUNCTION award_uploader_on_like() RETURNS TRIGGER AS $$
DECLARE uploader UUID;
BEGIN
  SELECT user_id INTO uploader FROM community_wordlists WHERE id = NEW.wordlist_id;
  -- No self-rewarding (uploader can't like own wordlist for points).
  IF uploader IS NOT NULL AND uploader <> NEW.user_id THEN
    UPDATE profiles SET points = COALESCE(points, 0) + 1 WHERE user_id = uploader;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_like_award_points ON community_wordlist_likes;
CREATE TRIGGER trg_like_award_points
  AFTER INSERT ON community_wordlist_likes
  FOR EACH ROW EXECUTE FUNCTION award_uploader_on_like();

-- ── Download trigger: uploader gets +2 pts on each unique download
CREATE OR REPLACE FUNCTION award_uploader_on_download() RETURNS TRIGGER AS $$
DECLARE uploader UUID;
BEGIN
  SELECT user_id INTO uploader FROM community_wordlists WHERE id = NEW.wordlist_id;
  IF uploader IS NOT NULL AND uploader <> NEW.user_id THEN
    UPDATE profiles SET points = COALESCE(points, 0) + 2 WHERE user_id = uploader;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_download_award_points ON community_wordlist_downloads;
CREATE TRIGGER trg_download_award_points
  AFTER INSERT ON community_wordlist_downloads
  FOR EACH ROW EXECUTE FUNCTION award_uploader_on_download();
