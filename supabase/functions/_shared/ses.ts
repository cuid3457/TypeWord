import { AwsClient } from "npm:aws4fetch@1.0.20";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
  headers?: Record<string, string>;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const region = Deno.env.get("AWS_REGION")!;
  const fromEmail = params.from || Deno.env.get("SES_FROM_EMAIL") || "MoaVoca <noreply@moavoca.com>";

  const aws = new AwsClient({
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
    region,
    service: "ses",
  });

  const body: Record<string, unknown> = {
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: params.text
          ? {
              Html: { Data: params.html, Charset: "UTF-8" },
              Text: { Data: params.text, Charset: "UTF-8" },
            }
          : {
              Html: { Data: params.html, Charset: "UTF-8" },
            },
        Headers: [
          { Name: "X-Entity-Ref-ID", Value: crypto.randomUUID() },
          ...Object.entries(params.headers ?? {}).map(([Name, Value]) => ({
            Name,
            Value,
          })),
        ],
      },
    },
    Destination: { ToAddresses: [params.to] },
    FromEmailAddress: fromEmail,
  };

  if (params.replyTo) {
    body.ReplyToAddresses = [params.replyTo];
  }

  const res = await aws.fetch(
    `https://email.${region}.amazonaws.com/v2/email/outbound-emails`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SES error ${res.status}: ${text}`);
  }
}
