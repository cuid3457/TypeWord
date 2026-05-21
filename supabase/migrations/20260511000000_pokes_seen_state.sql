-- Pokes: read/unread state. Opening the notifications modal marks all
-- received pokes as seen so the badge auto-clears. A fresh poke from the
-- same sender resets seen_at to NULL so the recipient sees the new ping.

ALTER TABLE pokes ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

-- ── send_poke (revised — clear seen_at on each new poke) ───────
DROP FUNCTION IF EXISTS send_poke(UUID);
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

  INSERT INTO pokes (sender_id, recipient_id, created_at, last_pushed_at, seen_at)
    VALUES (uid, p_recipient_id, NOW(),
            CASE WHEN push_now THEN NOW() ELSE NULL END,
            NULL)
  ON CONFLICT (sender_id, recipient_id)
    DO UPDATE SET
      created_at = NOW(),
      last_pushed_at = CASE WHEN push_now THEN NOW() ELSE pokes.last_pushed_at END,
      seen_at = NULL;  -- new poke resets read state

  created_at := NOW();
  should_push := push_now;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── list_recent_pokes — only UNSEEN pokes within the 7-day window ──
DROP FUNCTION IF EXISTS list_recent_pokes();
CREATE FUNCTION list_recent_pokes()
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
    AND pk.seen_at IS NULL
    AND pk.created_at >= NOW() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM friend_blocks b
      WHERE b.blocker_id = uid AND b.blocked_id = pk.sender_id
    )
  ORDER BY pk.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── mark_pokes_seen — bulk-mark all my unseen pokes as seen ────
CREATE OR REPLACE FUNCTION mark_pokes_seen() RETURNS VOID AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  UPDATE pokes
     SET seen_at = NOW()
   WHERE recipient_id = uid AND seen_at IS NULL;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
