-- ============================================================
-- Fix: tg_set_updated_at was overwriting client-supplied updated_at
-- on every UPDATE, causing sync round-trips to bump timestamps to
-- server NOW() — which broke streak/todayDone calculations
-- (locally-old activity appeared as "today" after sync).
--
-- New behavior: only set updated_at = NOW() when the client did NOT
-- explicitly change it (i.e., NEW.updated_at = OLD.updated_at).
-- This preserves client-authored timestamps during sync, while still
-- auto-stamping any server-side direct edits.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;
