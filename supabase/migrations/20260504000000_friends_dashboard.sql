-- Friends / dashboard tab schema.
--
-- Privacy model:
--   - Anonymous users get NO friend_code (friends require an account).
--   - friend_code is a public 6-char alphanumeric handle (excludes 0/O/1/I to
--     avoid confusion). It's the ONLY way to add a friend — no email/name
--     search to keep strangers out.
--   - display_name is what friends see (separate from email).
--   - stats_public lets a user opt out of stats visibility while staying as
--     a friend (cards show "Hidden" instead of metrics).
--   - friend_blocks one-sided block; takes precedence over friendship.
--   - friend_reports for moderation queue.

-- ── profile additions ──────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friend_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stats_public BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_profiles_friend_code ON profiles(friend_code) WHERE friend_code IS NOT NULL;

-- ── friendships ────────────────────────────────────────────────
-- Symmetric: a row exists in BOTH directions when two users are friends.
-- Adding a friend creates two rows in one transaction.
CREATE TABLE IF NOT EXISTS friendships (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see only their own friend rows"
  ON friendships FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT/DELETE go through RPCs (add_friend_by_code / remove_friend) so we
-- can enforce symmetry, blocks, anonymous-user blocks, etc.

-- ── friend_blocks ──────────────────────────────────────────────
-- One-sided: blocker -> blocked. Hides each side from the other.
CREATE TABLE IF NOT EXISTS friend_blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE friend_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see only their own block rows"
  ON friend_blocks FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());

-- ── friend_reports ─────────────────────────────────────────────
-- Moderation queue. Service-role processes these.
CREATE TABLE IF NOT EXISTS friend_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_friend_reports_reported ON friend_reports(reported_id);

ALTER TABLE friend_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can insert their own reports"
  ON friend_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
-- (no SELECT policy — moderation reads via service_role)

-- ── friend_code generator ──────────────────────────────────────
-- 6-char code from a 32-character alphabet excluding visually ambiguous
-- characters (0/O/1/I/L). Collision is retried up to 5 times.
CREATE OR REPLACE FUNCTION generate_friend_code() RETURNS TEXT AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code TEXT;
  attempt INT := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE friend_code = code);
    attempt := attempt + 1;
    IF attempt > 5 THEN
      RAISE EXCEPTION 'Could not generate unique friend_code';
    END IF;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── ensure_friend_code RPC ─────────────────────────────────────
-- Idempotent: returns the caller's friend_code, generating if missing.
-- Refuses for anonymous users (they have no auth.users.email — their data
-- evaporates on data reset, so they should sign up before friending).
CREATE OR REPLACE FUNCTION ensure_friend_code() RETURNS TEXT AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  existing TEXT;
  new_code TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'Sign up to use friend features' USING ERRCODE = 'P0001';
  END IF;

  SELECT friend_code INTO existing FROM profiles WHERE user_id = uid;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  new_code := generate_friend_code();
  -- Insert profile row if missing, otherwise update.
  INSERT INTO profiles (user_id, friend_code) VALUES (uid, new_code)
    ON CONFLICT (user_id) DO UPDATE SET friend_code = EXCLUDED.friend_code;
  RETURN new_code;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── add_friend_by_code RPC ─────────────────────────────────────
-- Adds a symmetric friendship. Returns the friend's user_id on success.
-- Errors: invalid code, self-add, already friends, blocked either way.
CREATE OR REPLACE FUNCTION add_friend_by_code(p_code TEXT) RETURNS UUID AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  friend_uid UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'Sign up to use friend features' USING ERRCODE = 'P0001';
  END IF;

  SELECT user_id INTO friend_uid FROM profiles WHERE friend_code = upper(p_code);
  IF friend_uid IS NULL THEN
    RAISE EXCEPTION 'Friend code not found' USING ERRCODE = 'P0002';
  END IF;
  IF friend_uid = uid THEN
    RAISE EXCEPTION 'Cannot add yourself' USING ERRCODE = 'P0003';
  END IF;
  IF EXISTS (
    SELECT 1 FROM friend_blocks
    WHERE (blocker_id = uid AND blocked_id = friend_uid)
       OR (blocker_id = friend_uid AND blocked_id = uid)
  ) THEN
    RAISE EXCEPTION 'Friend code not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO friendships (user_id, friend_id) VALUES (uid, friend_uid)
    ON CONFLICT DO NOTHING;
  INSERT INTO friendships (user_id, friend_id) VALUES (friend_uid, uid)
    ON CONFLICT DO NOTHING;
  RETURN friend_uid;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── remove_friend RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION remove_friend(p_friend_id UUID) RETURNS VOID AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM friendships WHERE
    (user_id = uid AND friend_id = p_friend_id) OR
    (user_id = p_friend_id AND friend_id = uid);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── block_user RPC ─────────────────────────────────────────────
-- Removes any existing friendship and inserts a one-sided block.
CREATE OR REPLACE FUNCTION block_user(p_user_id UUID) RETURNS VOID AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF uid = p_user_id THEN RAISE EXCEPTION 'Cannot block yourself'; END IF;
  DELETE FROM friendships WHERE
    (user_id = uid AND friend_id = p_user_id) OR
    (user_id = p_user_id AND friend_id = uid);
  INSERT INTO friend_blocks (blocker_id, blocked_id) VALUES (uid, p_user_id)
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── get_my_friends RPC ─────────────────────────────────────────
-- Returns friends with their public stats. Stats are nullable when the
-- friend has stats_public = false.
CREATE OR REPLACE FUNCTION get_my_friends()
RETURNS TABLE (
  friend_id UUID,
  display_name TEXT,
  stats_public BOOLEAN,
  total_words INT,
  mastered_words INT,
  language_count INT
) AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  SELECT
    p.user_id,
    COALESCE(p.display_name, 'Friend')::TEXT,
    p.stats_public,
    CASE WHEN p.stats_public THEN
      (SELECT COUNT(*)::INT FROM user_words w WHERE w.user_id = p.user_id)
    ELSE NULL END,
    CASE WHEN p.stats_public THEN
      (SELECT COUNT(*)::INT FROM user_words w WHERE w.user_id = p.user_id AND w.interval_days >= 30)
    ELSE NULL END,
    CASE WHEN p.stats_public THEN
      (SELECT COUNT(DISTINCT b.source_lang)::INT FROM books b WHERE b.user_id = p.user_id)
    ELSE NULL END
  FROM friendships f
  JOIN profiles p ON p.user_id = f.friend_id
  WHERE f.user_id = uid
  ORDER BY p.display_name NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
