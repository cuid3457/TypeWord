-- Pokes: drop the 24h DB cooldown — friends can poke each other freely.
-- The only remaining throttle is on push notification: at most 1 push per
-- (sender, recipient) per hour, so a phone never gets blasted even when
-- two friends are pinging each other rapidly. In-app the notifications
-- inbox accumulates every poke event in the last 7 days.

ALTER TABLE pokes ADD COLUMN IF NOT EXISTS last_pushed_at TIMESTAMPTZ;

-- Drop the old return type (TIMESTAMPTZ scalar) before redefining as TABLE.
DROP FUNCTION IF EXISTS send_poke(UUID);

-- ── send_poke (revised) ────────────────────────────────────────
-- Always succeeds for friends; returns should_push so the client knows
-- whether to invoke the push edge function. Updates last_pushed_at as part
-- of the same write to avoid a race where two parallel pokes both push.
CREATE FUNCTION send_poke(p_recipient_id UUID)
RETURNS TABLE (created_at TIMESTAMPTZ, should_push BOOLEAN) AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  prev_pushed TIMESTAMPTZ;
  push_now BOOLEAN;
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

  SELECT pk.last_pushed_at INTO prev_pushed FROM pokes pk
   WHERE pk.sender_id = uid AND pk.recipient_id = p_recipient_id;
  push_now := prev_pushed IS NULL OR prev_pushed < NOW() - INTERVAL '1 hour';

  INSERT INTO pokes (sender_id, recipient_id, created_at, last_pushed_at)
    VALUES (uid, p_recipient_id, NOW(), CASE WHEN push_now THEN NOW() ELSE NULL END)
  ON CONFLICT (sender_id, recipient_id)
    DO UPDATE SET
      created_at = NOW(),
      last_pushed_at = CASE WHEN push_now THEN NOW() ELSE pokes.last_pushed_at END;

  created_at := NOW();
  should_push := push_now;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── get_my_friends — drop last_poke_sent_at (no longer used) ───
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
