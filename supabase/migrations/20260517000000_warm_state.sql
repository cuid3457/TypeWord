-- Global warm-state coordinator for OpenAI prompt cache.
--
-- Problem: OpenAI prompt cache has a ~5-10 min TTL. Without traffic, the
-- cache goes cold and the first real user lookup eats an extra 500ms-1s.
-- A naive periodic ping (server pg_cron OR client foreground interval)
-- works but wastes OpenAI calls during high-traffic periods when the cache
-- is already warm from real users.
--
-- Solution: a single shared timestamp (last_real_call_at) updated by the
-- edge function on every real OpenAI call. The warm-check endpoint reads
-- this timestamp and only fires a dummy OpenAI call if last_real_call_at
-- is older than 5 min. During busy periods, every warm-check returns "warm"
-- without spending an OpenAI call.
--
-- Storage: one row keyed at id=1. Trivial size; updated frequently but
-- a single row UPSERT is fast.

CREATE TABLE IF NOT EXISTS warm_state (
  id INTEGER PRIMARY KEY,
  last_real_call_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed singleton row.
INSERT INTO warm_state (id, last_real_call_at)
VALUES (1, NOW())
ON CONFLICT (id) DO NOTHING;

-- RLS: read by anyone (clients can check status); write by service_role
-- only (edge function uses service_role for updates).
ALTER TABLE warm_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warm_state_read_all ON warm_state;
CREATE POLICY warm_state_read_all ON warm_state
  FOR SELECT
  USING (true);

-- No INSERT / UPDATE policy = only service_role can write (bypasses RLS).
