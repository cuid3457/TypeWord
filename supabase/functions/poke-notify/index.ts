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

    // Authorization + atomic claim: select the latest unpushed poke from
    // this sender within the last 5 minutes, then conditionally update
    // last_pushed_at IS NULL. Concurrent invocations either lose the
    // claim or find nothing unpushed and exit. The badge_count carried
    // in the FCM data field drives setBadgeCountAsync via the client's
    // background TaskManager task, so each push correctly updates the
    // launcher badge even when the app is doze-suspended.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: latest } = await admin
      .from("pokes")
      .select("id")
      .eq("sender_id", user.id)
      .eq("recipient_id", recipientId)
      .gte("created_at", fiveMinAgo)
      .is("last_pushed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) {
      return jsonResponse(200, { ok: true, delivered: false, reason: "no_unpushed_poke" }, cors);
    }
    const { data: claimed } = await admin
      .from("pokes")
      .update({ last_pushed_at: new Date().toISOString() })
      .eq("id", latest.id)
      .is("last_pushed_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) {
      return jsonResponse(200, { ok: true, delivered: false, reason: "concurrent_claim" }, cors);
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

    // iOS app icon badge — push the absolute post-delivery total so the
    // home screen reflects unseen pokes + pending friend requests. iOS
    // does not auto-decrement; the client clears on view.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ count: unseenPokeCount }, { count: pendingReqCount }] = await Promise.all([
      admin
        .from("pokes")
        .select("sender_id", { count: "exact", head: true })
        .eq("recipient_id", recipientId)
        .is("seen_at", null)
        .gte("created_at", sevenDaysAgo),
      admin
        .from("friend_requests")
        .select("sender_id", { count: "exact", head: true })
        .eq("recipient_id", recipientId),
    ]);
    const badge = (unseenPokeCount ?? 0) + (pendingReqCount ?? 0);

    const result = await deliverPush({
      admin,
      recipientUserId: recipientId,
      pushToken,
      pushPlatform,
      title: "MoaVoca",
      body: `${label}님이 학습하자고 쿡 찔렀어요`,
      data: { type: "poke", senderId: user.id, badge_count: String(badge) },
      badge,
      // Same sender → same tag → Android replaces the previous notification.
      // Single tray entry per sender, latest count drives the badge.
      tag: `poke-${user.id}`,
    });

    return jsonResponse(200, { ok: true, delivered: result.delivered, reason: result.reason, platform: pushPlatform }, cors);
  } catch (e) {
    return jsonResponse(500, { code: "server_error", message: (e as Error).message }, cors);
  }
});
