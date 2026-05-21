-- Pokes inbox: read state vs visibility decoupled.
--
-- Previously list_recent_pokes filtered out seen pokes, so the moment the
-- user opened the notifications modal the items vanished. Better UX: keep
-- pokes visible for 7 days regardless of read state (gray-out seen ones in
-- UI), let the user manually delete them, and rely on the 7-day window for
-- automatic cleanup.

-- ── list_recent_pokes — return all pokes within 7 days, seen or unseen ──
DROP FUNCTION IF EXISTS list_recent_pokes();
CREATE FUNCTION list_recent_pokes()
RETURNS TABLE (
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

-- ── count_unseen_pokes — bell badge count source ───────────────
CREATE OR REPLACE FUNCTION count_unseen_pokes() RETURNS INTEGER AS $$
DECLARE
  uid UUID := auth.uid();
  n INTEGER;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO n
    FROM pokes pk
    WHERE pk.recipient_id = uid
      AND pk.seen_at IS NULL
      AND pk.created_at >= NOW() - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM friend_blocks b
        WHERE b.blocker_id = uid AND b.blocked_id = pk.sender_id
      );
  RETURN COALESCE(n, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── delete_poke — recipient removes a single poke from their inbox ──
CREATE OR REPLACE FUNCTION delete_poke(p_sender_id UUID) RETURNS VOID AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM pokes
   WHERE sender_id = p_sender_id AND recipient_id = uid;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
