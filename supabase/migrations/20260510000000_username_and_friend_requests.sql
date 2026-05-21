-- Username system + friend request flow.
--
-- New model:
--   - profiles.username: unique multi-script handle (Latin/Hangul/Hiragana+Katakana/Han/Cyrillic).
--     Stored as NFC-normalized text. Latin/Cyrillic stored lowercase. CJK as-is.
--     Uniqueness is case-insensitive (LOWER index).
--   - friend_requests: pending state between users. Sender creates → recipient
--     accepts/rejects. Accept atomically deletes the request + creates the
--     symmetric friendships rows (mirrors current friendships symmetry).
--   - Old friend_code stays in profiles for backend identity / disambiguation
--     hints. add_friend_by_code RPC is retained for backward compat but no
--     longer surfaced in UI.
--
-- Profanity / script / reserved-word validation runs in the username-set
-- edge function (uses OpenAI Moderation + multilingual blocklist). The SQL
-- set_username RPC checks only format/length/uniqueness; the edge function
-- gates ALL writes from clients.

-- ── profile column ─────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Case-insensitive uniqueness (Latin/Cyrillic). CJK has no case so LOWER is identity.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON profiles(LOWER(username))
  WHERE username IS NOT NULL;

-- Server-side format guard. The edge function does the real work; this is a
-- last-line defense against malformed direct writes.
ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (
    username IS NULL
    OR (char_length(username) BETWEEN 3 AND 20
        AND username ~ '^[A-Za-z0-9가-힣ぁ-ゖァ-ヺ々〆〤一-龯々-〇一-鿿㐀-䶿а-яА-Я._]+$'
        AND username !~ '^[._0-9]'
        AND username !~ '[._]$'
        AND username !~ '[._]{2,}')
  );

-- ── friend_requests ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friend_requests (
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sender_id, recipient_id),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_recipient
  ON friend_requests(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
  ON friend_requests(sender_id, created_at DESC);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see requests they sent or received"
  ON friend_requests FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- INSERT/DELETE go through RPCs only.

-- ── set_username RPC ───────────────────────────────────────────
-- Format/uniqueness check + write. Profanity / moderation / reserved-word
-- checks happen in the edge function before this RPC is called.
-- Anonymous users cannot set a username (same gate as friend_code).
CREATE OR REPLACE FUNCTION set_username(p_username TEXT) RETURNS VOID AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  norm TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'Sign up to set a username' USING ERRCODE = 'P0001';
  END IF;
  IF p_username IS NULL OR length(trim(p_username)) = 0 THEN
    RAISE EXCEPTION 'Username required' USING ERRCODE = 'P0010';
  END IF;

  -- Trim. Edge function is responsible for NFC normalization + script/profanity checks.
  norm := trim(p_username);

  IF char_length(norm) < 3 OR char_length(norm) > 20 THEN
    RAISE EXCEPTION 'Username must be 3-20 characters' USING ERRCODE = 'P0011';
  END IF;

  -- Uniqueness check (case-insensitive)
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE LOWER(username) = LOWER(norm)
      AND user_id <> uid
  ) THEN
    RAISE EXCEPTION 'Username already taken' USING ERRCODE = 'P0012';
  END IF;

  INSERT INTO profiles (user_id, username) VALUES (uid, norm)
    ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── username availability check ────────────────────────────────
-- Cheap pre-check for the input form. Returns TRUE if the username is free.
-- Does NOT validate format / profanity — those are edge function concerns.
CREATE OR REPLACE FUNCTION username_available(p_username TEXT) RETURNS BOOLEAN AS $$
BEGIN
  IF p_username IS NULL OR length(trim(p_username)) = 0 THEN
    RETURN FALSE;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE LOWER(username) = LOWER(trim(p_username))
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── search_users_by_username RPC ───────────────────────────────
-- Prefix match against username. Returns up to 10 results, excluding the
-- caller, blocked users, and existing friends. Anonymous callers get nothing.
CREATE OR REPLACE FUNCTION search_users_by_username(p_query TEXT)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  has_pending_request BOOLEAN
) AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  q TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RETURN;
  END IF;
  q := LOWER(trim(p_query));
  IF q IS NULL OR length(q) < 1 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    p.user_id,
    p.username,
    COALESCE(p.display_name, '')::TEXT,
    EXISTS (
      SELECT 1 FROM friend_requests fr
      WHERE fr.sender_id = uid AND fr.recipient_id = p.user_id
    )
  FROM profiles p
  WHERE p.username IS NOT NULL
    AND LOWER(p.username) LIKE q || '%'
    AND p.user_id <> uid
    AND NOT EXISTS (
      SELECT 1 FROM friend_blocks b
      WHERE (b.blocker_id = uid AND b.blocked_id = p.user_id)
         OR (b.blocker_id = p.user_id AND b.blocked_id = uid)
    )
    AND NOT EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.user_id = uid AND f.friend_id = p.user_id
    )
  ORDER BY length(p.username), LOWER(p.username)
  LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── send_friend_request RPC ────────────────────────────────────
-- Looks up recipient by username, validates state, creates the pending
-- request. Returns recipient user_id on success. If the recipient already
-- sent ME a request, this auto-accepts (mutual desire = friendship).
CREATE OR REPLACE FUNCTION send_friend_request(p_username TEXT)
RETURNS TABLE (recipient_id UUID, auto_accepted BOOLEAN) AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  rid UUID;
  reverse_exists BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'Sign up to send friend requests' USING ERRCODE = 'P0001';
  END IF;

  SELECT user_id INTO rid FROM profiles
    WHERE LOWER(username) = LOWER(trim(p_username));
  IF rid IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF rid = uid THEN
    RAISE EXCEPTION 'Cannot send request to yourself' USING ERRCODE = 'P0003';
  END IF;
  -- Block check (either direction = silently treat as not_found)
  IF EXISTS (
    SELECT 1 FROM friend_blocks
    WHERE (blocker_id = uid AND blocked_id = rid)
       OR (blocker_id = rid AND blocked_id = uid)
  ) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  -- Already friends?
  IF EXISTS (SELECT 1 FROM friendships WHERE user_id = uid AND friend_id = rid) THEN
    RAISE EXCEPTION 'Already friends' USING ERRCODE = 'P0004';
  END IF;
  -- Reverse pending request? auto-accept (both wanted to befriend).
  SELECT EXISTS (
    SELECT 1 FROM friend_requests
    WHERE sender_id = rid AND recipient_id = uid
  ) INTO reverse_exists;
  IF reverse_exists THEN
    DELETE FROM friend_requests
      WHERE (sender_id = rid AND recipient_id = uid)
         OR (sender_id = uid AND recipient_id = rid);
    INSERT INTO friendships (user_id, friend_id) VALUES (uid, rid)
      ON CONFLICT DO NOTHING;
    INSERT INTO friendships (user_id, friend_id) VALUES (rid, uid)
      ON CONFLICT DO NOTHING;
    recipient_id := rid;
    auto_accepted := TRUE;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Insert pending (idempotent — re-sending is a no-op)
  INSERT INTO friend_requests (sender_id, recipient_id) VALUES (uid, rid)
    ON CONFLICT DO NOTHING;
  recipient_id := rid;
  auto_accepted := FALSE;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── accept_friend_request RPC ──────────────────────────────────
CREATE OR REPLACE FUNCTION accept_friend_request(p_sender_id UUID) RETURNS VOID AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM friend_requests
    WHERE sender_id = p_sender_id AND recipient_id = uid
  ) THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  -- Block check (defensive — request shouldn't survive a block, but be safe)
  IF EXISTS (
    SELECT 1 FROM friend_blocks
    WHERE (blocker_id = uid AND blocked_id = p_sender_id)
       OR (blocker_id = p_sender_id AND blocked_id = uid)
  ) THEN
    DELETE FROM friend_requests
      WHERE sender_id = p_sender_id AND recipient_id = uid;
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM friend_requests
    WHERE sender_id = p_sender_id AND recipient_id = uid;
  INSERT INTO friendships (user_id, friend_id) VALUES (uid, p_sender_id)
    ON CONFLICT DO NOTHING;
  INSERT INTO friendships (user_id, friend_id) VALUES (p_sender_id, uid)
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── reject_friend_request RPC ──────────────────────────────────
CREATE OR REPLACE FUNCTION reject_friend_request(p_sender_id UUID) RETURNS VOID AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM friend_requests
    WHERE sender_id = p_sender_id AND recipient_id = uid;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── cancel_friend_request RPC ──────────────────────────────────
-- Sender cancels their own outgoing request.
CREATE OR REPLACE FUNCTION cancel_friend_request(p_recipient_id UUID) RETURNS VOID AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM friend_requests
    WHERE sender_id = uid AND recipient_id = p_recipient_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── list_incoming_friend_requests RPC ──────────────────────────
CREATE OR REPLACE FUNCTION list_incoming_friend_requests()
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
    fr.sender_id,
    p.username,
    COALESCE(p.display_name, '')::TEXT,
    fr.created_at
  FROM friend_requests fr
  JOIN profiles p ON p.user_id = fr.sender_id
  WHERE fr.recipient_id = uid
    AND NOT EXISTS (
      SELECT 1 FROM friend_blocks b
      WHERE b.blocker_id = uid AND b.blocked_id = fr.sender_id
    )
  ORDER BY fr.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── list_outgoing_friend_requests RPC ──────────────────────────
CREATE OR REPLACE FUNCTION list_outgoing_friend_requests()
RETURNS TABLE (
  recipient_id UUID,
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
    fr.recipient_id,
    p.username,
    COALESCE(p.display_name, '')::TEXT,
    fr.created_at
  FROM friend_requests fr
  JOIN profiles p ON p.user_id = fr.recipient_id
  WHERE fr.sender_id = uid
  ORDER BY fr.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
