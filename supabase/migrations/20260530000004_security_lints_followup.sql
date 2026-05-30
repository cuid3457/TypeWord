-- Follow-up to 20260530000003: catch 3 SECURITY DEFINER functions that the
-- comeback_boost migration created/replaced without SET search_path, and
-- explicitly revoke anon EXECUTE on activate_comeback_boost_if_eligible.
--
-- CREATE OR REPLACE FUNCTION doesn't preserve function-level SET search_path
-- from prior ALTER FUNCTION statements — so any earlier hardening got reverted
-- when comeback_boost re-defined award_points and get_inventory.

BEGIN;

-- A. SET search_path on the 3 affected functions
DO $$
DECLARE
  fn_name TEXT;
  fn_names TEXT[] := ARRAY[
    'activate_comeback_boost_if_eligible',
    'get_inventory',
    'award_points'
  ];
  alter_stmts TEXT;
BEGIN
  FOREACH fn_name IN ARRAY fn_names LOOP
    SELECT string_agg(
      format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
             fn_name, pg_get_function_identity_arguments(p.oid)),
      '; '
    )
    INTO alter_stmts
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = fn_name;
    IF alter_stmts IS NOT NULL THEN
      EXECUTE alter_stmts;
    END IF;
  END LOOP;
END $$;

-- B. activate_comeback_boost_if_eligible — REVOKE explicit anon EXECUTE
--    (comeback_boost migration only revoked PUBLIC; Supabase's default
--     anon role still inherited via Postgres role hierarchy.)
DO $$
DECLARE args TEXT;
BEGIN
  FOR args IN
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'activate_comeback_boost_if_eligible'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',
                   'activate_comeback_boost_if_eligible', args);
  END LOOP;
END $$;

COMMIT;
