import { sendEmail } from "../_shared/ses.ts";
import { getEmailTranslation } from "../_shared/email-translations.ts";
import { renderEmailHtml } from "../_shared/email-templates.ts";
import { verifyStandardWebhook } from "../_shared/standard-webhooks.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Auth: this function is invoked by Supabase Auth's Send Email hook.
  // Configure SEND_EMAIL_HOOK_SECRET in Supabase secrets, identical to the
  // value pasted into the dashboard's "Hook Secret" field. We accept:
  //   1. Standard Webhooks v1 signature (preferred — replay-protected)
  //   2. Authorization: Bearer <secret> fallback (legacy hook config)
  //
  // Strict auth required. Transition-mode fallthrough was removed (audit M-7):
  // an unset SEND_EMAIL_HOOK_SECRET in production lets anyone trigger SES
  // sends on our behalf (phishing + paid SES traffic). If the env var is
  // missing we now refuse the request rather than silently accepting it.
  const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  if (!hookSecret) {
    console.error("[send-auth-email] SEND_EMAIL_HOOK_SECRET not configured — rejecting all requests");
    return new Response(JSON.stringify({ error: "Hook not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Read raw body once — signature must be computed over the exact bytes
  // the sender signed, so we can't re-serialize after JSON.parse.
  const rawBody = await req.text();

  let authed = false;
  if (req.headers.get("webhook-signature")) {
    authed = await verifyStandardWebhook(req.headers, rawBody, hookSecret);
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    authed = timingSafeEqual(authHeader, `Bearer ${hookSecret}`);
  }
  if (!authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { user, email_data } = payload as {
      user?: { email?: string; new_email?: string; is_anonymous?: boolean; user_metadata?: { lang?: string } };
      email_data?: {
        token_hash?: string;
        email_action_type?: string;
        redirect_to?: string;
        email_address?: string;
        email?: string;
      };
    };

    const email = user?.email || user?.new_email || email_data?.email_address || email_data?.email;
    const originalType = email_data?.email_action_type || "signup";
    const templateType = (originalType === "email_change" && user?.is_anonymous)
      ? "signup"
      : originalType;
    const tokenHash = email_data?.token_hash;
    const redirectTo = email_data?.redirect_to || "typeword://auth/callback";

    let lang = user?.user_metadata?.lang;
    if (!lang) {
      try {
        const url = new URL(redirectTo);
        lang = url.searchParams.get("lang") || "en";
      } catch {
        lang = "en";
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const typeMap: Record<string, string> = {
      signup: "signup",
      recovery: "recovery",
      email_change: "email_change",
    };

    const confirmUrl =
      `${supabaseUrl}/auth/v1/verify?token=${tokenHash}&type=${typeMap[originalType] || "signup"}&redirect_to=${encodeURIComponent(redirectTo)}`;

    const translations = getEmailTranslation(lang, templateType);

    const html = renderEmailHtml({
      ...translations,
      confirmUrl,
      lang,
    });

    await sendEmail({
      to: email,
      subject: translations.subject,
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Note: do NOT log the request payload — it contains token_hash which
    // is sufficient to verify the magic link. Log only the error message.
    console.error("send-auth-email error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
