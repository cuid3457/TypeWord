-- Expo push token storage for friend-request notifications.
-- The token is registered on app start (after auth) and refreshed any time
-- it changes. The friend-request-notify edge function reads it to deliver
-- a push to the recipient.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_expo_push_token
  ON profiles(expo_push_token)
  WHERE expo_push_token IS NOT NULL;
