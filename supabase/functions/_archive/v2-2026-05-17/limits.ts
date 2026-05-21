import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

// Per-user limits, tiered by subscription plan + endpoint.
//   Caps exist to block abnormal/runaway usage and to keep paid-tier value
//   meaningful. Counts are now per-endpoint (see check_rate_limits RPC) so
//   a TTS spam can't burn the gate that protects word-lookup, and vice
//   versa. Each user word search = 2 word-lookup calls (quick + enrich),
//   so the effective per-minute search limit is perMinute / 2.
type LimitSet = {
  perMinute: number;
  perHour: number;
  perDay: number;
  perMonth: number;
};

type EndpointLimits = {
  free: LimitSet;
  pro: LimitSet;
};

const INF = Number.POSITIVE_INFINITY;

// Per-endpoint caps. Free vs pro differ on perMinute so a fake-pro client
// (e.g. tampering local AsyncStorage tier) doesn't gain server-side
// privilege — server reads profiles.plan for the real tier.
const ENDPOINT_LIMITS: Record<string, EndpointLimits> = {
  "word-lookup": {
    // No tier differentiation — this cap is purely an abuse guard against
    // runaway scripts / scrapers, not a paywall lever. 60/min = 30 user
    // searches/min (each search is 2 calls: quick + enrich) which is far
    // above any human typing rate for either tier.
    free: { perMinute: 60, perHour: INF, perDay: INF, perMonth: INF },
    pro:  { perMinute: 60, perHour: INF, perDay: INF, perMonth: INF },
  },
  "tts-synthesize": {
    // No per-user limit — TTS is always downstream of either a word-lookup
    // (already rate-limited) or a wordlist download with pre-computed
    // results. Cache hits cost ~0; cost ceiling for first-time syntheses
    // is enforced upstream by word-lookup limits and the system-wide cap
    // below. Azure dashboard budget caps absolute spend.
    free: { perMinute: INF, perHour: INF, perDay: INF, perMonth: INF },
    pro:  { perMinute: INF, perHour: INF, perDay: INF, perMonth: INF },
  },
  "ipa-generate": {
    // Same logic as tts-synthesize: downstream of word-lookup, so
    // upstream limits + system-wide cap are sufficient guards.
    free: { perMinute: INF, perHour: INF, perDay: INF, perMonth: INF },
    pro:  { perMinute: INF, perHour: INF, perDay: INF, perMonth: INF },
  },
  "image-extract": {
    free: { perMinute: 5, perHour: 30, perDay: INF, perMonth: INF },
    pro:  { perMinute: 10, perHour: 60, perDay: INF, perMonth: INF },
  },
};

const DEFAULT_LIMITS: EndpointLimits = {
  free: { perMinute: 30, perHour: INF, perDay: INF, perMonth: INF },
  pro:  { perMinute: 60, perHour: INF, perDay: INF, perMonth: INF },
};

// Backwards-compat exports — kept so old import sites keep building. Prefer
// passing endpoint to enforceAllLimits() over reading these directly.
export const FREE_LIMITS = ENDPOINT_LIMITS["word-lookup"].free;
export const PRO_LIMITS = ENDPOINT_LIMITS["word-lookup"].pro;

// System-wide guard (DDoS / cost-runaway protection). Per-endpoint caps
// scaled to the upstream call ratio so a fully-utilized word-lookup
// pipeline doesn't bottleneck downstream TTS/IPA prefetch:
//   • Each word-lookup spawns up to 4 unique TTS texts (1 word + 3
//     examples). tts-synthesize cap = 4 × word-lookup. (Cache hits skip
//     the rate-limit check entirely; only Azure-bound cache misses count.)
//   • Each word-lookup spawns 1 IPA call (headword only). ipa-generate
//     cap = 1 × word-lookup.
//   • image-extract is direct user trigger (OCR), not downstream — kept
//     small to bound Azure cost per system minute.
const SYSTEM_LIMITS_BY_ENDPOINT: Record<string, number> = {
  "word-lookup": 20_000,
  "tts-synthesize": 80_000,
  "ipa-generate": 20_000,
  "image-extract": 1_000,
};

export const SYSTEM_LIMITS = {
  perMinute: SYSTEM_LIMITS_BY_ENDPOINT["word-lookup"],
};

export const MONTHLY_BUDGET_USD = 20;

export class RateLimitError extends Error {
  status = 429;
  constructor(message: string) {
    super(message);
  }
}

export class BudgetExhaustedError extends Error {
  status = 402;
  constructor(message: string) {
    super(message);
  }
}

interface RateLimitRow {
  // Tier values written by the RevenueCat webhook. 'premium' is the legacy
  // pre-3-tier value (treated as plus). 'free' is the default for new
  // profiles. Anything unrecognised falls back to free.
  plan: "free" | "plus" | "pro" | "premium";
  user_minute: number;
  user_hour: number;
  user_day: number;
  user_month: number;
  sys_minute: number;
  month_cost: number;
}

/**
 * Single DB round-trip via RPC that checks all rate limits + monthly budget.
 * The RPC counts only the endpoint passed in (word-lookup, tts-synthesize,
 * ipa-generate, image-extract) so endpoints don't share quota state.
 */
export async function enforceAllLimits(
  supabase: SupabaseClient,
  userId: string,
  endpoint: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("check_rate_limits", {
    p_user_id: userId,
    p_endpoint: endpoint,
  });

  if (error) throw error;

  const r = data as RateLimitRow;
  const isPaid = r.plan === "pro" || r.plan === "plus" || r.plan === "premium";
  const endpointLimits = ENDPOINT_LIMITS[endpoint] ?? DEFAULT_LIMITS;
  const limits = isPaid ? endpointLimits.pro : endpointLimits.free;

  if (r.user_minute >= limits.perMinute) {
    throw new RateLimitError("RATE_LIMIT_MINUTE");
  }
  if (r.user_hour >= limits.perHour) {
    throw new RateLimitError("RATE_LIMIT_HOUR");
  }
  if (r.user_day >= limits.perDay) {
    throw new RateLimitError("RATE_LIMIT_DAY");
  }
  if (r.user_month >= limits.perMonth) {
    throw new RateLimitError("RATE_LIMIT_MONTH");
  }

  // Per-endpoint system guard.
  const sysCap = SYSTEM_LIMITS_BY_ENDPOINT[endpoint] ?? 5_000;
  if (r.sys_minute >= sysCap) {
    throw new RateLimitError("RATE_LIMIT_SYSTEM");
  }

  // No per-app monthly cost cap. The OpenAI dashboard's hard usage limit is
  // the real safety net; per-minute rate limits already block abuse.
}
