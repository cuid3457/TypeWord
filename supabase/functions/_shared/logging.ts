import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

export interface ApiCallLog {
  userId: string | null;
  endpoint: string;
  cacheHit: boolean;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: number;
  durationMs?: number;
  status: "ok" | "error" | "rate_limited" | "budget_exhausted";
  errorMessage?: string;
  /**
   * User's IANA timezone at the time of the call (e.g. "Asia/Seoul").
   * Used to compute a permanent month_bucket for quota accounting.
   * Falls back to UTC if not provided.
   */
  timezone?: string;
}

function computeMonthBucket(timezone: string | undefined): string {
  const tz = timezone && timezone.length > 0 ? timezone : "UTC";
  // Compute YYYY-MM in the given timezone using Intl.
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
    });
    // en-CA gives ISO-like "YYYY-MM" ordering
    const parts = fmt.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    if (y && m) return `${y}-${m}`;
  } catch {
    // Fall through to UTC fallback below.
  }
  const now = new Date();
  const y = now.getUTCFullYear().toString();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function logApiCall(
  supabase: SupabaseClient,
  log: ApiCallLog,
): Promise<void> {
  const { error } = await supabase.from("api_calls").insert({
    user_id: log.userId,
    endpoint: log.endpoint,
    cache_hit: log.cacheHit,
    tokens_input: log.tokensInput ?? null,
    tokens_output: log.tokensOutput ?? null,
    cost_usd: log.costUsd ?? null,
    duration_ms: log.durationMs ?? null,
    status: log.status,
    error_message: log.errorMessage ?? null,
    month_bucket: computeMonthBucket(log.timezone),
  });
  if (error) console.error("api_calls log failed:", error.message);
}
