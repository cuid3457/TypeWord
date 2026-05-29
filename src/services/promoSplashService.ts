import { supabase } from '@src/api/supabase';

export interface PromoSplash {
  /** Campaign id — for impression/dedup tracking once that's added. */
  id: string;
  /** Full-bleed promo image (text baked into the design, so no i18n keys). */
  imageUrl: string;
  /** Optional background behind the image while it loads. Defaults to the brand mint. */
  backgroundColor?: string;
  /** expo-router path / deep link opened when the user taps the promo. */
  ctaRoute?: string;
  /** Auto-dismiss after this many ms. Defaults to PROMO_DEFAULT_MS in the overlay. */
  durationMs?: number;
}

// Flip to true once the `app_promotions` table exists and a campaign is
// scheduled. Until then we short-circuit so cold boot does zero extra
// network work and the splash stays exactly as it is today (character only).
//
// Table sketch for when we turn this on:
//   create table app_promotions (
//     id uuid primary key default gen_random_uuid(),
//     active boolean not null default false,
//     image_url text not null,
//     background_color text,
//     cta_route text,
//     duration_ms int,
//     priority int not null default 0,
//     starts_at timestamptz not null default now(),
//     ends_at timestamptz not null default now(),
//     created_at timestamptz not null default now()
//   );
// Public read policy on (active = true and now() between starts_at and ends_at).
const PROMO_SPLASH_ENABLED = false;

export async function fetchActivePromo(): Promise<PromoSplash | null> {
  if (!PROMO_SPLASH_ENABLED) return null;
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('app_promotions')
      .select('id, image_url, background_color, cta_route, duration_ms')
      .eq('active', true)
      .lte('starts_at', now)
      .gte('ends_at', now)
      .order('priority', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      imageUrl: data.image_url,
      backgroundColor: data.background_color ?? undefined,
      ctaRoute: data.cta_route ?? undefined,
      durationMs: data.duration_ms ?? undefined,
    };
  } catch {
    return null;
  }
}
