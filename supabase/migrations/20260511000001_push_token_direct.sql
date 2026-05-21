-- Migrate push token storage from Expo Push tokens to raw FCM (Android) /
-- APNs (iOS) tokens. The friend-request-notify and poke-notify functions
-- are being rewritten to call FCM HTTP v1 + APNs HTTP/2 directly instead
-- of going through exp.host, so the stored token format changes too.
--
-- push_platform values:
--   'android'        -> push_token is an FCM registration token
--   'ios-sandbox'    -> APNs device token (hex), debug-built iOS app
--   'ios-production' -> APNs device token (hex), App Store / TestFlight

ALTER TABLE profiles DROP COLUMN IF EXISTS expo_push_token;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS push_platform TEXT
    CHECK (push_platform IN ('android', 'ios-sandbox', 'ios-production'));

CREATE INDEX IF NOT EXISTS idx_profiles_push_token
  ON profiles(push_token)
  WHERE push_token IS NOT NULL;
