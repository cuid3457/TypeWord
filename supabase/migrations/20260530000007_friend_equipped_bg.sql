-- Surface each friend's equipped profile background on get_my_friends so
-- the friend list can render the customized avatar color without an extra
-- round-trip per row.
--
-- equipped_background_id is unconditionally exposed (i.e. not gated behind
-- stats_public) because profile customization is treated as public
-- presentation, matching display_name + username visibility.

DROP FUNCTION IF EXISTS get_my_friends();

CREATE OR REPLACE FUNCTION get_my_friends()
RETURNS TABLE (
  friend_id UUID,
  display_name TEXT,
  username TEXT,
  stats_public BOOLEAN,
  streak_current INT,
  xp_total BIGINT,
  equipped_background_id TEXT
) AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  SELECT
    p.user_id,
    COALESCE(p.display_name, 'Friend')::TEXT,
    p.username,
    p.stats_public,
    CASE WHEN p.stats_public THEN compute_user_streak(p.user_id) ELSE NULL END,
    CASE WHEN p.stats_public THEN p.xp_total ELSE NULL END,
    inv.equipped_background_id
  FROM friendships f
  JOIN profiles p ON p.user_id = f.friend_id
  LEFT JOIN user_inventory inv ON inv.user_id = p.user_id
  WHERE f.user_id = uid
  ORDER BY p.display_name NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Re-apply the search_path hardening + grants that the previous migrations
-- attached to this function name. CREATE OR REPLACE preserves grants only
-- if the signature is identical — adding a return column counts as a new
-- signature, so we re-set both.
ALTER FUNCTION public.get_my_friends() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_my_friends() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_friends() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_friends() TO authenticated, service_role;
