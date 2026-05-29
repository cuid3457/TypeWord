-- Pokes: one row per poke event (was upsert-by-pair).
--
-- The 2026-05-10 migration's comment already declared the intent: "the
-- notifications inbox accumulates every poke event in the last 7 days."
-- But the implementation used INSERT … ON CONFLICT DO UPDATE keyed by
-- (sender, recipient), so repeated pokes from the same friend collapsed
-- into one row. This migration makes the table actually store each poke
-- as its own row, keyed by a surrogate id.

-- 1) Add surrogate id and switch primary key.
ALTER TABLE pokes ADD COLUMN IF NOT EXISTS id BIGSERIAL;
ALTER TABLE pokes DROP CONSTRAINT IF EXISTS pokes_pkey;
ALTER TABLE pokes ADD PRIMARY KEY (id);

-- 2) send_poke: plain INSERT, no upsert. Push throttle still 1/hour per
--    (sender, recipient) — derived from the most recent successfully-pushed
--    row, not the per-row last_pushed_at. should_push tells the client
--    whether to invoke poke-notify; poke-notify itself atomically claims
--    the row to handle concurrent invocations.
DROP FUNCTION IF EXISTS send_poke(UUID);
CREATE FUNCTION send_poke(p_recipient_id UUID)
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
      AND pk.last_pushed_at > NOW() - INTERVAL '1 hour'
  );

  -- last_pushed_at stays NULL on insert; poke-notify claims it.
  INSERT INTO pokes (sender_id, recipient_id, created_at, last_pushed_at, seen_at)
    VALUES (uid, p_recipient_id, NOW(), NULL, NULL);

  created_at := NOW();
  should_push := push_now;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 3) list_recent_pokes — include surrogate id so the UI can key/act on
--    individual rows (delete one card without nuking siblings).
DROP FUNCTION IF EXISTS list_recent_pokes();
CREATE FUNCTION list_recent_pokes()
RETURNS TABLE (
  id BIGINT,
  sender_id UUID,
  username TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ,
  seen_at TIMESTAMPTZ
) AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
  SELECT
    pk.id,
    pk.sender_id,
    p.username,
    COALESCE(p.display_name, '')::TEXT,
    pk.created_at,
    pk.seen_at
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

-- 4) delete_poke — now keyed by surrogate id, recipient_id check still
--    enforces ownership.
DROP FUNCTION IF EXISTS delete_poke(UUID);
DROP FUNCTION IF EXISTS delete_poke(BIGINT);
CREATE FUNCTION delete_poke(p_poke_id BIGINT) RETURNS VOID AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM pokes
   WHERE id = p_poke_id AND recipient_id = uid;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
