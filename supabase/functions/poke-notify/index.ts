// Best-effort push for "쿡 찌르기". Mirrors friend-request-notify:
// caller validates auth, function checks the poke actually exists in the
// last few minutes (so a malicious sender can't spam pushes), reads
// recipient's push token, and dispatches directly via FCM/APNs.

import { createClient } from "npm:@supabase/supabase-js@^2.45.0";
import { deliverPush } from "../_shared/push.ts";

const ALLOWED_ORIGINS = new Set([
  "https://moavoca.com",
  "https://www.moavoca.com",
  "https://typeword.app",
  "http://localhost:8081",
  "http://localhost:4173",
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

    const body = (await req.json()) as { recipientId?: unknown };
    const recipientId = typeof body.recipientId === "string" ? body.recipientId : "";
    if (!UUID_RE.test(recipientId)) return jsonResponse(400, { code: "invalid_payload" }, cors);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Authorization: caller must have a poke row to this recipient created in
    // the last 5 min. send_poke RPC is the only legit creator, so this also
    // proves the cooldown + friendship checks already passed.
    //
    // Push-spam defense: atomically claim the push by stamping last_pushed_at
    // only when (NULL OR older than 60 seconds). If no row gets updated, we
    // either have no recent poke, or another invocation already pushed within
    // the throttle window — return 200 with delivered=false, no push.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: claimed } = await admin
      .from("pokes")
      .update({ last_pushed_at: new Date().toISOString() })
      .eq("sender_id", user.id)
      .eq("recipient_id", recipientId)
      .gte("created_at", fiveMinAgo)
      .or(`last_pushed_at.is.null,last_pushed_at.lt.${oneMinAgo}`)
      .select("created_at")
      .maybeSingle();
    if (!claimed) {
      // Either no recent poke row, or we already pushed within the last
      // minute. Either way, do not push.
      return jsonResponse(200, { ok: true, delivered: false, reason: "throttled_or_missing" }, cors);
    }

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
      title: "MoaVoca",
      body: `${label}님이 학습하자고 쿡 찔렀어요`,
      data: { type: "poke", senderId: user.id },
    });

    return jsonResponse(200, { ok: true, delivered: result.delivered }, cors);
  } catch (e) {
    return jsonResponse(500, { code: "server_error", message: (e as Error).message }, cors);
  }
});
