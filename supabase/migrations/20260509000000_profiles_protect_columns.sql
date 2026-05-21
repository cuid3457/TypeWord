-- Lock down sensitive columns on public.profiles.
--
-- The existing RLS policy (profiles_owner_all) lets a user UPDATE any column
-- on their own row, including plan / bonus_premium_until / image_extract_*.
-- That means a malicious authenticated client can self-grant pro by hitting
-- PostgREST directly:
--   PATCH /rest/v1/profiles?user_id=eq.<self>  { "plan": "pro", ... }
--
-- Fix: BEFORE UPDATE trigger that rejects diffs on protected columns unless
-- the caller is service_role (set via Supabase's request.jwt.claims). The
-- legitimate writers of these columns are:
--   • plan / bonus_premium_until → revenuecat-webhook + apply_referral RPC
--     (both run with service_role / SECURITY DEFINER)
--   • image_extract_*            → try_consume_image_extract_quota RPC
--   • friend_code                → handle_new_user trigger (server)
--   • user_id                    → never (PK, immutable)
--
-- INSERT path is left to the existing handle_new_user trigger; clients can't
-- INSERT into profiles directly because the WITH CHECK still requires
-- auth.uid() = user_id and a row already exists from the auth.users trigger.

CREATE OR REPLACE FUNCTION public.tg_profiles_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Service role bypass. PostgREST sets request.jwt.claims with the JWT
  -- payload; SECURITY DEFINER RPCs that swap auth.uid() are not service_role
  -- per se, so we additionally allow when the trigger fires from inside a
  -- DEFINER context (current_user = postgres / supabase_admin) which is the
  -- case for our quota / referral RPCs.
  v_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    current_setting('request.jwt.claims', true)::json->>'role'
  );
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'profiles.user_id is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'profiles.plan is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.bonus_premium_until IS DISTINCT FROM OLD.bonus_premium_until THEN
    RAISE EXCEPTION 'profiles.bonus_premium_until is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.image_extract_count IS DISTINCT FROM OLD.image_extract_count THEN
    RAISE EXCEPTION 'profiles.image_extract_count is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.image_extract_bucket IS DISTINCT FROM OLD.image_extract_bucket THEN
    RAISE EXCEPTION 'profiles.image_extract_bucket is read-only for clients' USING ERRCODE = '42501';
  END IF;
  IF NEW.friend_code IS DISTINCT FROM OLD.friend_code THEN
    RAISE EXCEPTION 'profiles.friend_code is read-only for clients' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_profiles_protect_columns ON public.profiles;
CREATE TRIGGER tg_profiles_protect_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_protect_columns();
