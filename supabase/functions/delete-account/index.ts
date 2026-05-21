import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/ses.ts";
import { getNotificationEmailTranslation } from "../_shared/email-translations.ts";
import { renderEmailHtml } from "../_shared/email-templates.ts";

const ALLOWED_ORIGINS = new Set([
  "https://moavoca.com",
  "https://www.moavoca.com",
  "https://typeword.app",
  "http://localhost:8081",
]);

// Reauth window: a stale long-lived session shouldn't be enough to wipe an
// account. Require the JWT to have been minted (or refreshed via password /
// OAuth re-grant) within this window. The client surfaces a reauth prompt
// when the server returns reauth_required, calls signInWithPassword (or
// re-runs Apple/Google sign-in), then retries with the freshly-issued token.
const REAUTH_MAX_AGE_SECONDS = 5 * 60;

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  };
}

function decodeJwtIat(jwt: string): number | null {
  try {
    const part = jwt.split(".")[1];
    if (!part) return null;
    // Base64url → base64 padding-fixed
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));
    return typeof decoded.iat === "number" ? decoded.iat : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Reauth check: refuse if the session token was minted more than the
    // reauth window ago. Anonymous users are exempt — there's no credential
    // they can re-prove with, and their account is already low-value.
    if (!user.is_anonymous) {
      const iat = decodeJwtIat(jwt);
      const ageSec = iat ? Math.floor(Date.now() / 1000) - iat : Infinity;
      if (ageSec > REAUTH_MAX_AGE_SECONDS) {
        return new Response(
          JSON.stringify({
            error: "reauth_required",
            code: "reauth_required",
            max_age_seconds: REAUTH_MAX_AGE_SECONDS,
          }),
          {
            status: 403,
            headers: { ...cors, "Content-Type": "application/json" },
          },
        );
      }
    }

    const userId = user.id;
    const userEmail = user.email;
    const userLang = user.user_metadata?.lang || "en";

    // Parse optional deletion feedback. The client always calls the
    // endpoint — when the user skips the reason step, the body is just
    // an empty object. We INSERT regardless so the skip rate is measurable.
    let feedback: { reasons?: unknown; comment?: unknown; was_premium?: unknown } = {};
    try {
      const raw = await req.text();
      if (raw) feedback = JSON.parse(raw);
    } catch { /* missing/invalid body — fall through with empty feedback */ }
    const reasons = Array.isArray(feedback.reasons)
      ? (feedback.reasons as unknown[]).filter((r): r is string => typeof r === "string").slice(0, 20)
      : [];
    const comment = typeof feedback.comment === "string"
      ? feedback.comment.trim().slice(0, 2000) || null
      : null;
    const wasPremium = typeof feedback.was_premium === "boolean" ? feedback.was_premium : null;

    // Compute account age (days). user.created_at is an ISO string.
    let accountAgeDays: number | null = null;
    if (user.created_at) {
      const created = new Date(user.created_at).getTime();
      if (Number.isFinite(created)) {
        accountAgeDays = Math.max(0, Math.floor((Date.now() - created) / 86400000));
      }
    }

    // Save feedback BEFORE deleting the user. Failures are logged but not
    // fatal — the user's intent is to delete, and a missed feedback row is
    // strictly better than a blocked deletion.
    const { error: feedbackError } = await supabase.from("deletion_feedback").insert({
      user_id: userId,
      reasons,
      comment,
      user_lang: userLang,
      account_age_days: accountAgeDays,
      was_premium: wasPremium,
    });
    if (feedbackError) console.warn("deletion_feedback insert failed:", feedbackError.message);

    // Delete the auth user FIRST. ON DELETE CASCADE on profiles + tables that
    // reference auth.users will sweep most rows atomically. This avoids the
    // partial-delete window where (e.g.) profiles is gone but auth.users
    // remains, which would let the handle_new_user trigger recreate a blank
    // profile on the next login.
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Belt-and-suspenders: clean up any rows that don't have ON DELETE
    // CASCADE wired up. Failures here are logged but not fatal — the auth
    // user is already gone and the user can't reach this data anyway.
    const cleanupTables = ["user_words", "books", "content_reports", "inquiries", "profiles", "api_calls"];
    await Promise.allSettled(
      cleanupTables.map((tbl) =>
        supabase.from(tbl).delete().eq("user_id", userId)
          .then(({ error }) => {
            if (error) console.warn(`cleanup ${tbl} failed:`, error.message);
          }),
      ),
    );

    if (userEmail) {
      try {
        const translations = getNotificationEmailTranslation(userLang, "account_deleted");
        const html = renderEmailHtml({ ...translations, confirmUrl: "", lang: userLang });
        await sendEmail({ to: userEmail, subject: translations.subject, html });
      } catch (emailErr) {
        console.warn("Failed to send deletion email:", emailErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
