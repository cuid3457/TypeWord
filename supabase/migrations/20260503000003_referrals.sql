-- Referral bonus system: invitee signs up via a referrer's friend code →
-- both sides get 7 days of bonus premium that stacks on top of any active
-- RevenueCat subscription. One-time per invitee.
--
--   profiles.bonus_premium_until — wall-clock timestamp; treated as premium
--     by the client whenever now() <= bonus_premium_until. Independent of
--     RevenueCat entitlement so granting a bonus doesn't risk colliding
--     with the paid subscription state.
--
--   referrals — log of referrer→invitee pairs. Unique on invitee_id so one
--     account can only be referred once. Used to prevent re-claim.
--
--   apply_referral RPC — called by the invitee right after sign-up. Looks
--     up the referrer by code, inserts the referrals row, and grants 7
--     days bonus premium to BOTH users.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bonus_premium_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals_self_read" ON referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = invitee_id);

DROP FUNCTION IF EXISTS apply_referral(TEXT);

CREATE OR REPLACE FUNCTION apply_referral(p_inviter_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitee_id UUID;
  v_referrer_id UUID;
  v_is_anon BOOLEAN;
  v_bonus_days CONSTANT INT := 7;
  v_now TIMESTAMPTZ := now();
  v_new_until TIMESTAMPTZ;
BEGIN
  v_invitee_id := auth.uid();
  IF v_invitee_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Anonymous users don't qualify — bonus only applies after sign-up.
  SELECT (au.is_anonymous IS TRUE)
    INTO v_is_anon
    FROM auth.users au
   WHERE au.id = v_invitee_id;
  IF v_is_anon THEN
    RAISE EXCEPTION 'must_sign_up' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve the inviter's user id from the public friend code.
  SELECT user_id
    INTO v_referrer_id
    FROM profiles
   WHERE friend_code = upper(trim(p_inviter_code));
  IF v_referrer_id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_referrer_id = v_invitee_id THEN
    RAISE EXCEPTION 'self' USING ERRCODE = 'P0003';
  END IF;

  -- One-time only: the unique constraint on invitee_id makes a re-claim a
  -- no-op. We swallow the conflict so the client can call this idempotently.
  INSERT INTO referrals (referrer_id, invitee_id)
  VALUES (v_referrer_id, v_invitee_id)
  ON CONFLICT (invitee_id) DO NOTHING;

  IF NOT FOUND THEN
    -- Already claimed — return current state without re-granting.
    RETURN json_build_object('granted', false, 'reason', 'already_claimed');
  END IF;

  -- Grant 7 days of bonus premium to both users. greatest() so an active
  -- bonus window extends from its end, not from now().
  UPDATE profiles
     SET bonus_premium_until = greatest(coalesce(bonus_premium_until, v_now), v_now) + (v_bonus_days * interval '1 day')
   WHERE user_id IN (v_referrer_id, v_invitee_id);

  SELECT bonus_premium_until INTO v_new_until
    FROM profiles WHERE user_id = v_invitee_id;

  RETURN json_build_object('granted', true, 'bonus_premium_until', v_new_until, 'bonus_days', v_bonus_days);
END;
$$;

REVOKE ALL ON FUNCTION apply_referral(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_referral(TEXT) TO authenticated;
