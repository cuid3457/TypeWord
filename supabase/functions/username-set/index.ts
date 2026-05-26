// Username set/validate — multi-script handle, profanity-screened.
//
// Two endpoints in one function (mode in body):
//   • mode=validate → checks format/script/profanity/availability without writing
//   • mode=set      → same checks + persists to profiles.username
//
// Format rules:
//   - 3-20 NFC code points
//   - Single script only: latin / hangul / kana_kanji / han / cyrillic
//   - Allowed chars: script-specific letters + 0-9 + . + _
//   - Must start with a letter, must not end with . or _
//   - No consecutive .. or __ or ._ etc.
//   - Latin/Cyrillic stored lowercase (case-insensitive uniqueness)
//
// Error codes (returned in body.code):
//   too_short / too_long
//   invalid_format       — bad chars, leading non-letter, trailing _/.
//   mixed_script         — multiple scripts in one username
//   reserved             — admin/support/etc.
//   blocklist_match      — profanity blocklist hit
//   moderation_flagged   — OpenAI moderation
//   taken                — already used
//   confusable           — visually deceptive (e.g. Cyrillic а in Latin context)
//   unauthorized
//   anonymous_blocked

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

const MIN_LEN = 3;
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

// Reserved usernames per script. Profanity is handled separately via the
// blocklist module. These lists target impersonation / system-role spoofing.
const RESERVED = new Set([
  "admin", "administrator", "support", "help", "system", "official",
  "anonymous", "null", "undefined", "deleted", "root", "api",
  "moderator", "mod", "staff", "team", "everyone", "all",
  "nobody", "user", "guest", "test", "typeword", "owner",
  "service", "bot", "default", "me", "you",
]);

const RESERVED_HANGUL = new Set([
  "관리자", "관리인", "관리팀", "관리", "운영자", "운영진", "운영팀", "운영",
  "공식", "시스템", "지원", "고객지원", "도움", "도움말", "봇", "익명",
  "사용자", "손님", "게스트", "매니저", "담당자", "타입워드",
]);

const RESERVED_KANA_KANJI = new Set([
  "管理者", "管理人", "管理", "運営", "運営者", "運営チーム",
  "公式", "公式アカウント", "システム", "サポート", "ヘルプ",
  "ボット", "匿名", "ユーザー", "ユーザ", "ゲスト", "スタッフ",
  "オーナー", "タイプワード",
]);

const RESERVED_HAN = new Set([
  "管理员", "管理員", "管理", "运营", "運營", "官方",
  "系统", "系統", "客服", "帮助", "幫助",
  "机器人", "機器人", "匿名", "用户", "用戶", "访客", "訪客",
  "员工", "員工", "团队", "團隊",
]);

const RESERVED_CYRILLIC = new Set([
  "админ", "администратор", "модератор", "поддержка", "помощь",
  "система", "официальный", "бот", "аноним", "пользователь",
  "гость", "сотрудник", "команда",
]);

function isAnyReservedExact(s: string): boolean {
  return RESERVED.has(s) || RESERVED_HANGUL.has(s) || RESERVED_KANA_KANJI.has(s)
    || RESERVED_HAN.has(s) || RESERVED_CYRILLIC.has(s);
}

/**
 * Catches common spoofing variants. Examples blocked:
 *   admin, _admin, admin_, admin.07, admin1, admins, admin_support,
 *   support.help.07, 관_리_자, админ_07
 * Safe (allowed): admiral, admire, jisu_07, my_admin_pet
 */
function isReservedVariant(s: string, script: string): boolean {
  if (isAnyReservedExact(s)) return true;

  // Strip separators (. _) → still reserved?
  const collapsed = s.replace(/[._]/g, "");
  if (isAnyReservedExact(collapsed)) return true;

  // Latin-specific: trailing digit suffix (admin1, admin123) and plural -s.
  if (script === "latin") {
    const noTrailDigits = collapsed.replace(/[0-9]+$/, "");
    if (noTrailDigits !== collapsed && RESERVED.has(noTrailDigits)) return true;
    if (collapsed.length > 1 && collapsed.endsWith("s")
        && RESERVED.has(collapsed.slice(0, -1))) return true;
  }

  // All parts reserved-or-numeric (admin_07, support.help, 운영_관리)
  const parts = s.split(/[._]+/).filter(Boolean);
  if (parts.length >= 2
      && parts.every((p) => isAnyReservedExact(p) || /^[0-9]+$/.test(p))) {
    return true;
  }

  return false;
}

// Script categories. Each username must be ENTIRELY in one of these scripts
// (plus digits 0-9, dot, underscore, which are universally allowed).
const RE_LATIN     = /^[a-z0-9._]+$/;
const RE_HANGUL    = /^[가-힣ㄱ-ㆎ0-9._]+$/u;
const RE_KANA_KANJI = /^[ぁ-ゖ゠-ヺー一-鿿々〆㐀-䶿豈-﫿0-9._]+$/u;
const RE_HAN       = /^[一-鿿㐀-䶿豈-﫿0-9._]+$/u;
const RE_CYRILLIC  = /^[а-яёєіј-џ0-9._]+$/u;

function detectScript(s: string): "latin" | "hangul" | "kana_kanji" | "han" | "cyrillic" | null {
  if (RE_LATIN.test(s)) return "latin";
  if (RE_HANGUL.test(s)) return "hangul";
  // Order matters: kana_kanji must be tried BEFORE pure han, because kana
  // chars are NOT in the han block — so a string with kana fails RE_HAN but
  // passes RE_KANA_KANJI. A pure-han string passes both; we prefer han.
  if (RE_HAN.test(s)) return "han";
  if (RE_KANA_KANJI.test(s)) return "kana_kanji";
  if (RE_CYRILLIC.test(s)) return "cyrillic";
  return null;
}

function isLetter(ch: string): boolean {
  // Match any letter from supported scripts. Excludes 0-9, dot, underscore.
  return /^[a-z가-힣ぁ-ゖ゠-ヺー一-鿿々〆㐀-䶿豈-﫿а-яёєіј-џ]$/u.test(ch);
}

interface ValidationResult {
  ok: boolean;
  code?: string;
  normalized?: string; // lowercase + NFC
}

function validateFormat(raw: string): ValidationResult {
  if (typeof raw !== "string") return { ok: false, code: "invalid_format" };
  // NFC normalize first
  let s = raw.normalize("NFC").trim();
  // Lowercase Latin/Cyrillic; CJK has no case so toLowerCase is a no-op.
  s = s.toLowerCase();

  // Length (count code points after normalization)
  const codePoints = [...s];
  if (codePoints.length < MIN_LEN) return { ok: false, code: "too_short" };
  if (codePoints.length > MAX_LEN) return { ok: false, code: "too_long" };

  // Detect single script
  const script = detectScript(s);
  if (!script) return { ok: false, code: "mixed_script" };

  // Format rules: must start with a letter, must not end with . or _,
  // no consecutive . or _ (or mixed)
  const first = codePoints[0];
  if (!isLetter(first)) return { ok: false, code: "invalid_format" };
  const last = codePoints[codePoints.length - 1];
  if (last === "." || last === "_") return { ok: false, code: "invalid_format" };
  for (let i = 0; i < codePoints.length - 1; i++) {
    const a = codePoints[i];
    const b = codePoints[i + 1];
    if ((a === "." || a === "_") && (b === "." || b === "_")) {
      return { ok: false, code: "invalid_format" };
    }
  }

  // Reserved check — variant-matched per script.
  if (isReservedVariant(s, script)) return { ok: false, code: "reserved" };

  return { ok: true, normalized: s };
}

interface RequestBody {
  mode?: "validate" | "set";
  username?: unknown;
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
    if (user.is_anonymous) return jsonResponse(403, { code: "anonymous_blocked" }, cors);

    const body = (await req.json()) as RequestBody;
    const mode = body.mode === "set" ? "set" : "validate";
    const raw = typeof body.username === "string" ? body.username : "";

    const fmt = validateFormat(raw);
    if (!fmt.ok) return jsonResponse(200, { ok: false, code: fmt.code }, cors);

    const u = fmt.normalized!;

    // Profanity / blocklist (multi-language)
    const bl = checkBlocklist(u);
    if (!bl.ok) {
      return jsonResponse(200, { ok: false, code: "blocklist_match" }, cors);
    }

    // OpenAI moderation (catches edge cases blocklist misses)
    try {
      const mod = await moderateText(u);
      if (!mod.ok) {
        return jsonResponse(200, { ok: false, code: "moderation_flagged" }, cors);
      }
    } catch {
      // If moderation API fails, fall through — the blocklist already passed.
    }

    // DB uniqueness check (case-insensitive)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: existing } = await admin
      .from("profiles")
      .select("user_id")
      .ilike("username", u)
      .limit(1);
    if (existing && existing.length > 0 && existing[0].user_id !== user.id) {
      return jsonResponse(200, { ok: false, code: "taken" }, cors);
    }

    if (mode === "validate") {
      return jsonResponse(200, { ok: true, normalized: u }, cors);
    }

    // mode = set: persist
    const { error: writeErr } = await admin
      .from("profiles")
      .update({ username: u })
      .eq("user_id", user.id);
    if (writeErr) {
      // Race: someone else took it in the moment between check and write
      if ((writeErr.message ?? "").toLowerCase().includes("unique")) {
        return jsonResponse(200, { ok: false, code: "taken" }, cors);
      }
      return jsonResponse(500, { code: "write_failed", message: writeErr.message }, cors);
    }

    return jsonResponse(200, { ok: true, normalized: u }, cors);
  } catch (e) {
    return jsonResponse(500, { code: "server_error", message: (e as Error).message }, cors);
  }
});
