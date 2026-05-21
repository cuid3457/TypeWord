-- Cap the cumulative bonus_premium_until window granted by apply_referral.
--
-- Without a cap, an attacker can create N email accounts and apply each
-- one's friend_code against their main account, stacking 7×N days of
-- bonus premium. There's no SQL-level dedupe primitive that distinguishes
-- "real new users" from "puppet accounts" (that's a device-fingerprint /
-- ASN job, handled out-of-band). What we CAN do here is bound the damage
-- by capping the bonus window at +90 days from now() — past that, further
-- referrals are recorded (audit trail intact) but grant no extra time.

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
  v_max_bonus_days CONSTANT INT := 90;
  v_now TIMESTAMPTZ := now();
  v_cap TIMESTAMPTZ := now() + (v_max_bonus_days * interval '1 day');
  v_new_until TIMESTAMPTZ;
BEGIN
  v_invitee_id := auth.uid();
  IF v_invitee_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT (au.is_anonymous IS TRUE)
    INTO v_is_anon
    FROM auth.users au
   WHERE au.id = v_invitee_id;
  IF v_is_anon THEN
    RAISE EXCEPTION 'must_sign_up' USING ERRCODE = 'P0001';
  END IF;

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

  INSERT INTO referrals (referrer_id, invitee_id)
  VALUES (v_referrer_id, v_invitee_id)
  ON CONFLICT (invitee_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN json_build_object('granted', false, 'reason', 'already_claimed');
  END IF;

  -- Add 7 days, but cap the resulting timestamp at now()+90d. Cumulative
  -- referral farming past the cap stops yielding additional time.
  UPDATE profiles
     SET bonus_premium_until = least(
       greatest(coalesce(bonus_premium_until, v_now), v_now) + (v_bonus_days * interval '1 day'),
       v_cap
     )
   WHERE user_id IN (v_referrer_id, v_invitee_id);

  SELECT bonus_premium_until INTO v_new_until
    FROM profiles WHERE user_id = v_invitee_id;

  RETURN json_build_object('granted', true, 'bonus_premium_until', v_new_until, 'bonus_days', v_bonus_days);
END;
$$;

REVOKE ALL ON FUNCTION apply_referral(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_referral(TEXT) TO authenticated;
