-- ============================================================
-- Admin view joining auth.users + profiles for dashboard-style
-- visibility: anonymous vs authenticated, plan, quota state,
-- auth provider, etc. Use filters in SQL Editor / Table Editor:
--
--   SELECT * FROM user_overview WHERE is_anonymous = true;
--   SELECT * FROM user_overview WHERE plan = 'premium';
--   SELECT * FROM user_overview WHERE image_extract_count >= 3;
--
-- No anon/authenticated grants — service_role only (Dashboard).
-- ============================================================

CREATE OR REPLACE VIEW public.user_overview AS
SELECT
  u.id                                                       AS user_id,
  u.email,
  u.is_anonymous,
  COALESCE(u.raw_app_meta_data->>'provider', 'anonymous')    AS auth_provider,
  u.created_at                                               AS signed_up_at,
  u.last_sign_in_at,
  p.plan,
  p.country_code,
  p.timezone,
  p.native_language,
  p.image_extract_bucket,
  p.image_extract_count,
  p.timezone_last_changed_at,
  -- Lifetime API usage (audit log totals)
  (SELECT count(*) FROM public.api_calls ac
    WHERE ac.user_id = u.id AND ac.status = 'ok')            AS lifetime_api_calls,
  (SELECT count(*) FROM public.api_calls ac
    WHERE ac.user_id = u.id
      AND ac.status  = 'ok'
      AND ac.endpoint = 'image-extract')                      AS lifetime_image_extracts,
  (SELECT count(*) FROM public.api_calls ac
    WHERE ac.user_id = u.id
      AND ac.status  = 'ok'
      AND ac.endpoint = 'word-lookup')                        AS lifetime_word_lookups,
  (SELECT coalesce(sum(cost_usd), 0)::numeric(10,4)
     FROM public.api_calls ac
    WHERE ac.user_id = u.id AND ac.status = 'ok')            AS lifetime_cost_usd
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id;

-- Only service_role (Dashboard / admin) can read this — never exposed to clients.
REVOKE ALL ON public.user_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_overview TO service_role;
