-- Tighten profile name constraints:
--   • Bump username minimum from 3 → 4 chars (squat protection without
--     locking out short common handles like Twitter's 4-char min).
--   • Add server-side length CHECK on display_name (1-20 NFC code units).
--     Previously unbounded — clients enforced 20 but direct DB writes (or
--     a bypassed client) could insert arbitrary length.
--
-- Both CHECKs use NOT VALID so pre-existing rows are grandfathered:
--   - Existing 3-char usernames keep working; only NEW writes need 4+.
--   - Existing display_names from social-login (Google / Apple) that
--     exceed 20 chars (e.g. "Junseong Park-Smith Jr.") aren't broken.
-- The edge functions (username-set, display-name-set) enforce the new
-- limits strictly for all new writes; the CHECK is defense-in-depth.

-- ── username: 3 → 4 ────────────────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (
    username IS NULL
    OR (char_length(username) BETWEEN 4 AND 20
        AND username ~ '^[A-Za-z0-9가-힣ぁ-ゖァ-ヺ々〆〤一-龯々-〇一-鿿㐀-䶿а-яА-Я._]+$'
        AND username !~ '^[._0-9]'
        AND username !~ '[._]$'
        AND username !~ '[._]{2,}')
  ) NOT VALID;

-- ── display_name: 1-20 ─────────────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_display_name_length;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_display_name_length
  CHECK (
    display_name IS NULL
    OR (char_length(display_name) BETWEEN 1 AND 20)
  ) NOT VALID;

-- ── set_username RPC: update min from 3 → 4 ────────────────────
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

  norm := trim(p_username);

  IF char_length(norm) < 4 OR char_length(norm) > 20 THEN
    RAISE EXCEPTION 'Username must be 4-20 characters' USING ERRCODE = 'P0011';
  END IF;

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

-- search_path hardening (matches existing security-baseline pattern).
ALTER FUNCTION set_username(TEXT) SET search_path = public, pg_temp;
