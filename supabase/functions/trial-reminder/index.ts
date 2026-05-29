// Trial-ending reminder cron.
//
// Invoked daily by pg_cron. Finds users whose RC trial ends in ~2 days
// (1.5–2.5 day window so the cron isn't sensitive to exact firing time),
// sends a localised "trial ending" email, and marks them as reminded so
// the next day's run won't double-send.
//
// Trigger eligibility (profiles row):
//   plan = 'premium'                       — only paying or trialing users
//   trial_ends_at IS NOT NULL              — only those in trial
//   trial_ends_at within next 1.5–2.5 days — D-2 window
//   trial_reminder_sent_at IS NULL         — haven't been reminded yet
//
// Auth: requires Authorization: Bearer <CRON_SECRET> matching the Supabase
// secret of the same name. pg_cron supplies this header when calling.
//
// Idempotency: marking trial_reminder_sent_at = now() after a successful
// send prevents the next run from re-sending even if cron fires twice or
// the user resubscribes within the same trial window.

import { createClient } from "npm:@supabase/supabase-js@^2.45.0";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { sendEmail } from "../_shared/ses.ts";
import { getSubscriptionEmailTranslation } from "../_shared/email-translations.ts";
import { renderEmailHtml } from "../_shared/email-templates.ts";
import { logEmail } from "../_shared/email-log.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOWER_OFFSET_MS = 1.5 * DAY_MS;
const UPPER_OFFSET_MS = 2.5 * DAY_MS;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!cronSecret || !timingSafeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const now = new Date();
  const lower = new Date(now.getTime() + LOWER_OFFSET_MS);
  const upper = new Date(now.getTime() + UPPER_OFFSET_MS);

  const { data: candidates, error } = await admin
    .from("profiles")
    .select("user_id")
    .eq("plan", "premium")
    .is("trial_reminder_sent_at", null)
    .gte("trial_ends_at", lower.toISOString())
    .lte("trial_ends_at", upper.toISOString());

  if (error) {
    console.error("[trial-reminder] query failed", { error: error.message });
    return new Response(JSON.stringify({ error: "Query failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const total = candidates?.length ?? 0;
  console.log("[trial-reminder] candidates", { total, lower, upper });

  let sent = 0;
  let failed = 0;
  for (const candidate of candidates ?? []) {
    let recipient = "";
    try {
      const { data: userData } = await admin.auth.admin.getUserById(
        candidate.user_id,
      );
      const email = userData?.user?.email;
      const lang =
        (userData?.user?.user_metadata?.lang as string | undefined) || "en";
      if (!email) {
        console.log("[trial-reminder] no email, skipping", {
          userId: candidate.user_id,
        });
        await logEmail(admin, {
          userId: candidate.user_id,
          emailType: "trial_ending_soon",
          recipient: "",
          status: "failed",
          error: "no email on user",
        });
        continue;
      }
      recipient = email;

      const translations = getSubscriptionEmailTranslation(
        lang,
        "trial_ending_soon",
      );
      const html = renderEmailHtml({
        heading: translations.heading,
        body: translations.body,
        buttonText: translations.buttonText,
        confirmUrl: "",
        footer: translations.footer,
        lang,
      });
      await sendEmail({
        to: email,
        subject: translations.subject,
        html,
      });
      await logEmail(admin, {
        userId: candidate.user_id,
        emailType: "trial_ending_soon",
        recipient,
        status: "sent",
      });

      // Mark as reminded. Single round-trip per user; an outer transaction
      // isn't worth the complexity for this idempotent flow — re-running
      // tomorrow would simply re-skip the same row.
      const { error: markErr } = await admin
        .from("profiles")
        .update({ trial_reminder_sent_at: now.toISOString() })
        .eq("user_id", candidate.user_id);
      if (markErr) {
        console.error("[trial-reminder] mark sent failed", {
          userId: candidate.user_id,
          error: markErr.message,
        });
        // Email was sent but mark failed → next run will re-send. Accept
        // this rare double-send as a fair trade-off for staying simple.
      }
      sent++;
    } catch (e) {
      failed++;
      console.error("[trial-reminder] user failed", {
        userId: candidate.user_id,
        error: (e as Error).message,
      });
      await logEmail(admin, {
        userId: candidate.user_id,
        emailType: "trial_ending_soon",
        recipient,
        status: "failed",
        error: (e as Error).message,
      });
    }
  }

  console.log("[trial-reminder] done", { total, sent, failed });
  return new Response(
    JSON.stringify({ ok: true, total, sent, failed }),
    { headers: { "Content-Type": "application/json" } },
  );
});
