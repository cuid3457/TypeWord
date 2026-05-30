// RevenueCat webhook handler.
// Keeps profiles.plan in sync with subscription state held by RevenueCat.
//
// Auth: the Authorization header must match `Bearer <REVENUECAT_WEBHOOK_SECRET>`.
//       We configure the same string in both Supabase secrets and in
//       RevenueCat dashboard → Integrations → Webhook.
//
// State source: for every event we read the customer's CURRENT entitlement
// state from the RC v2 REST API rather than trusting the payload. The payload
// is event-shaped and unreliable for downgrades — notably TRANSFER carries no
// app_user_id and silently revokes the old owner's entitlement, and a missed
// EXPIRATION would leave plan='premium' forever. Reading RC as the source of
// truth makes plan sync self-correcting regardless of which event fired.
//
// Only authenticated users (UUID app_user_id / transferred_* ids) update DB.
// Anonymous RC ids ($RCAnonymousID:…) have no profile and are skipped; when
// they sign in, Purchases.logIn() transfers the purchase to the UUID id and
// the resulting TRANSFER event re-syncs both ids.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { sendEmail } from "../_shared/ses.ts";
import { getSubscriptionEmailTranslation } from "../_shared/email-translations.ts";
import { renderEmailHtml } from "../_shared/email-templates.ts";
import { customerHasActiveEntitlement } from "../_shared/revenuecat.ts";
import { logEmail } from "../_shared/email-log.ts";

type SubscriptionEmailType =
  | "subscription_welcome"
  | "trial_ending_soon"
  | "subscription_cancelled"
  | "subscription_renewal_failed";

/**
 * Send a subscription lifecycle email to the user. Failures are logged but
 * don't break webhook acknowledgement — RC retries on non-2xx and we don't
 * want a transient SES outage to cause webhook event replay.
 */
async function sendSubscriptionEmail(
  admin: SupabaseClient,
  userId: string,
  emailType: SubscriptionEmailType,
): Promise<void> {
  let recipient = "";
  try {
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    const lang = (userData?.user?.user_metadata?.lang as string | undefined) || "en";
    if (!email) {
      console.log("[rc-webhook] no email for user, skipping", { userId, emailType });
      await logEmail(admin, { userId, emailType, recipient: "", status: "failed", error: "no email on user" });
      return;
    }
    recipient = email;
    const translations = getSubscriptionEmailTranslation(lang, emailType);
    const html = renderEmailHtml({
      heading: translations.heading,
      body: translations.body,
      buttonText: translations.buttonText,
      confirmUrl: "",
      footer: translations.footer,
      lang,
    });
    await sendEmail({ to: email, subject: translations.subject, html });
    console.log("[rc-webhook] sent email", { userId, emailType });
    await logEmail(admin, { userId, emailType, recipient, status: "sent" });
  } catch (e) {
    console.error("[rc-webhook] email send failed", {
      userId,
      emailType,
      error: (e as Error).message,
    });
    await logEmail(admin, { userId, emailType, recipient, status: "failed", error: (e as Error).message });
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Plan = "free" | "premium";

/**
 * The user ids whose plan this event can change.
 *  • TRANSFER carries no app_user_id — only transferred_from (old owner, loses
 *    access) and transferred_to (new owner, gains it). Both must be re-synced.
 *  • Every other event acts on its single app_user_id.
 */
function affectedUserIds(
  eventType: string,
  event: Record<string, unknown>,
): string[] {
  if (eventType === "TRANSFER") {
    const pick = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    return [...new Set([
      ...pick(event.transferred_from),
      ...pick(event.transferred_to),
    ])];
  }
  const appUserId = event.app_user_id;
  return typeof appUserId === "string" ? [appUserId] : [];
}

/**
 * Re-sync one user's profiles.plan against the union of entitlement sources
 * (RC live state, web payment, referral bonus). Delegates to the
 * reconcile_plan_from_sources RPC so RC and web webhooks converge on the
 * same plan without trampling each other. Skips anonymous ids and users
 * without a profile row.
 *
 * On free→premium transition, the RPC resets the monthly image-extract
 * quota (industry standard — Notion/ChatGPT/Cursor/Duolingo reset on
 * upgrade). `extraUpdate` carries event-only fields (e.g. trial_ends_at)
 * forwarded as JSONB to the RPC.
 *
 * Throws on DB / RC API failure so the webhook returns 500 and RC retries.
 */
async function reconcileUserPlan(
  admin: SupabaseClient,
  projectId: string,
  apiKey: string,
  userId: string,
  extraUpdate: Record<string, unknown> = {},
): Promise<Plan | null> {
  if (!UUID_REGEX.test(userId)) return null;

  const rcActive = await customerHasActiveEntitlement(projectId, userId, apiKey);

  const { data, error } = await admin.rpc("reconcile_plan_from_sources", {
    p_user_id: userId,
    p_rc_active: rcActive,
    p_extra: extraUpdate,
  });
  if (error) {
    throw new Error(`reconcile_plan_from_sources failed for ${userId}: ${error.message}`);
  }
  // RPC returns SETOF; empty when there's no profile row.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    console.log("[rc-webhook] no profile row, skipped", { userId });
    return null;
  }
  const newPlan = (row as { new_plan?: string }).new_plan as Plan | undefined ?? null;
  console.log("[rc-webhook] reconciled", {
    userId,
    rcActive,
    newPlan,
    source: (row as { new_source?: string }).new_source ?? null,
  });
  return newPlan;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  // 1. Auth via shared secret. Constant-time compare guards against timing
  //    attacks where `!==` would short-circuit on the first mismatching byte.
  const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!webhookSecret || !timingSafeEqual(authHeader, `Bearer ${webhookSecret}`)) {
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
  const appUserId = typeof event.app_user_id === "string"
    ? event.app_user_id
    : null;

  console.log("[rc-webhook] received", { eventType, appUserId });

  // 3. Skip the dev sandbox ping — no real user state to sync.
  if (eventType === "TEST") {
    return jsonResponse(200, { ok: true, skipped: "TEST event" });
  }

  // 4. RC API config — required to read authoritative entitlement state.
  const projectId = Deno.env.get("REVENUECAT_PROJECT_ID");
  const rcApiKey = Deno.env.get("REVENUECAT_REST_API_KEY");
  if (!projectId || !rcApiKey) {
    console.error("[rc-webhook] missing REVENUECAT_PROJECT_ID / REST API key");
    return jsonResponse(500, { error: "Server misconfigured" });
  }

  // 5. Which users does this event touch? (TRANSFER → both old + new owner.)
  const userIds = affectedUserIds(eventType, event);
  if (userIds.length === 0) {
    return jsonResponse(200, { ok: true, skipped: "no app_user_id" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Capture trial info for the daily trial-reminder cron — only on a fresh
  // trial start (INITIAL_PURCHASE + period_type='TRIAL'), applied to the event
  // subject. Reset reminder_sent_at so a re-trial doesn't suppress a reminder.
  const trialUpdate: Record<string, unknown> = {};
  const expirationAtMs = event.expiration_at_ms as number | undefined;
  if (
    eventType === "INITIAL_PURCHASE" &&
    event.period_type === "TRIAL" &&
    typeof expirationAtMs === "number"
  ) {
    trialUpdate.trial_ends_at = new Date(expirationAtMs).toISOString();
    trialUpdate.trial_reminder_sent_at = null;
  }

  // 6. Re-sync each affected user against RC's authoritative entitlement state.
  const plans: Record<string, Plan | null> = {};
  for (const userId of userIds) {
    const extra = userId === appUserId ? trialUpdate : {};
    plans[userId] = await reconcileUserPlan(
      admin,
      projectId,
      rcApiKey,
      userId,
      extra,
    );
  }

  // 7. Lifecycle email — keyed off the event subject (app_user_id) and type.
  //    Awaited so SES errors surface in logs but trapped inside
  //    sendSubscriptionEmail so the webhook still returns 200 (RC retries
  //    non-2xx and we don't want email failures to replay plan updates).
  if (appUserId && UUID_REGEX.test(appUserId)) {
    if (eventType === "INITIAL_PURCHASE") {
      await sendSubscriptionEmail(admin, appUserId, "subscription_welcome");
    } else if (eventType === "CANCELLATION") {
      await sendSubscriptionEmail(admin, appUserId, "subscription_cancelled");
    } else if (eventType === "BILLING_ISSUE") {
      await sendSubscriptionEmail(admin, appUserId, "subscription_renewal_failed");
    }
  }

  return jsonResponse(200, { ok: true, plans });
});
