// RevenueCat webhook handler.
// Keeps profiles.plan in sync with subscription state held by RevenueCat.
//
// Auth: the Authorization header must match `Bearer <REVENUECAT_WEBHOOK_SECRET>`.
//       We configure the same string in both Supabase secrets and in
//       RevenueCat dashboard → Integrations → Webhook.
//
// State source: we trust the webhook payload itself rather than making a
// follow-up REST API call. RC delivers events with the authoritative list of
// active entitlement ids at event time, which is sufficient for our single
// entitlement ("TypeWord premium"). This avoids a round-trip and removes the
// V1-vs-V2 API endpoint confusion.
//
// Only events for authenticated users (UUID app_user_id) update DB. Anonymous
// RC user events ($RCAnonymousID:…) are ignored — those users don't have
// profiles yet; when they sign in, Purchases.logIn() fires a transfer event
// with the new (UUID) app_user_id, which we then handle.

import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const PREMIUM_ENTITLEMENT_ID = "TypeWord premium";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Determine premium state from the webhook payload.
 *  • EXPIRATION / SUBSCRIPTION_PAUSED → explicit free
 *  • TEST → skip (dev sandbox ping, no real user state)
 *  • Everything else → trust `entitlement_ids` list supplied by RC
 *
 * Returns null when the event should be ignored (no DB write).
 */
function computePremiumState(
  eventType: string,
  entitlementIds: string[],
): boolean | null {
  if (eventType === "TEST") return null;
  if (eventType === "EXPIRATION" || eventType === "SUBSCRIPTION_PAUSED") {
    return false;
  }
  return entitlementIds.includes(PREMIUM_ENTITLEMENT_ID);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  // 1. Auth via shared secret.
  const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    console.log("[rc-webhook] auth failed");
    return jsonResponse(401, { error: "Unauthorized" });
  }

  // 2. Parse payload.
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const event = payload.event as Record<string, unknown> | undefined;
  if (!event) return jsonResponse(400, { error: "Missing event" });

  const eventType = event.type as string;
  const appUserId = event.app_user_id as string | undefined;
  const entitlementIds: string[] = Array.isArray(event.entitlement_ids)
    ? (event.entitlement_ids as string[])
    : [];

  console.log("[rc-webhook] received", {
    eventType,
    appUserId,
    entitlementIds,
  });

  // 3. Only handle events for authenticated (UUID) users.
  if (!appUserId || !UUID_REGEX.test(appUserId)) {
    return jsonResponse(200, { ok: true, skipped: "non-UUID app_user_id" });
  }

  // 4. Determine new plan from event payload.
  const isPremium = computePremiumState(eventType, entitlementIds);
  if (isPremium === null) {
    return jsonResponse(200, { ok: true, skipped: `event type ${eventType}` });
  }

  const newPlan = isPremium ? "premium" : "free";

  // 5. Update DB (no-op if plan already matches).
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: updated, error } = await admin
    .from("profiles")
    .update({ plan: newPlan })
    .eq("user_id", appUserId)
    .select("user_id, plan")
    .maybeSingle();

  if (error) {
    console.error("[rc-webhook] DB update failed", { error: error.message });
    return jsonResponse(500, { error: "DB update failed" });
  }

  if (!updated) {
    console.log("[rc-webhook] no profile row for user, skipped", { appUserId });
    return jsonResponse(200, { ok: true, skipped: "no profile row" });
  }

  console.log("[rc-webhook] updated", {
    userId: appUserId,
    plan: newPlan,
    eventType,
  });

  return jsonResponse(200, { ok: true, plan: newPlan });
});
