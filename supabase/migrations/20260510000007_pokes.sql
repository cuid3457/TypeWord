-- Lightweight social interaction for friends — "쿡 찌르기" / poke.
-- Latest poke per (sender, recipient) pair is kept; re-poking the same friend
-- before the 24h cooldown is rejected at the RPC level. The recipient sees
-- pokes in their notifications inbox; the sender's friend card disables the
-- button until cooldown elapses.

CREATE TABLE IF NOT EXISTS pokes (
  sender_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sender_id, recipient_id),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_pokes_recipient_recent
  ON pokes(recipient_id, created_at DESC);

ALTER TABLE pokes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see pokes they sent or received"
  ON pokes FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- INSERT/UPDATE through send_poke RPC only.

-- ── send_poke RPC ──────────────────────────────────────────────
-- 24h cooldown per (sender, recipient). Friends-only.
CREATE OR REPLACE FUNCTION send_poke(p_recipient_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  prev_at TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'Sign up to poke' USING ERRCODE = 'P0001';
  END IF;
  IF uid = p_recipient_id THEN
    RAISE EXCEPTION 'Cannot poke yourself' USING ERRCODE = 'P0003';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.user_id = uid AND f.friend_id = p_recipient_id
  ) THEN
    RAISE EXCEPTION 'Not friends' USING ERRCODE = 'P0005';
  END IF;
  IF EXISTS (
    SELECT 1 FROM friend_blocks b
    WHERE (b.blocker_id = uid AND b.blocked_id = p_recipient_id)
       OR (b.blocker_id = p_recipient_id AND b.blocked_id = uid)
  ) THEN
    RAISE EXCEPTION 'Cannot poke' USING ERRCODE = 'P0005';
  END IF;

  SELECT created_at INTO prev_at FROM pokes
   WHERE sender_id = uid AND recipient_id = p_recipient_id;
  IF prev_at IS NOT NULL AND prev_at > NOW() - INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'Poke cooldown' USING ERRCODE = 'P0006';
  END IF;

  INSERT INTO pokes (sender_id, recipient_id, created_at)
    VALUES (uid, p_recipient_id, NOW())
  ON CONFLICT (sender_id, recipient_id)
    DO UPDATE SET created_at = NOW();
  RETURN NOW();
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── list_recent_pokes RPC ──────────────────────────────────────
-- Pokes I received in the last 7 days (the inbox window). Joined to
-- profiles for sender display + username.
CREATE OR REPLACE FUNCTION list_recent_pokes()
RETURNS TABLE (
  sender_id UUID,
  username TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
  SELECT
    pk.sender_id,
    p.username,
    COALESCE(p.display_name, '')::TEXT,
    pk.created_at
  FROM pokes pk
  JOIN profiles p ON p.user_id = pk.sender_id
  WHERE pk.recipient_id = uid
    AND pk.created_at >= NOW() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM friend_blocks b
      WHERE b.blocker_id = uid AND b.blocked_id = pk.sender_id
    )
  ORDER BY pk.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── extend get_my_friends to include sender's poke cooldown ────
-- Adds last_poke_sent_at so the friend card can render the button
-- disabled while inside the 24h cooldown without an extra round trip.
DROP FUNCTION IF EXISTS get_my_friends();
CREATE OR REPLACE FUNCTION get_my_friends()
RETURNS TABLE (
  friend_id UUID,
  display_name TEXT,
  username TEXT,
  stats_public BOOLEAN,
  streak_current INT,
  xp_total BIGINT,
  last_poke_sent_at TIMESTAMPTZ
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
    CASE WHEN p.stats_public THEN p.xp_total ELSE NULL END,
    (SELECT pk.created_at FROM pokes pk
       WHERE pk.sender_id = uid AND pk.recipient_id = p.user_id)
  FROM friendships f
  JOIN profiles p ON p.user_id = f.friend_id
  WHERE f.user_id = uid
  ORDER BY p.display_name NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
