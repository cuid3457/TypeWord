// Paddle Customer Portal session generator.
//
// Industry-standard self-service subscription management: instead of a CS
// mailto, the user clicks "Manage / Cancel subscription" and lands on a
// Paddle-hosted portal where they can cancel, swap payment methods, view
// invoices, etc. This function creates a one-hour portal session URL for
// the calling user's active Paddle subscription.
//
// Flow:
//   1. Verify user JWT (passed as Bearer in Authorization header)
//   2. Look up the user's most-recent active/trialing/past_due Paddle sub
//      in web_subscriptions
//   3. Call Paddle POST /customers/<id>/portal-sessions
//   4. Return { url } — client opens it via Linking
//
// Failure modes — all return null/error so the client can fall back to
// the static store URL or mailto:
//   401  caller JWT invalid/missing
//   404  no matching Paddle subscription (user paid via RC, not web)
//   500  Paddle API rejected (key invalid, customer not found, etc.)
//
// Sandbox vs production is inferred from the API key prefix
// (pdl_sdbx_apikey_ vs pdl_live_apikey_) so the same code works in both.

import { createClient } from "npm:@supabase/supabase-js@^2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

interface PaddlePortalResponse {
  data?: {
    urls?: {
      general?: { overview?: string };
    };
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  // Preflight — browsers send OPTIONS before the actual POST.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" }, cors);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) {
    return json(401, { error: "Unauthorized" }, cors);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Validate JWT and identify the user. admin.auth.getUser(jwt) routes
  // around the gateway-level verify_jwt=false (which is set so this
  // function can accept the user's anon-key-signed token without the
  // ES256-incompat gateway gate).
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return json(401, { error: "Invalid token" }, cors);
  }

  // Pick the most-recently-updated Paddle subscription that's still alive.
  // We treat 'cancelled' as not-alive even though access continues until
  // current_period_end — once the user cancels, opening the portal again
  // is moot.
  const { data: subs, error: subsError } = await admin
    .from("web_subscriptions")
    .select("provider_customer_id, provider_subscription_id, status")
    .eq("user_id", userId)
    .eq("provider", "paddle")
    .in("status", ["active", "trialing", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (subsError) {
    console.error("[paddle-portal] db error", subsError);
    return json(500, { error: "DB error" }, cors);
  }
  if (!subs || subs.length === 0) {
    return json(404, { error: "No active Paddle subscription" }, cors);
  }

  const sub = subs[0];
  const customerId = sub.provider_customer_id as string | null;
  const subscriptionId = sub.provider_subscription_id as string | null;
  if (!customerId) {
    return json(500, { error: "Subscription missing customer_id" }, cors);
  }

  const paddleApiKey = Deno.env.get("PADDLE_API_KEY");
  if (!paddleApiKey) {
    return json(500, { error: "PADDLE_API_KEY not set" }, cors);
  }

  // Sandbox keys carry the prefix; production hits the unprefixed host.
  const apiBase = paddleApiKey.startsWith("pdl_sdbx_")
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";

  const portalResp = await fetch(
    `${apiBase}/customers/${customerId}/portal-sessions`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${paddleApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscription_ids: subscriptionId ? [subscriptionId] : [],
      }),
    },
  );

  if (!portalResp.ok) {
    const errText = await portalResp.text();
    console.error("[paddle-portal] Paddle API error", portalResp.status, errText);
    return json(502, { error: "Paddle API error", status: portalResp.status }, cors);
  }

  const portalBody = await portalResp.json() as PaddlePortalResponse;
  const portalUrl = portalBody?.data?.urls?.general?.overview;
  if (!portalUrl) {
    console.error("[paddle-portal] response missing overview URL", portalBody);
    return json(500, { error: "No portal URL in Paddle response" }, cors);
  }

  return json(200, { url: portalUrl }, cors);
});
