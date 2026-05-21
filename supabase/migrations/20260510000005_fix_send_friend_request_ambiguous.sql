-- Fix: send_friend_request fails with "column reference 'recipient_id' is
-- ambiguous". The RETURNS TABLE OUT column shares its name with
-- friend_requests.recipient_id, and the EXISTS / DELETE inside the function
-- referenced the bare column name. Qualify table refs with an alias.

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

  SELECT p.user_id INTO rid FROM profiles p
    WHERE LOWER(p.username) = LOWER(trim(p_username));
  IF rid IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF rid = uid THEN
    RAISE EXCEPTION 'Cannot send request to yourself' USING ERRCODE = 'P0003';
  END IF;
  IF EXISTS (
    SELECT 1 FROM friend_blocks b
    WHERE (b.blocker_id = uid AND b.blocked_id = rid)
       OR (b.blocker_id = rid AND b.blocked_id = uid)
  ) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM friendships f WHERE f.user_id = uid AND f.friend_id = rid
  ) THEN
    RAISE EXCEPTION 'Already friends' USING ERRCODE = 'P0004';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM friend_requests fr
    WHERE fr.sender_id = rid AND fr.recipient_id = uid
  ) INTO reverse_exists;
  IF reverse_exists THEN
    DELETE FROM friend_requests fr
      WHERE (fr.sender_id = rid AND fr.recipient_id = uid)
         OR (fr.sender_id = uid AND fr.recipient_id = rid);
    INSERT INTO friendships (user_id, friend_id) VALUES (uid, rid)
      ON CONFLICT DO NOTHING;
    INSERT INTO friendships (user_id, friend_id) VALUES (rid, uid)
      ON CONFLICT DO NOTHING;
    recipient_id := rid;
    auto_accepted := TRUE;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO friend_requests (sender_id, recipient_id) VALUES (uid, rid)
    ON CONFLICT DO NOTHING;
  recipient_id := rid;
  auto_accepted := FALSE;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
