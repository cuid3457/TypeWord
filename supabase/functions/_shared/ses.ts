import { AwsClient } from "npm:aws4fetch@1.0.20";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const region = Deno.env.get("AWS_REGION")!;
  const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "TypeWord <noreply@typeword.app>";

  const aws = new AwsClient({
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
    region,
    service: "ses",
  });

  const res = await aws.fetch(
    `https://email.${region}.amazonaws.com/v2/email/outbound-emails`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Content: {
          Simple: {
            Subject: { Data: params.subject, Charset: "UTF-8" },
            Body: { Html: { Data: params.html, Charset: "UTF-8" } },
            Headers: [
              { Name: "X-Entity-Ref-ID", Value: crypto.randomUUID() },
            ],
          },
        },
        Destination: { ToAddresses: [params.to] },
        FromEmailAddress: fromEmail,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SES error ${res.status}: ${text}`);
  }
}
