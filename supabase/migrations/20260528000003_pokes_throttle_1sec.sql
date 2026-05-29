-- Pokes: drop the 1-hour push throttle down to 1 second.
--
-- Pokes are friends-only and explicitly playful (Snapchat-streak style),
-- so per-poke push delivery matches user expectation. The remaining 1s
-- guard only blocks UI double-taps and trivially automated spam without
-- interfering with rapid-fire back-and-forth between friends.

CREATE OR REPLACE FUNCTION send_poke(p_recipient_id UUID)
RETURNS TABLE (created_at TIMESTAMPTZ, should_push BOOLEAN) AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
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

  push_now := NOT EXISTS (
    SELECT 1 FROM pokes pk
    WHERE pk.sender_id = uid
      AND pk.recipient_id = p_recipient_id
      AND pk.last_pushed_at IS NOT NULL
      AND pk.last_pushed_at > NOW() - INTERVAL '1 second'
  );

  INSERT INTO pokes (sender_id, recipient_id, created_at, last_pushed_at, seen_at)
    VALUES (uid, p_recipient_id, NOW(), NULL, NULL);

  created_at := NOW();
  should_push := push_now;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
