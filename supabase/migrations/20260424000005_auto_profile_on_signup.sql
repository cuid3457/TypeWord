-- ============================================================
-- Auto-create a profile row whenever a new auth.users row is
-- created (Google, email, or anonymous). Mirrors Supabase's
-- recommended auth → profile sync pattern.
--
-- Also backfills profiles for any existing users that don't
-- have one yet (legacy anonymous sessions, etc.).
-- ============================================================

-- ── Trigger function ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, plan)
  VALUES (NEW.id, NEW.email, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── Trigger ──
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Backfill missing profiles ──
-- Existing auth.users rows without a matching profile get one with defaults.
-- email stays null for anonymous users (which matches auth.users.email).
INSERT INTO public.profiles (user_id, email, plan)
SELECT u.id, u.email, 'free'
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
