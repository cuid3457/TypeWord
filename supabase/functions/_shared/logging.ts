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
  });
  if (error) console.error("api_calls log failed:", error.message);
}
