// Web payment webhook router.
//
// Provider-agnostic shell that dispatches to ./adapters/<provider>.ts. Each
// adapter handles signature verification and normalizes the provider's
// event shape into NormalizedSubscriptionEvent (see ./adapters/types.ts).
// The router does the side effects:
//   1. Upsert the web_subscriptions row.
//   2. Call reconcile_plan_from_sources(p_user_id, p_rc_active=false)
//      — RC state is unknown here so we pass false. The RPC ORs in web
//      and bonus, so a user with active RC keeps premium even after a
//      web cancellation event lands. Correctness: if web sub goes inactive
//      AND RC is still active, the RPC reads web=false but the NEXT RC
//      webhook will set rc=true. There's a window where plan may show
//      free transiently, but for v1 users with both channels we treat
//      that as an edge case; reconcile re-converges on either webhook.
//   3. Send lifecycle email if the adapter marked one.
//
// Routing:
//   POST /web-subscription-webhook?provider=paddle  → paddle adapter
//   POST /web-subscription-webhook?provider=toss    → toss adapter (TBD)
//
// Adding a provider:
//   - Drop ./adapters/<name>.ts exporting an Adapter.
//   - Add it to the providers map below.
//   - Set <name>'s secret in Supabase secrets (each adapter declares its own).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import { sendEmail } from "../_shared/ses.ts";
import { getSubscriptionEmailTranslation } from "../_shared/email-translations.ts";
import { renderEmailHtml } from "../_shared/email-templates.ts";
import { logEmail } from "../_shared/email-log.ts";
import type { Adapter, NormalizedSubscriptionEvent } from "./adapters/types.ts";
import { paddleAdapter } from "./adapters/paddle.ts";

const providers: Record<string, Adapter> = {
  paddle: paddleAdapter,
  // toss: tossAdapter,    // TODO Phase 2 (KR-only PG)
  // stripe: stripeAdapter, // TODO if we ever go direct
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function upsertSubscription(
  admin: SupabaseClient,
  provider: string,
  event: NormalizedSubscriptionEvent,
): Promise<void> {
  const row = {
    user_id: event.userId,
    provider,
    provider_subscription_id: event.providerSubscriptionId,
    provider_customer_id: event.providerCustomerId ?? null,
    status: event.status,
    current_period_end: event.currentPeriodEnd ?? null,
    cancelled_at: event.cancelledAt ?? null,
    trial_ends_at: event.trialEndsAt ?? null,
    price_amount_cents: event.priceAmountCents ?? null,
    price_currency: event.priceCurrency ?? null,
    raw_event: event.rawEvent ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("web_subscriptions")
    .upsert(row, { onConflict: "provider,provider_subscription_id" });
  if (error) {
    throw new Error(`web_subscriptions upsert failed: ${error.message}`);
  }
}

async function reconcilePlan(
  admin: SupabaseClient,
  userId: string,
  extra: Record<string, unknown>,
): Promise<void> {
  if (!UUID_REGEX.test(userId)) return;
  // p_rc_active=false here: this webhook doesn't know RC state. The RPC
  // ORs over (rc, web, bonus); web is read inline, bonus inline. RC is
  // only "lost" between this call and the next RC webhook, so worst case
  // a user with RC active sees a brief web→free flip until the next RC
  // event reconciles. Acceptable for v1; can be tightened by having this
  // function also call the RC API when REVENUECAT_REST_API_KEY is set.
  const { error } = await admin.rpc("reconcile_plan_from_sources", {
    p_user_id: userId,
    p_rc_active: false,
    p_extra: extra,
  });
  if (error) {
    throw new Error(`reconcile failed for ${userId}: ${error.message}`);
  }
}

async function sendLifecycleEmail(
  admin: SupabaseClient,
  userId: string,
  emailType: NonNullable<NormalizedSubscriptionEvent["emailType"]>,
): Promise<void> {
  let recipient = "";
  try {
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    const lang = (userData?.user?.user_metadata?.lang as string | undefined) || "en";
    if (!email) {
      await logEmail(admin, { userId, emailType, recipient: "", status: "failed", error: "no email on user" });
      return;
    }
    recipient = email;
    const tr = getSubscriptionEmailTranslation(lang, emailType);
    const html = renderEmailHtml({
      heading: tr.heading,
      body: tr.body,
      buttonText: tr.buttonText,
      confirmUrl: "",
      footer: tr.footer,
      lang,
    });
    await sendEmail({ to: email, subject: tr.subject, html });
    await logEmail(admin, { userId, emailType, recipient, status: "sent" });
  } catch (e) {
    await logEmail(admin, { userId, emailType, recipient, status: "failed", error: (e as Error).message });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const url = new URL(req.url);
  const providerKey = url.searchParams.get("provider") ?? "";
  const adapter = providers[providerKey];
  if (!adapter) {
    return json(404, { error: `Unknown provider: ${providerKey}` });
  }

  // Must consume the body as text so the adapter can hash it byte-exact.
  const rawBody = await req.text();

  try {
    await adapter.verify(req, rawBody);
  } catch (e) {
    console.log("[web-sub-webhook] verify failed", {
      provider: providerKey,
      error: (e as Error).message,
    });
    return json(401, { error: "Unauthorized" });
  }

  const event = await adapter.parse(rawBody);
  if (!event) {
    return json(200, { ok: true, skipped: "no-op event" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  await upsertSubscription(admin, adapter.provider, event);

  const extra: Record<string, unknown> = {};
  if (event.trialEndsAt) extra.trial_ends_at = event.trialEndsAt;
  await reconcilePlan(admin, event.userId, extra);

  if (event.emailType) {
    await sendLifecycleEmail(admin, event.userId, event.emailType);
  }

  return json(200, {
    ok: true,
    provider: adapter.provider,
    status: event.status,
    sub_id: event.providerSubscriptionId,
  });
});
