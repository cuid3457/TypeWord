/**
 * Word lookup version routing.
 *
 * Default: v2 (the committed architecture). v1 stays deployed on the
 * server as a backup but the client always calls v2 unless explicitly
 * overridden for dev comparison.
 *
 * Override via .env.local:
 *   EXPO_PUBLIC_USE_V2_LOOKUP=false   (force v1 for local A/B testing)
 *
 * Setting "false" is a developer-only escape hatch — production builds
 * always route to v2.
 */
export const USE_V2_LOOKUP =
  process.env.EXPO_PUBLIC_USE_V2_LOOKUP !== 'false';

/**
 * v2 reverse-lookup ("translate" mode) ships as of 2026-05-14 —
 * native-lang → study-lang candidates via a dedicated REVERSE_LOOKUP
 * prompt and a reverse_lookups cache table. v1's translate path is
 * being decommissioned.
 */
export const V2_SUPPORTS_TRANSLATE_MODE = true;
