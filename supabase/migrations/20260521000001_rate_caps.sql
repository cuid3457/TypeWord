-- Pre-launch rate caps on report / friend-request endpoints.
-- Audit findings H-1, H-2, H-3: each of the user-facing report / request
-- RPCs and INSERT policies lets a single authenticated account flood the
-- system. This migration adds conservative per-reporter daily / hourly
-- caps. Caps are tuned so legitimate users never hit them in normal use,
-- but a malicious script gets stopped within a few iterations.

-- ── H-1: report_user — UNIQUE per (reporter, target) + 30/day cap ──
-- Drop the "no unique by design" behavior. One legitimate report per
-- reporter→target is plenty; repeated reports just spam friend_reports
-- without adding signal. Match the UNIQUE constraint already enforced
-- on community_wordlist_reports.
ALTER TABLE friend_reports
  ADD CONSTRAINT friend_reports_uniq_pair UNIQUE (reporter_id, reported_id);

CREATE OR REPLACE FUNCTION report_user(
  p_user_id UUID,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  exists_target BOOLEAN;
  day_count INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'Sign up to report' USING ERRCODE = 'P0001';
  END IF;
  IF uid = p_user_id THEN
    RAISE EXCEPTION 'Cannot report yourself' USING ERRCODE = 'P0003';
  END IF;
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) INTO exists_target;
  IF NOT exists_target THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Reason required' USING ERRCODE = 'P0010';
  END IF;
  -- Per-reporter rate cap: 30 distinct user reports per 24h is generous
  -- for legit moderation but stops mass flooding.
  SELECT count(*) INTO day_count FROM friend_reports
    WHERE reporter_id = uid AND created_at > NOW() - INTERVAL '1 day';
  IF day_count >= 30 THEN
    RAISE EXCEPTION 'Daily report limit reached. Try again tomorrow.' USING ERRCODE = 'P0011';
  END IF;
  -- UPSERT: re-reporting the same user overwrites the reason (no row pile-up).
  INSERT INTO friend_reports (reporter_id, reported_id, reason)
  VALUES (uid, p_user_id,
    CASE WHEN p_description IS NULL OR length(trim(p_description)) = 0
         THEN trim(p_reason)
         ELSE trim(p_reason) || ' | ' || trim(p_description) END)
  ON CONFLICT (reporter_id, reported_id) DO UPDATE
    SET reason = EXCLUDED.reason,
        created_at = NOW();
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ── H-2: send_friend_request — 50/day per sender ──
CREATE OR REPLACE FUNCTION send_friend_request(p_username TEXT)
RETURNS TABLE (recipient_id UUID, auto_accepted BOOLEAN) AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  rid UUID;
  reverse_exists BOOLEAN;
  day_count INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT u.is_anonymous INTO is_anon FROM auth.users u WHERE u.id = uid;
  IF is_anon THEN
    RAISE EXCEPTION 'Sign up to send friend requests' USING ERRCODE = 'P0001';
  END IF;
  -- Daily cap to prevent username-dictionary enumeration / spam.
  SELECT count(*) INTO day_count FROM friend_requests
    WHERE sender_id = uid AND created_at > NOW() - INTERVAL '1 day';
  IF day_count >= 50 THEN
    RAISE EXCEPTION 'Daily friend request limit reached. Try again tomorrow.' USING ERRCODE = 'P0011';
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

-- ── H-3: content_reports — per-user hourly cap via BEFORE INSERT trigger ──
-- Reports flow into process-report; each unprocessed (word, src, tgt)
-- triple costs ~$0.02 in OpenAI judge+regen+verify. A single user flooding
-- with 1000 distinct words = $20 in attacker-controlled spend per pass.
CREATE OR REPLACE FUNCTION enforce_content_report_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  hour_count INT;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO hour_count FROM content_reports
    WHERE user_id = NEW.user_id
      AND created_at > NOW() - INTERVAL '1 hour';
  IF hour_count >= 10 THEN
    RAISE EXCEPTION 'Too many reports in the last hour. Please slow down.'
      USING ERRCODE = 'P0011';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_reports_rate_limit ON content_reports;
CREATE TRIGGER trg_content_reports_rate_limit
  BEFORE INSERT ON content_reports
  FOR EACH ROW EXECUTE FUNCTION enforce_content_report_rate_limit();
