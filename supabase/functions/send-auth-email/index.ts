import { sendEmail } from "../_shared/ses.ts";
import { getEmailTranslation } from "../_shared/email-translations.ts";
import { renderEmailHtml } from "../_shared/email-templates.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    console.log("Hook payload:", JSON.stringify(payload));
    const { user, email_data } = payload;

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
    console.error("send-auth-email error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
