// Display-name set/validate — profanity-screened public name.
//
// Mirrors username-set's gate (blocklist + OpenAI moderation) but with
// looser format rules: any script(s) allowed, length 1-20 NFC code points
// after trim. We do NOT enforce single-script or reserved-handles here —
// display names are free-form labels users see, not handles for search.
//
// Two endpoints (mode in body):
//   • mode=validate → checks length + profanity without writing
//   • mode=set      → same checks + persists to profiles.display_name
//
// Error codes (returned in body.code):
//   too_short            — empty after trim
//   too_long             — > 20 NFC code points
//   blocklist_match      — multilingual profanity blocklist hit
//   moderation_flagged   — OpenAI moderation
//   unauthorized
//   write_failed / server_error
//
// Unlike username-set we do NOT block anonymous users — community upload
// + invite-claim flows expect anonymous users to be able to set a label.
// The profanity/moderation gate still applies.

import { createClient } from "npm:@supabase/supabase-js@^2.45.0";
import { checkBlocklist } from "../_shared/blocklist.ts";
import { moderateText } from "../_shared/moderation.ts";

const ALLOWED_ORIGINS = new Set([
  "https://moavoca.com",
  "https://www.moavoca.com",
  "https://typeword.app",
  "http://localhost:8081",
  "http://localhost:4173",
]);

const MIN_LEN = 1;
const MAX_LEN = 20;

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

interface ValidationResult {
  ok: boolean;
  code?: string;
  normalized?: string;
}

function validateFormat(raw: string): ValidationResult {
  if (typeof raw !== "string") return { ok: false, code: "too_short" };
  // NFC normalize + trim. Case preserved (unlike username).
  const s = raw.normalize("NFC").trim();
  const codePoints = [...s];
  if (codePoints.length < MIN_LEN) return { ok: false, code: "too_short" };
  if (codePoints.length > MAX_LEN) return { ok: false, code: "too_long" };
  // Reject control chars (zero-width / RTL override / null) — these bypass
  // the visual length check and are a known impersonation vector.
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(s)) {
    return { ok: false, code: "too_short" };
  }
  return { ok: true, normalized: s };
}

interface RequestBody {
  mode?: "validate" | "set";
  display_name?: unknown;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" }, cors);

  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return jsonResponse(401, { code: "unauthorized" }, cors);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonResponse(401, { code: "unauthorized" }, cors);

    const body = (await req.json()) as RequestBody;
    const mode = body.mode === "set" ? "set" : "validate";
    const raw = typeof body.display_name === "string" ? body.display_name : "";

    const fmt = validateFormat(raw);
    if (!fmt.ok) return jsonResponse(200, { ok: false, code: fmt.code }, cors);

    const name = fmt.normalized!;

    const bl = checkBlocklist(name);
    if (!bl.ok) {
      return jsonResponse(200, { ok: false, code: "blocklist_match" }, cors);
    }

    try {
      const mod = await moderateText(name);
      if (!mod.ok) {
        return jsonResponse(200, { ok: false, code: "moderation_flagged" }, cors);
      }
    } catch {
      // Fail open — blocklist already passed.
    }

    if (mode === "validate") {
      return jsonResponse(200, { ok: true, normalized: name }, cors);
    }

    // Match setUsername behavior: UPDATE only. Profile row is created by
    // auth signup trigger; if it's missing the write is a silent no-op
    // (matches the prior direct-update setDisplayName).
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { error: writeErr } = await admin
      .from("profiles")
      .update({ display_name: name })
      .eq("user_id", user.id);
    if (writeErr) {
      return jsonResponse(500, { code: "write_failed", message: writeErr.message }, cors);
    }

    return jsonResponse(200, { ok: true, normalized: name }, cors);
  } catch (e) {
    return jsonResponse(500, { code: "server_error", message: (e as Error).message }, cors);
  }
});
