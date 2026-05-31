import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/ses.ts";

const SUPPORT_INBOX = "support@moavoca.com";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SUBJECT_BODY_PREVIEW_LEN = 50;

interface InquiryRecord {
  id: string;
  user_id: string | null;
  email: string | null;
  body: string;
  image_urls: string[] | null;
  created_at: string;
}

interface TriggerPayload {
  type: "INSERT";
  table: "inquiries";
  record: InquiryRecord;
  old_record?: null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractStoragePath(publicUrl: string): string | null {
  const match = publicUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/inquiries\/(.+?)(?:\?|$)/);
  return match ? match[1] : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const expectedSecret = Deno.env.get("INQUIRY_NOTIFY_SECRET");
    if (!expectedSecret) {
      console.error("INQUIRY_NOTIFY_SECRET not configured");
      return new Response(JSON.stringify({ error: "Not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const authHeader = req.headers.get("authorization") ?? "";
    const providedSecret = authHeader.replace(/^Bearer\s+/i, "");
    if (providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as TriggerPayload;
    const inquiry = payload?.record;
    if (!inquiry?.id || !inquiry?.body) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Sign image URLs (bucket is private — public URLs return 403)
    const imageLinks: { url: string; name: string }[] = [];
    for (const publicUrl of inquiry.image_urls ?? []) {
      const path = extractStoragePath(publicUrl);
      if (!path) continue;
      const { data, error } = await supabase.storage
        .from("inquiries")
        .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
      if (error || !data?.signedUrl) {
        console.error("createSignedUrl failed", path, error);
        continue;
      }
      imageLinks.push({ url: data.signedUrl, name: path.split("/").pop() ?? "image.jpg" });
    }

    const userEmail = inquiry.email?.trim() || null;
    const userLabel = userEmail ?? "익명 사용자";

    const firstLine = inquiry.body.split("\n")[0].trim();
    const preview =
      firstLine.length > SUBJECT_BODY_PREVIEW_LEN
        ? firstLine.slice(0, SUBJECT_BODY_PREVIEW_LEN) + "…"
        : firstLine;
    const subject = `[MoaVoca 문의] ${userLabel} — ${preview}`;

    const createdAt = new Date(inquiry.created_at).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const imagesHtml = imageLinks.length
      ? `<div style="margin-top:20px"><div style="font-weight:600;color:#555;margin-bottom:8px;font-size:13px">첨부 이미지 (${imageLinks.length})</div>` +
        imageLinks
          .map(
            (img) =>
              `<div style="margin-bottom:12px"><a href="${escapeHtml(img.url)}" target="_blank" rel="noopener" style="color:#3a6df0;font-size:13px">${escapeHtml(img.name)}</a><br/><a href="${escapeHtml(img.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.name)}" style="max-width:480px;max-height:480px;border-radius:8px;border:1px solid #e5e1d8;margin-top:6px"/></a></div>`,
          )
          .join("") +
        `<div style="font-size:11px;color:#bbb;margin-top:4px">링크는 30일간 유효합니다.</div></div>`
      : "";

    const bodyHtml = escapeHtml(inquiry.body).replace(/\n/g, "<br/>");

    // Body intentionally contains ONLY sender + user content + images.
    // Admin metadata (inquiry id, user id, timestamp) lives in custom email
    // headers (X-Inquiry-*) so it doesn't leak into the reply quote when
    // 대표님 replies. Use "Show original" in Gmail to view headers.
    const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf8f3;padding:24px;color:#2c2c2c">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e1d8">

    <div style="color:#7B7366;font-size:13px;margin-bottom:4px">보낸 사람</div>
    <div style="font-size:15px;font-weight:600;margin-bottom:20px">${escapeHtml(userLabel)}</div>

    <div style="font-size:15px;line-height:1.6;white-space:pre-wrap;color:#2c2c2c">${bodyHtml}</div>

    ${imagesHtml}
  </div>
</body></html>`;

    const textBody = [
      `보낸 사람: ${userLabel}`,
      ``,
      inquiry.body,
      ``,
      imageLinks.length ? `첨부 이미지 (${imageLinks.length}, 30일 유효):` : "",
      ...imageLinks.map((img) => `  - ${img.name}: ${img.url}`),
    ]
      .filter((l) => l !== null && l !== undefined)
      .join("\n");

    const adminHeaders: Record<string, string> = {
      "X-Inquiry-Id": inquiry.id,
      "X-Inquiry-Created-At": inquiry.created_at,
    };
    if (inquiry.user_id) adminHeaders["X-Inquiry-User-Id"] = inquiry.user_id;
    if (userEmail) adminHeaders["X-Inquiry-User-Email"] = userEmail;

    await sendEmail({
      to: SUPPORT_INBOX,
      subject,
      html,
      text: textBody,
      replyTo: userEmail ?? undefined,
      headers: adminHeaders,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-inquiry-notification error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
