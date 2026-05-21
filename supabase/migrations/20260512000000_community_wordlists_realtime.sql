-- Enable Supabase Realtime broadcasts for community_wordlists so the
-- library tab can react to new uploads in real time without waiting for
-- a tab refocus (same approach as friendships in 20260511000002).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'community_wordlists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_wordlists;
  END IF;
END $$;
