-- Enable Supabase Realtime broadcasts for the friendships table so the
-- dashboard can react to acceptance the moment a friendship row is
-- inserted, without waiting on a push notification (iOS foreground push
-- listener proved unreliable in practice). INSERT events deliver the
-- full row regardless of REPLICA IDENTITY, so no further setup needed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
  END IF;
END $$;
