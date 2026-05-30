-- Mystery Box (gacha) infrastructure — character-only.
--
-- Profile characters are gated behind a paid gacha (capsule 50 pts random
-- or direct 100 pts specific). Profile backgrounds live in the same catalog
-- table for shared rendering/equip plumbing but are FREE: every active
-- background is selectable without purchase from the in-app background
-- picker. open_mystery_box and buy_mystery_box_item are scoped to
-- kind='character'; equip_cosmetic skips the ownership check for
-- kind='background'.
--
-- Duplicate from capsule refunds 25 pts. Pity ceiling: 50 consecutive non-
-- epic pulls guarantee epic on next pull (then resets).
--
-- All probability/cost values live server-side. Clients cannot influence
-- draws; the server is the sole RNG source.

-- ── 1. Catalog: every gacha-able item ─────────────────────────
CREATE TABLE IF NOT EXISTS mystery_box_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('character', 'background')),
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic')),
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  direct_price INTEGER NOT NULL DEFAULT 100 CHECK (direct_price > 0),
  -- Free-form payload: hex color, gradient tokens, asset path. Client-interpreted.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mystery_box_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mystery_box_items_public_read"
  ON mystery_box_items FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_mystery_box_items_kind_rarity
  ON mystery_box_items(kind, rarity) WHERE active;

-- ── 2. User collection: what each user owns ───────────────────
CREATE TABLE IF NOT EXISTS user_collection (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES mystery_box_items(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('capsule', 'direct', 'grant')),
  PRIMARY KEY (user_id, item_id)
);

ALTER TABLE user_collection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_collection_read_own"
  ON user_collection FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_collection_user ON user_collection(user_id);

-- ── 3. Pity + equipped on existing user_inventory ─────────────
-- equipped_*_id are server-only writes (client UPDATE blocked by RLS — only
-- the equip_cosmetic RPC mutates). This matches the pattern called out in
-- feedback_new_profiles_column_needs_guard.
ALTER TABLE user_inventory
  ADD COLUMN IF NOT EXISTS gacha_pity_count INTEGER NOT NULL DEFAULT 0
    CHECK (gacha_pity_count >= 0),
  ADD COLUMN IF NOT EXISTS equipped_character_id TEXT
    REFERENCES mystery_box_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS equipped_background_id TEXT
    REFERENCES mystery_box_items(id) ON DELETE SET NULL;

-- ── 4. Audit log: every capsule pull (for fraud + disclosure proof) ──
CREATE TABLE IF NOT EXISTS gacha_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  result_item_id TEXT NOT NULL,
  cost INTEGER NOT NULL,
  rarity TEXT NOT NULL,
  was_duplicate BOOLEAN NOT NULL,
  pity_count_at_pull INTEGER NOT NULL,
  pity_triggered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gacha_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gacha_log_read_own"
  ON gacha_log FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_gacha_log_user_created
  ON gacha_log(user_id, created_at DESC);

-- ── 5. Constants ──────────────────────────────────────────────
-- Centralized so probability page + RPCs stay in lockstep.
CREATE OR REPLACE FUNCTION _mb_capsule_cost() RETURNS INTEGER
  LANGUAGE sql IMMUTABLE AS $$ SELECT 50 $$;
CREATE OR REPLACE FUNCTION _mb_duplicate_refund() RETURNS INTEGER
  LANGUAGE sql IMMUTABLE AS $$ SELECT 25 $$;
CREATE OR REPLACE FUNCTION _mb_pity_threshold() RETURNS INTEGER
  LANGUAGE sql IMMUTABLE AS $$ SELECT 50 $$;
-- Rarity tier probabilities (out of 1000 for integer math)
CREATE OR REPLACE FUNCTION _mb_rarity_weights()
  RETURNS TABLE(rarity TEXT, weight INTEGER)
  LANGUAGE sql IMMUTABLE AS $$
  VALUES ('common', 700), ('rare', 250), ('epic', 50)
$$;

-- ── 6. open_mystery_box: capsule pull ─────────────────────────
CREATE OR REPLACE FUNCTION open_mystery_box()
RETURNS TABLE (
  result_item_id TEXT,
  result_rarity TEXT,
  was_duplicate BOOLEAN,
  pity_triggered BOOLEAN,
  refund INTEGER,
  points_after INTEGER,
  pity_count_after INTEGER
) AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  cost INTEGER := _mb_capsule_cost();
  refund_amt INTEGER := 0;
  current_points INTEGER;
  current_pity INTEGER;
  forced_epic BOOLEAN := false;
  picked_rarity TEXT;
  picked_item TEXT;
  rng INTEGER;
  cum INTEGER := 0;
  rar_row RECORD;
  dup BOOLEAN;
  new_pity INTEGER;
  pool_size INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'anonymous_disallowed' USING ERRCODE = 'P0003';
  END IF;

  -- Ensure inventory row exists
  INSERT INTO user_inventory (user_id, streak_freezes, xp_boost_active_until)
    VALUES (uid, 0, NULL) ON CONFLICT (user_id) DO NOTHING;

  SELECT COALESCE(points, 0) INTO current_points FROM profiles WHERE user_id = uid;
  IF current_points < cost THEN
    RAISE EXCEPTION 'insufficient_points' USING ERRCODE = 'P0002';
  END IF;

  SELECT gacha_pity_count INTO current_pity FROM user_inventory WHERE user_id = uid;
  current_pity := COALESCE(current_pity, 0);

  -- Deduct capsule cost up front.
  UPDATE profiles SET points = points - cost WHERE user_id = uid;
  current_points := current_points - cost;

  -- Pity: at threshold the next pull is forced epic.
  IF current_pity + 1 >= _mb_pity_threshold() THEN
    forced_epic := true;
    picked_rarity := 'epic';
  ELSE
    -- Roll rarity bucket (weighted out of 1000).
    rng := floor(random() * 1000)::INTEGER;
    FOR rar_row IN SELECT * FROM _mb_rarity_weights() LOOP
      cum := cum + rar_row.weight;
      IF rng < cum THEN
        picked_rarity := rar_row.rarity;
        EXIT;
      END IF;
    END LOOP;
    IF picked_rarity IS NULL THEN picked_rarity := 'common'; END IF;
  END IF;

  -- Pick a specific character from the chosen rarity, weighted. If the
  -- chosen rarity has no active characters, fall back to common, then to
  -- any active character. (Backgrounds are excluded from the gacha pool.)
  SELECT COUNT(*) INTO pool_size FROM mystery_box_items
    WHERE active AND kind = 'character' AND rarity = picked_rarity;
  IF pool_size = 0 THEN
    SELECT COUNT(*) INTO pool_size FROM mystery_box_items
      WHERE active AND kind = 'character' AND rarity = 'common';
    IF pool_size > 0 THEN picked_rarity := 'common'; END IF;
  END IF;
  IF pool_size = 0 THEN
    -- Character catalog empty: refund the cost and exit cleanly.
    UPDATE profiles SET points = points + cost WHERE user_id = uid;
    RAISE EXCEPTION 'catalog_empty' USING ERRCODE = 'P0004';
  END IF;

  SELECT id INTO picked_item FROM mystery_box_items
    WHERE active AND kind = 'character' AND rarity = picked_rarity
    ORDER BY random() * (1.0 / weight)  -- weighted random
    LIMIT 1;

  -- Duplicate? If owned, refund partial.
  SELECT EXISTS (
    SELECT 1 FROM user_collection WHERE user_id = uid AND item_id = picked_item
  ) INTO dup;

  IF dup THEN
    refund_amt := _mb_duplicate_refund();
    UPDATE profiles SET points = points + refund_amt WHERE user_id = uid;
    current_points := current_points + refund_amt;
  ELSE
    INSERT INTO user_collection (user_id, item_id, source)
      VALUES (uid, picked_item, 'capsule');
  END IF;

  -- Pity bookkeeping: epic pull resets, anything else increments.
  IF picked_rarity = 'epic' THEN
    new_pity := 0;
  ELSE
    new_pity := current_pity + 1;
  END IF;
  UPDATE user_inventory
    SET gacha_pity_count = new_pity, updated_at = NOW()
    WHERE user_id = uid;

  -- Audit
  INSERT INTO gacha_log (user_id, result_item_id, cost, rarity, was_duplicate,
                         pity_count_at_pull, pity_triggered)
    VALUES (uid, picked_item, cost, picked_rarity, dup, current_pity, forced_epic);

  RETURN QUERY SELECT picked_item, picked_rarity, dup, forced_epic,
                      refund_amt, current_points, new_pity;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── 7. buy_mystery_box_item: direct purchase of a specific item ──
CREATE OR REPLACE FUNCTION buy_mystery_box_item(p_item_id TEXT)
RETURNS TABLE (points_after INTEGER, already_owned BOOLEAN) AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  cost INTEGER;
  is_active BOOLEAN;
  item_kind TEXT;
  current_points INTEGER;
  owned BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'anonymous_disallowed' USING ERRCODE = 'P0003';
  END IF;

  SELECT direct_price, active, kind INTO cost, is_active, item_kind
    FROM mystery_box_items WHERE id = p_item_id;
  IF cost IS NULL OR NOT is_active OR item_kind <> 'character' THEN
    -- Backgrounds are free and not purchasable via this RPC.
    RAISE EXCEPTION 'unknown_item' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (SELECT 1 FROM user_collection WHERE user_id = uid AND item_id = p_item_id)
    INTO owned;
  IF owned THEN
    SELECT COALESCE(points, 0) INTO current_points FROM profiles WHERE user_id = uid;
    RETURN QUERY SELECT current_points, true;
    RETURN;
  END IF;

  SELECT COALESCE(points, 0) INTO current_points FROM profiles WHERE user_id = uid;
  IF current_points < cost THEN
    RAISE EXCEPTION 'insufficient_points' USING ERRCODE = 'P0002';
  END IF;

  UPDATE profiles SET points = points - cost WHERE user_id = uid;
  INSERT INTO user_collection (user_id, item_id, source) VALUES (uid, p_item_id, 'direct');

  RETURN QUERY SELECT (current_points - cost), false;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── 8. equip_cosmetic: equip an owned item ────────────────────
CREATE OR REPLACE FUNCTION equip_cosmetic(p_kind TEXT, p_item_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  uid UUID := auth.uid();
  item_kind TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_kind NOT IN ('character', 'background') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = 'P0001';
  END IF;

  -- p_item_id NULL → unequip
  IF p_item_id IS NOT NULL THEN
    SELECT kind INTO item_kind FROM mystery_box_items WHERE id = p_item_id AND active;
    IF item_kind IS NULL OR item_kind <> p_kind THEN
      RAISE EXCEPTION 'unknown_item' USING ERRCODE = 'P0001';
    END IF;
    -- Backgrounds are free for everyone — only characters require ownership.
    IF p_kind = 'character' AND NOT EXISTS (
      SELECT 1 FROM user_collection WHERE user_id = uid AND item_id = p_item_id
    ) THEN
      RAISE EXCEPTION 'not_owned' USING ERRCODE = 'P0005';
    END IF;
  END IF;

  INSERT INTO user_inventory (user_id, streak_freezes, xp_boost_active_until)
    VALUES (uid, 0, NULL) ON CONFLICT (user_id) DO NOTHING;

  IF p_kind = 'character' THEN
    UPDATE user_inventory SET equipped_character_id = p_item_id, updated_at = NOW()
      WHERE user_id = uid;
  ELSE
    UPDATE user_inventory SET equipped_background_id = p_item_id, updated_at = NOW()
      WHERE user_id = uid;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── 9. get_mystery_box_state: one round-trip state read ───────
CREATE OR REPLACE FUNCTION get_mystery_box_state()
RETURNS TABLE (
  pity_count INTEGER,
  equipped_character_id TEXT,
  equipped_background_id TEXT,
  owned_item_ids TEXT[]
) AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN QUERY SELECT 0, NULL::TEXT, NULL::TEXT, ARRAY[]::TEXT[];
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(inv.gacha_pity_count, 0),
    inv.equipped_character_id,
    inv.equipped_background_id,
    COALESCE(
      ARRAY(SELECT item_id FROM user_collection WHERE user_id = uid),
      ARRAY[]::TEXT[]
    )
  FROM (SELECT uid AS user_id) base
  LEFT JOIN user_inventory inv ON inv.user_id = base.user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── 10. Initial catalog seed: backgrounds only (characters land later) ──
-- 6 backgrounds across 3 rarities. Payload = hex color or gradient stops.
-- Idempotent: re-runs of the migration won't duplicate rows.
-- Pastel-tone palette matching the mint accent (#2EC4A5) + cream canvas
-- (#F4F1EA). Epic is reserved for multi-hue pastels which feel distinctly
-- "rare" without breaking brand coherence — no dark / saturated tones.
INSERT INTO mystery_box_items (id, kind, rarity, weight, direct_price, payload) VALUES
  ('bg_color_cream',    'background', 'common', 1, 100, '{"type":"solid","color":"#F4F1EA"}'::jsonb),
  ('bg_color_sky',      'background', 'common', 1, 100, '{"type":"solid","color":"#D6E4F0"}'::jsonb),
  ('bg_color_mint',     'background', 'common', 1, 100, '{"type":"solid","color":"#D2E8DC"}'::jsonb),
  ('bg_color_lavender', 'background', 'rare',   1, 100, '{"type":"solid","color":"#DDD2EB"}'::jsonb),
  ('bg_color_peach',    'background', 'rare',   1, 100, '{"type":"gradient","from":"#F9DCC8","to":"#F2C2B0"}'::jsonb),
  ('bg_color_aurora',   'background', 'epic',   1, 100, '{"type":"gradient","from":"#DDD2EB","to":"#C8E4D6"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Grants
GRANT EXECUTE ON FUNCTION open_mystery_box() TO authenticated;
GRANT EXECUTE ON FUNCTION buy_mystery_box_item(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION equip_cosmetic(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mystery_box_state() TO authenticated;
