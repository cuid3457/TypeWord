// Best-effort push notification when the recipient of a friend request
// accepts it. Lets the original requester's app refresh the friends list
// in real time instead of waiting for tab refocus.
//
// Called by the accepter's client right after accept_friend_request RPC
// succeeds. Authorization requires a friendships row connecting the
// caller to the named requester — proves the acceptance actually happened.

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

    const body = (await req.json()) as { requesterId?: unknown };
    const requesterId = typeof body.requesterId === "string" ? body.requesterId : "";
    if (!UUID_RE.test(requesterId)) return jsonResponse(400, { code: "invalid_payload" }, cors);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Authorization: caller (the accepter) must have a friendships row
    // pointing at the requester AND the friendship must be freshly created
    // (last 60 seconds). The freshness window stops a friend from looping
    // this endpoint indefinitely to push-blast the other side once friendship
    // exists. Push is best-effort; missing the window = no push.
    const sixtySecAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: friendship } = await admin
      .from("friendships")
      .select("user_id, created_at")
      .eq("user_id", user.id)
      .eq("friend_id", requesterId)
      .gte("created_at", sixtySecAgo)
      .maybeSingle();
    if (!friendship) return jsonResponse(403, { code: "no_fresh_friendship" }, cors);

    const [{ data: requester }, { data: accepter }] = await Promise.all([
      admin
        .from("profiles")
        .select("push_token, push_platform")
        .eq("user_id", requesterId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("display_name, username")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const pushToken = requester?.push_token as string | undefined;
    const pushPlatform = requester?.push_platform as
      | "android" | "ios-sandbox" | "ios-production" | undefined;
    if (!pushToken || !pushPlatform) {
      return jsonResponse(200, { ok: true, delivered: false, reason: "no_token" }, cors);
    }

    const accepterDisplay = (accepter?.display_name as string | undefined) ?? "";
    const accepterUsername = (accepter?.username as string | undefined) ?? "";
    const label = accepterDisplay || (accepterUsername ? `@${accepterUsername}` : "Someone");

    const result = await deliverPush({
      admin,
      recipientUserId: requesterId,
      pushToken,
      pushPlatform,
      title: "MoaVoca",
      body: `${label}님이 친구 요청을 수락했어요`,
      data: { type: "friend_accepted", friendId: user.id },
    });

    return jsonResponse(200, { ok: true, delivered: result.delivered }, cors);
  } catch (e) {
    return jsonResponse(500, { code: "server_error", message: (e as Error).message }, cors);
  }
});
