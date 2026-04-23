import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

// Phase A thresholds (pre-launch / small audience). Adjust as DAU grows.
export const USER_LIMITS = {
  perMinute: 20,
  perHour: 200,
  perDay: 500,
};

export const SYSTEM_LIMITS = {
  perMinute: 500,
  perHour: 5_000,
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
  user_minute: number;
  user_hour: number;
  user_day: number;
  sys_minute: number;
  sys_hour: number;
  month_cost: number;
}

/**
 * Single DB round-trip via RPC that checks all rate limits + monthly budget.
 * Replaces the previous 6 separate queries.
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

  // User limits
  if (r.user_minute >= USER_LIMITS.perMinute) {
    throw new RateLimitError("RATE_LIMIT_MINUTE");
  }
  if (r.user_hour >= USER_LIMITS.perHour) {
    throw new RateLimitError("RATE_LIMIT_HOUR");
  }
  if (r.user_day >= USER_LIMITS.perDay) {
    throw new RateLimitError("RATE_LIMIT_DAY");
  }

  // System limits
  if (r.sys_minute >= SYSTEM_LIMITS.perMinute || r.sys_hour >= SYSTEM_LIMITS.perHour) {
    throw new RateLimitError("RATE_LIMIT_SYSTEM");
  }

  // Monthly budget
  if (r.month_cost >= MONTHLY_BUDGET_USD) {
    throw new BudgetExhaustedError("BUDGET_EXHAUSTED");
  }
}
