-- IP-based daily rate limit — backup ceiling against bot farms that rotate
-- through many accounts on the same network. Per-user perDay cap blocks
-- single-account abuse; this blocks multi-account abuse on one IP.
--
-- Limit set generously (5000/day) so shared-NAT IPs (Korean carrier IPs can
-- host hundreds of legitimate users) aren't impacted. An attacker concen-
-- trating 100 free accounts on one IP would still cap at 5000 lookups/day
-- on that IP (vs ~10M theoretical without this guard).
--
-- IPs are hashed (SHA-256 first 16 hex chars) by the edge function before
-- being passed in — we never persist raw IPs (GDPR-friendly).

CREATE TABLE IF NOT EXISTS public.ip_daily_counts (
  ip_hash TEXT NOT NULL,
  day DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);
CREATE INDEX IF NOT EXISTS idx_ip_daily_counts_day ON public.ip_daily_counts (day);

-- Atomic upsert-and-check. Returns the post-increment count + an `over` flag.
-- SECURITY DEFINER so anon callers via service_role can use it without RLS.
CREATE OR REPLACE FUNCTION public.check_and_inc_ip_limit(
  p_ip_hash TEXT,
  p_limit INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.ip_daily_counts (ip_hash, day, count)
  VALUES (p_ip_hash, current_date, 1)
  ON CONFLICT (ip_hash, day)
  DO UPDATE SET count = public.ip_daily_counts.count + 1
  RETURNING count INTO v_count;
  RETURN json_build_object('count', v_count, 'over', v_count > p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_inc_ip_limit(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_inc_ip_limit(TEXT, INT) TO service_role;

-- Daily cleanup via pg_cron — keep only the last 3 days. Rows older than
-- that are useless (we only count current day). Prevents unbounded growth.
SELECT cron.schedule(
  'ip-daily-counts-cleanup',
  '15 3 * * *',
  $$DELETE FROM public.ip_daily_counts WHERE day < current_date - interval '3 days'$$
);
