import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

// Per-user limits, tiered by subscription plan.
//   Search count is NOT a paywall lever — premium is driven by other
//   features (custom wordlists, etc.). These caps exist only to block
//   abnormal/runaway usage. perMinute is the only meaningful guard;
//   hour/day/month are uncapped for both tiers.
//
// Tune these as DAU + cost data accumulates.
// Counts are word-lookup calls only (see check_rate_limits RPC).
// Each user word search = 2 word-lookup calls (quick + enrich), so the
// effective per-minute search limit is perMinute / 2.
export const FREE_LIMITS = {
  perMinute: 60, // 30 searches/min
  perHour: Number.POSITIVE_INFINITY,
  perDay: Number.POSITIVE_INFINITY,
  perMonth: Number.POSITIVE_INFINITY,
};

export const PRO_LIMITS = {
  perMinute: 60,
  perHour: Number.POSITIVE_INFINITY,
  perDay: Number.POSITIVE_INFINITY,
  perMonth: Number.POSITIVE_INFINITY,
};

// System-wide guard (DDoS / cost-runaway protection — same for all plans).
// Counts word-lookup only, matching FREE_LIMITS / PRO_LIMITS semantics.
// 20,000 word-lookup/min = 10,000 searches/min ≈ 5,000 concurrent active
// users at typical 2 searches/min — comfortable headroom for organic
// growth, while still tripping on a runaway loop or scripted abuse.
export const SYSTEM_LIMITS = {
  perMinute: 20_000,
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
  // 'premium' is the value set by the RevenueCat webhook; 'free' is the
  // default for new profiles. Anything else is treated as free.
  plan: "free" | "premium";
  user_minute: number;
  user_hour: number;
  user_day: number;
  user_month: number;
  sys_minute: number;
  month_cost: number;
}

/**
 * Single DB round-trip via RPC that checks all rate limits + monthly budget.
 * The RPC also returns the user's plan so we can pick the right limit set.
 */
export async function enforceAllLimits(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("check_rate_limits", {
    p_user_id: userId,
  });

  if (error) throw error;

  const r = data as RateLimitRow;
  const limits = r.plan === "premium" ? PRO_LIMITS : FREE_LIMITS;

  // Per-user limits (tiered by plan)
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

  // System guard (independent of plan)
  if (r.sys_minute >= SYSTEM_LIMITS.perMinute) {
    throw new RateLimitError("RATE_LIMIT_SYSTEM");
  }

  // No per-app monthly cost cap. The OpenAI dashboard's hard usage limit is
  // the real safety net; per-minute rate limits already block abuse. The
  // earlier in-app $20 cap blocked even paying users once total monthly
  // OpenAI cost crossed it (no premium bypass) — false positive. The cost
  // column on api_calls is still aggregated for monitoring; just not enforced.
}
