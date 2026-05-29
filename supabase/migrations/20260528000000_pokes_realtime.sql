-- Enable Supabase Realtime broadcasts for the pokes table so the
-- notifications inbox and dashboard badge update in foreground without
-- relying on the expo-notifications push listener (iOS foreground
-- delivery is unreliable; mirrors the friendships realtime pattern).
-- send_poke INSERTs on first poke and UPDATEs created_at on re-poke,
-- so subscribers should listen to both events.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pokes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pokes;
  END IF;
END $$;
