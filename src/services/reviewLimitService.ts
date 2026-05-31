import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTier, type Tier } from './subscriptionService';

const STORAGE_KEY = 'typeword.reviewLimits';

export type ReviewMode = 'flashcard' | 'choice' | 'dictation' | 'context' | 'fill_blank' | 'auto';

/**
 * Per-tier daily card limit (combined across ALL review modes).
 * Free can extend via rewarded ads (+REWARDED_AD_BONUS per ad, capped at
 * REWARDED_AD_DAILY_CAP watches per day). Premium is unlimited.
 */
const DAILY_LIMIT: Record<Tier, number> = {
  free: 100,
  premium: Number.POSITIVE_INFINITY,
};

const REWARDED_AD_BONUS = 50;
const REWARDED_AD_DAILY_CAP = 3;

/**
 * Cumulative cards-per-interstitial. Session-end ad fires when today's used
 * count crosses a new multiple of this. Picking 30 ties to the free MAX_SESSION
 * so a 30-card sessioner sees one ad per session, while smaller-session users
 * still hit ~3-4 ads per 100-card daily limit.
 */
const INTERSTITIAL_BUCKET_SIZE = 30;

interface DailyState {
  date: string;
  used: number;             // total cards consumed today across all modes
  bonusEarned: number;      // total bonus cards earned today via rewarded ads
  adsWatched: number;       // count of rewarded ads watched today
  sessionsCompleted: number;// completed review sessions today (for first-session immunity)
  lastAdBucket: number;     // highest 30-card bucket already shown a session-end ad
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyState(): DailyState {
  return {
    date: todayKey(),
    used: 0,
    bonusEarned: 0,
    adsWatched: 0,
    sessionsCompleted: 0,
    lastAdBucket: 0,
  };
}

async function loadState(): Promise<DailyState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<DailyState> & {
        used?: number | Record<string, number>;
      };
      if (parsed.date === todayKey()) {
        // Migrate legacy per-mode shape: { dictation: N, context: M, ... } → sum.
        let used = 0;
        if (typeof parsed.used === 'number') {
          used = parsed.used;
        } else if (parsed.used && typeof parsed.used === 'object') {
          for (const v of Object.values(parsed.used)) {
            if (typeof v === 'number') used += v;
          }
        }
        return {
          date: parsed.date,
          used,
          bonusEarned: parsed.bonusEarned ?? 0,
          adsWatched: parsed.adsWatched ?? 0,
          sessionsCompleted: (parsed as { sessionsCompleted?: number }).sessionsCompleted ?? 0,
          lastAdBucket: (parsed as { lastAdBucket?: number }).lastAdBucket ?? 0,
        };
      }
    } catch { /* reset */ }
  }
  return emptyState();
}

async function saveState(state: DailyState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Effective daily limit for the current tier, including ad-earned bonus. */
function effectiveLimit(tier: Tier, bonusEarned: number): number {
  const base = DAILY_LIMIT[tier];
  if (!Number.isFinite(base)) return base;
  return base + bonusEarned;
}

/** Returns the unified daily card limit for the given tier (no bonus). */
export function getDailyLimit(tier: Tier = getTier()): number {
  return DAILY_LIMIT[tier];
}

/**
 * Cards remaining today, accounting for ad-earned bonus.
 * Mode parameter is accepted for backward compatibility but no longer affects
 * the count — all modes share a single unified daily counter.
 */
export async function getRemaining(_mode?: ReviewMode): Promise<number> {
  const tier = getTier();
  if (tier === 'premium') return Number.POSITIVE_INFINITY;
  const state = await loadState();
  return Math.max(0, effectiveLimit(tier, state.bonusEarned) - state.used);
}

/**
 * Backward-compatible: returns the same unified remaining count under each
 * mode key. New code should use getRemaining() directly.
 */
export async function getRemainingAll(): Promise<Record<ReviewMode, number>> {
  const remaining = await getRemaining();
  return {
    flashcard: remaining,
    choice: remaining,
    dictation: remaining,
    context: remaining,
    fill_blank: remaining,
    auto: remaining,
  };
}

/** Snapshot of today's usage. Useful for UI counters. */
export async function getDailyUsage(): Promise<{
  tier: Tier;
  baseLimit: number;
  bonusEarned: number;
  used: number;
  remaining: number;
  adsWatched: number;
  adsRemaining: number;
}> {
  const tier = getTier();
  const state = await loadState();
  const base = DAILY_LIMIT[tier];
  const remaining = Number.isFinite(base)
    ? Math.max(0, base + state.bonusEarned - state.used)
    : Number.POSITIVE_INFINITY;
  return {
    tier,
    baseLimit: base,
    bonusEarned: state.bonusEarned,
    used: state.used,
    remaining,
    adsWatched: state.adsWatched,
    adsRemaining: Math.max(0, REWARDED_AD_DAILY_CAP - state.adsWatched),
  };
}

/**
 * Consume one card. The mode parameter is accepted for backward compatibility
 * and telemetry but no longer affects accounting — all modes share the same
 * unified daily limit.
 */
export async function consumeWord(_mode: ReviewMode = 'auto'): Promise<{ allowed: boolean; remaining: number }> {
  const tier = getTier();
  if (tier === 'premium') return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  const state = await loadState();
  const limit = effectiveLimit(tier, state.bonusEarned);
  if (state.used >= limit) return { allowed: false, remaining: 0 };
  state.used += 1;
  await saveState(state);
  return { allowed: true, remaining: limit - state.used };
}

/**
 * Whether the user can watch another rewarded ad. Free users are capped at
 * REWARDED_AD_DAILY_CAP watches per day — each grants +REWARDED_AD_BONUS
 * cards. Paid tiers don't see the option.
 */
export async function canWatchRewardedAd(): Promise<boolean> {
  if (getTier() !== 'free') return false;
  const state = await loadState();
  return state.adsWatched < REWARDED_AD_DAILY_CAP;
}

/**
 * Record that a rewarded ad was watched: grants +REWARDED_AD_BONUS to today's
 * card budget and increments the daily watch counter.
 */
export async function recordRewardedAdWatch(): Promise<void> {
  const state = await loadState();
  if (state.adsWatched >= REWARDED_AD_DAILY_CAP) return;
  state.bonusEarned += REWARDED_AD_BONUS;
  state.adsWatched += 1;
  await saveState(state);
}

/** Per-watch bonus awarded for one rewarded ad. */
export const REWARDED_AD_BONUS_CARDS = REWARDED_AD_BONUS;

/** Maximum rewarded ad watches allowed per day. */
export const REWARDED_AD_DAILY_CAP_COUNT = REWARDED_AD_DAILY_CAP;

/**
 * Record that a review session just ended. Returns true if a session-end
 * interstitial should be shown now (free tier, second-session+, and `used`
 * just crossed a new 30-card bucket). The bucket pointer is advanced
 * regardless so first-session immunity doesn't let the user accumulate
 * pending ads.
 */
export async function consumeSessionEndAd(): Promise<boolean> {
  if (getTier() !== 'free') {
    // Still record the session so a downgrade doesn't backfill ads.
    const state = await loadState();
    state.sessionsCompleted += 1;
    await saveState(state);
    return false;
  }
  const state = await loadState();
  state.sessionsCompleted += 1;
  const currentBucket = Math.floor(state.used / INTERSTITIAL_BUCKET_SIZE);
  const crossed = currentBucket > state.lastAdBucket;
  // First session of the day: always immune, but advance the pointer so the
  // user doesn't see an immediate ad on session 2 if they already crossed.
  const immune = state.sessionsCompleted === 1;
  let show = false;
  if (crossed && !immune) {
    show = true;
  }
  if (crossed) {
    state.lastAdBucket = currentBucket;
  }
  await saveState(state);
  return show;
}

/** Size of the cumulative-card bucket between session-end interstitials. */
export const INTERSTITIAL_BUCKET_CARDS = INTERSTITIAL_BUCKET_SIZE;
