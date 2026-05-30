// Paddle Billing webhook adapter (skeleton).
//
// Paddle Billing (v4+, not Classic) signs each webhook with HMAC-SHA256 over
// `<timestamp>:<rawBody>` using the notification secret found at
// Paddle Dashboard → Developer Tools → Notifications → reveal secret key.
// Header format: `Paddle-Signature: ts=<unix>;h1=<hex>`.
//
// Subscription events we care about:
//   subscription.created            → status='active' (or 'trialing' if trial)
//   subscription.activated          → status='active'
//   subscription.trialing           → status='trialing'
//   subscription.updated            → status='active' (most common renewal)
//   subscription.canceled           → status='cancelled' (still has access)
//   subscription.paused             → status='past_due'
//   subscription.past_due           → status='past_due'
//   subscription.resumed            → status='active'
//   transaction.payment_failed      → status='past_due' (issue notice)
//
// Customer→user mapping: Paddle's `custom_data.user_id` (set at checkout
// session creation) carries the Supabase UUID. Until checkout is wired,
// parse() returns null when custom_data.user_id is missing — provider
// still gets 200 so it stops retrying.
//
// TODO before going live:
//   1. Set PADDLE_NOTIFICATION_SECRET in Supabase secrets.
//   2. Implement checkout creation so every Paddle subscription carries
//      custom_data.user_id (Supabase UUID).
//   3. Decide price→tier mapping. Currently we only ship one tier so any
//      active sub means premium; multi-tier needs a priceId allowlist.

import { timingSafeEqual } from "../../_shared/timing-safe.ts";
import type {
  Adapter,
  NormalizedSubscriptionEvent,
  WebSubscriptionStatus,
} from "./types.ts";

const SIGNATURE_TOLERANCE_SECONDS = 300;

interface PaddleEnvelope {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

function statusFromPaddle(s: string | undefined): WebSubscriptionStatus | null {
  switch (s) {
    case "active":     return "active";
    case "trialing":   return "trialing";
    case "past_due":   return "past_due";
    case "paused":     return "past_due";
    case "canceled":   return "cancelled";
    case "expired":    return "expired";
    default:           return null;
  }
}

function parseSignatureHeader(header: string): { ts?: string; h1?: string } {
  const parts = header.split(";");
  const out: Record<string, string> = {};
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k && v) out[k.trim()] = v.trim();
  }
  return { ts: out.ts, h1: out.h1 };
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const paddleAdapter: Adapter = {
  provider: "paddle",

  async verify(req, rawBody) {
    const secret = Deno.env.get("PADDLE_NOTIFICATION_SECRET");
    if (!secret) throw new Error("PADDLE_NOTIFICATION_SECRET not set");

    const header = req.headers.get("paddle-signature") ?? "";
    const { ts, h1 } = parseSignatureHeader(header);
    if (!ts || !h1) throw new Error("Missing Paddle-Signature");

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) throw new Error("Invalid signature timestamp");
    const skew = Math.abs(Date.now() / 1000 - tsNum);
    if (skew > SIGNATURE_TOLERANCE_SECONDS) {
      throw new Error("Signature timestamp out of tolerance");
    }

    const expected = await hmacHex(secret, `${ts}:${rawBody}`);
    if (!timingSafeEqual(h1, expected)) {
      throw new Error("Signature mismatch");
    }
  },

  async parse(rawBody) {
    let env: PaddleEnvelope;
    try {
      env = JSON.parse(rawBody) as PaddleEnvelope;
    } catch {
      return null;
    }
    if (!env?.event_type || !env.data) return null;

    // Only subscription.* events touch entitlement. transaction.* may be
    // relevant later (payment_failed → past_due), but skip for the stub.
    if (!env.event_type.startsWith("subscription.")) return null;

    const data = env.data;
    const subId = typeof data.id === "string" ? data.id : null;
    if (!subId) return null;

    const customerId = typeof data.customer_id === "string"
      ? data.customer_id
      : undefined;

    // Supabase UUID is set as Paddle custom_data.user_id at checkout time.
    const customData = data.custom_data as Record<string, unknown> | undefined;
    const userId = typeof customData?.user_id === "string"
      ? customData.user_id
      : null;
    if (!userId) {
      // Until checkout is wired we have no way to attribute the event.
      // Return null so the router 200s and Paddle stops retrying.
      console.warn("[paddle] event missing custom_data.user_id", {
        eventType: env.event_type,
        subId,
      });
      return null;
    }

    const rawStatus = data.status as string | undefined;
    const status = statusFromPaddle(rawStatus);
    if (!status) {
      console.warn("[paddle] unknown status", { rawStatus, subId });
      return null;
    }

    const currentPeriodEnd = typeof data.current_billing_period === "object"
      && data.current_billing_period !== null
      ? (data.current_billing_period as Record<string, string>).ends_at
      : undefined;

    const trialEndsAt = typeof data.trial_dates === "object" && data.trial_dates !== null
      ? (data.trial_dates as Record<string, string>).ends_at
      : undefined;

    const cancelledAt = typeof data.canceled_at === "string"
      ? data.canceled_at
      : undefined;

    // Email mapping — only on transitions we want to notify on.
    let emailType: NormalizedSubscriptionEvent["emailType"];
    if (env.event_type === "subscription.created" || env.event_type === "subscription.activated") {
      emailType = "subscription_welcome";
    } else if (env.event_type === "subscription.canceled") {
      emailType = "subscription_cancelled";
    } else if (env.event_type === "subscription.past_due") {
      emailType = "subscription_renewal_failed";
    }

    return {
      userId,
      providerSubscriptionId: subId,
      providerCustomerId: customerId,
      status,
      currentPeriodEnd,
      cancelledAt,
      trialEndsAt,
      rawEvent: env,
      emailType,
    };
  },
};
