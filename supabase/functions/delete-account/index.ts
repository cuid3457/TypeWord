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
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  };
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const userEmail = user.email;
    const userLang = user.user_metadata?.lang || "en";

    await supabase.from("user_words").delete().eq("user_id", userId);
    await supabase.from("books").delete().eq("user_id", userId);
    await supabase.from("content_reports").delete().eq("user_id", userId);
    await supabase.from("inquiries").delete().eq("user_id", userId);
    await supabase.from("profiles").delete().eq("user_id", userId);
    await supabase.from("api_calls").delete().eq("user_id", userId);

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

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
