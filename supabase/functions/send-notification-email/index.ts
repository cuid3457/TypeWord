import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/ses.ts";
import { getNotificationEmailTranslation } from "../_shared/email-translations.ts";
import { renderEmailHtml } from "../_shared/email-templates.ts";

const ALLOWED_ORIGINS = new Set([
  "https://typeword.app",
  "http://localhost:8081",
]);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, content-type, apikey, x-client-info",
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { type } = await req.json();
    if (type !== "password_changed") {
      return new Response(JSON.stringify({ error: "Unknown type" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const email = user.email;
    if (!email) {
      return new Response(JSON.stringify({ error: "No email" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const lang = user.user_metadata?.lang || "en";
    const translations = getNotificationEmailTranslation(lang, type);

    const html = renderEmailHtml({
      ...translations,
      confirmUrl: "",
      lang,
    });

    await sendEmail({ to: email, subject: translations.subject, html });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-notification-email error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
