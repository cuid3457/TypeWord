import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

// Records one transactional-email send attempt to the email_log table so
// delivery can be audited later (console logs aren't retained). Must never
// throw — a logging failure should not break the email flow it observes.
export async function logEmail(
  admin: SupabaseClient,
  params: {
    userId: string | null;
    emailType: string;
    recipient: string;
    status: "sent" | "failed";
    error?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("email_log").insert({
      user_id: params.userId,
      email_type: params.emailType,
      recipient: params.recipient,
      status: params.status,
      error: params.error ?? null,
    });
  } catch (e) {
    console.error("[email-log] insert failed", { error: (e as Error).message });
  }
}
