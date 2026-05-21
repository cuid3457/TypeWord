// Best-effort push notification for new friend requests.
//
// Called by the sender's client after send_friend_request RPC succeeds.
// Validates that a pending request from sender → recipient actually exists
// (so callers can't spam arbitrary users), reads the recipient's push token
// + the sender's display name, then dispatches via FCM (Android) or APNs
// (iOS) directly from the shared push helper.
//
// All failures are silent from the client's perspective — push is best-effort.

import { createClient } from "npm:@supabase/supabase-js@^2.45.0";
import { deliverPush } from "../_shared/push.ts";

const ALLOWED_ORIGINS = new Set([
  "https://moavoca.com",
  "https://www.moavoca.com",
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

function jsonResponse(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

interface RequestBody { recipientId?: unknown }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" }, cors);

  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return jsonResponse(401, { code: "unauthorized" }, cors);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonResponse(401, { code: "unauthorized" }, cors);

    const body = (await req.json()) as RequestBody;
    const recipientId = typeof body.recipientId === "string" ? body.recipientId : "";
    if (!UUID_RE.test(recipientId)) return jsonResponse(400, { code: "invalid_payload" }, cors);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Authorization: caller must have a real pending request to this recipient.
    const { data: req_row } = await admin
      .from("friend_requests")
      .select("sender_id, recipient_id")
      .eq("sender_id", user.id)
      .eq("recipient_id", recipientId)
      .maybeSingle();
    if (!req_row) return jsonResponse(403, { code: "no_pending_request" }, cors);

    // Look up recipient push token + sender display info.
    const [{ data: recipient }, { data: sender }] = await Promise.all([
      admin
        .from("profiles")
        .select("push_token, push_platform")
        .eq("user_id", recipientId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("display_name, username")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const pushToken = recipient?.push_token as string | undefined;
    const pushPlatform = recipient?.push_platform as
      | "android" | "ios-sandbox" | "ios-production" | undefined;
    if (!pushToken || !pushPlatform) {
      return jsonResponse(200, { ok: true, delivered: false, reason: "no_token" }, cors);
    }

    const senderDisplay = (sender?.display_name as string | undefined) ?? "";
    const senderUsername = (sender?.username as string | undefined) ?? "";
    const label = senderDisplay || (senderUsername ? `@${senderUsername}` : "Someone");

    const result = await deliverPush({
      admin,
      recipientUserId: recipientId,
      pushToken,
      pushPlatform,
      title: "TypeWord",
      body: `${label}님이 친구 요청을 보냈어요`,
      data: { type: "friend_request", senderId: user.id },
    });

    return jsonResponse(200, { ok: true, delivered: result.delivered }, cors);
  } catch (e) {
    return jsonResponse(500, { code: "server_error", message: (e as Error).message }, cors);
  }
});
