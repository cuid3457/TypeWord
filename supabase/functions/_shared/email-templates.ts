const LOGO_URL = "https://dvdufzwdtmiuzkivjpxb.supabase.co/storage/v1/object/public/assets/logo.png";

interface TemplateParams {
  heading: string;
  body: string;
  buttonText: string;
  confirmUrl: string;
  footer: string;
  lang: string;
}

export function renderEmailHtml(params: TemplateParams): string {
  const isRtl = params.lang === "ar";
  const dir = isRtl ? "rtl" : "ltr";
  const align = isRtl ? "right" : "left";
  const ts = new Date().toISOString();

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${params.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${params.heading} — ${params.body.slice(0, 80)}&#847; &#847; &#847; &#847; &#847; &#847;</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:40px 32px;text-align:${align};">
          <img src="${LOGO_URL}" alt="TypeWord" width="40" height="40" style="display:block;margin-bottom:24px;border-radius:10px;" />
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#000;">${params.heading}</h1>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#4b5563;">${params.body}</p>
          ${params.confirmUrl ? `<table cellpadding="0" cellspacing="0" width="100%" role="presentation"><tr><td align="center">
            <a href="${params.confirmUrl}" style="display:inline-block;background:#000;color:#fff;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;">${params.buttonText}</a>
          </td></tr></table>` : ""}
          <p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">${params.footer}</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#d1d5db;text-align:center;">TypeWord · ${ts.slice(0, 16).replace("T", " ")} UTC</p>
    </td></tr>
  </table>
</body>
</html>`;
}
