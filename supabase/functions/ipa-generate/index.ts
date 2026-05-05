// IPA generator via espeak-ng WASM. Deterministic — same (text, language)
// always produces the same IPA. Results are cached in ipa_cache.
//
// Flow:
//   1. Validate input (text, language ∈ supported)
//   2. Cache check (hit → return immediately + bump counter)
//   3. Run espeak-ng with --ipa=3 --quiet → read phonemes from FS
//   4. Save to cache + return
//
// Cache key: nfc(lower(trim(text))) | language
//
// ────────────────────────────────────────────────────────────────────────────
// LICENSING — IMPORTANT, READ BEFORE MOVING THIS CODE:
//
// espeak-ng is **GPL-3.0-or-later**. We use it here strictly as a SERVER-SIDE
// dependency: the WASM binary runs inside this Supabase edge function and
// users only receive its OUTPUT (an IPA text string), never the espeak
// binary itself. Under GPL-3.0, server-side-only use does NOT trigger the
// copyleft "distribution" clause (that's an AGPL behaviour, and espeak-ng
// is plain GPL, not AGPL), so the rest of the TypeWord app can remain
// proprietary.
//
// DO NOT bundle the espeak-ng WASM into the React Native client app, do
// not embed it in any artefact shipped to end users, and do not import
// it from any package consumed by the mobile build. Any such embedding
// would constitute "distribution" of GPL-licensed software and would
// force the ENTIRE app it is linked into to be released under GPL-3.0
// — which would break our commercial proprietary licensing model.
//
// If you ever need IPA on-device (e.g. offline mode), do NOT reach for
// espeak-ng. Pick a permissively-licensed alternative (MIT/Apache/BSD)
// or call this server endpoint with cached results.
// ────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import ESpeakNg from "npm:espeak-ng@1.0.2";
import { BudgetExhaustedError, RateLimitError, enforceAllLimits } from "../_shared/limits.ts";

const ALLOWED_ORIGINS = new Set([
  "https://typeword.app",
  "http://localhost:8081",
]);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

let _admin: SupabaseClient | null = null;
function getAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _admin;
}

let _corsHeaders: Record<string, string> = {};
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ..._corsHeaders },
  });
}

class ValidationError extends Error {
  status = 400;
}

// App language code → espeak voice code. The WASM bundle only ships
// Latin-script European voice data; Cyrillic/CJK languages produce garbled
// output (espeak falls back to English literal-character names) so they're
// gated client-side via ipaService.SUPPORTED_LANGS_FOR_IPA.
const ESPEAK_VOICE: Record<string, string> = {
  en: "en-us",
  es: "es",
  fr: "fr-fr",
  de: "de",
  it: "it",
  pt: "pt-br",
};

const MAX_TEXT_LEN = 200;

interface IpaRequest {
  text: string;
  language: string;
}

function validateInput(body: unknown): IpaRequest {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) throw new ValidationError("text is required");
  if (text.length > MAX_TEXT_LEN) {
    throw new ValidationError(`text exceeds ${MAX_TEXT_LEN} chars`);
  }
  const language = typeof b.language === "string" ? b.language : "";
  if (!ESPEAK_VOICE[language]) {
    throw new ValidationError(`unsupported language: ${language}`);
  }
  return { text, language };
}

function normalizeForKey(s: string): string {
  // CASE PRESERVED: German espeak voice produces fundamentally different IPA
  // for "König" (recognized noun, /ˈkøːnɪç/) vs "könig" (unrecognized, falls
  // back to letter-spelling /kˈɑː ˈapzats nˈiːk/). Lowercasing the key would
  // make a poisoned lowercase entry shadow correct capitalized lookups.
  return s.normalize("NFC").trim();
}

function buildCacheKey(req: IpaRequest): string {
  return `${normalizeForKey(req.text)}|${req.language}`;
}

interface IpaCacheRow {
  ipa: string;
}

async function getCached(admin: SupabaseClient, key: string): Promise<string | null> {
  const { data, error } = await admin
    .from("ipa_cache")
    .select("ipa")
    .eq("cache_key", key)
    .maybeSingle<IpaCacheRow>();
  if (error || !data) return null;
  // Bump hit counter, fire-and-forget.
  admin.rpc("increment_ipa_hit", { p_cache_key: key }).then(() => {}, () => {});
  return data.ipa;
}

async function saveCache(
  admin: SupabaseClient,
  key: string,
  req: IpaRequest,
  ipa: string,
): Promise<void> {
  const { error } = await admin.from("ipa_cache").upsert(
    {
      cache_key: key,
      text: normalizeForKey(req.text),
      language: req.language,
      ipa,
      hit_count: 0,
    },
    { onConflict: "cache_key" },
  );
  if (error) console.error("ipa_cache save failed:", error.message);
}

/**
 * Detect when espeak produced character-name fallback garbage instead of real
 * phonemes. The bundled WASM (npm:espeak-ng@1.0.2) has incomplete voice data
 * for some languages, so it occasionally falls back to spelling out the
 * Unicode character names — producing strings like `kˈɑː ˈapzˌat‍s nˈiːk` for
 * "König" (verified: same word produces correct `kˈøːnɪç` on host espeak-ng
 * 1.52). Until the WASM is replaced, reject these obviously-broken outputs
 * rather than store/display them.
 */
function isCorruptIpa(input: string, ipa: string): boolean {
  if (!ipa) return false;
  // Parenthesized text with letters inside — espeak's character-name
  // markers like "(en)" / "(fr)" / "(latin)" leak through with ZWJ chars.
  // Real IPA never uses round parens around alphabetic content.
  if (/\([^)]*\p{L}[^)]*\)/u.test(ipa)) return true;
  // Single-word input that produced multi-word output: the only way this
  // happens is letter-spelling fallback. Multi-word inputs (idioms, phrases)
  // legitimately contain spaces and are exempt.
  const trimmed = input.trim();
  if (!/\s/.test(trimmed) && /\s/.test(ipa)) return true;
  return false;
}

// Run espeak-ng with --ipa output. Returns IPA string trimmed of whitespace.
async function generateIpa(req: IpaRequest): Promise<string> {
  const voice = ESPEAK_VOICE[req.language];
  // NFC normalize: when accented input arrives in NFD form (e + combining
  // acute), espeak treats the combining mark as a separate "tilde" /
  // "accent aigu" character and pronounces its NAME, producing garbage like
  // `ˌatˈild (en)kˈɒpɪɹˌa‍ɪt(fr)`. NFC collapses base+combining into the
  // precomposed codepoint that espeak handles correctly.
  const text = req.text.normalize("NFC");
  const espeak = await (ESpeakNg as unknown as (opts: {
    arguments: string[];
  }) => Promise<{ FS: { readFile: (p: string, opts: { encoding: string }) => string } }>)({
    arguments: [
      "-q",            // quiet — suppress audio output
      "-b=1",          // input encoding: UTF-8
      "--ipa=3",       // IPA output, no spaces between phonemes within a syllable
      "--phonout", "/tmp/ipa.txt",
      "-v", voice,
      text,
    ],
  });
  let ipa = "";
  try {
    ipa = espeak.FS.readFile("/tmp/ipa.txt", { encoding: "utf8" });
  } catch (err) {
    console.error("espeak readFile failed:", err);
  }
  const cleaned = ipa.replace(/\s+/g, " ").trim();
  if (cleaned && isCorruptIpa(text, cleaned)) {
    console.warn(`espeak corrupt output rejected: lang=${req.language} text=${JSON.stringify(text)} ipa=${JSON.stringify(cleaned)}`);
    return "";
  }
  return cleaned;
}

Deno.serve(async (req: Request) => {
  _corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: _corsHeaders });
  }
  if (req.method === "GET") {
    return new Response("ok", { status: 200, headers: _corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const admin = getAdmin();

  // Auth: verify JWT from client. Anonymous-signin tokens are valid; only
  // unauthenticated/forged tokens are rejected.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }
  const userId = userData.user.id;

  let request: IpaRequest;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    request = validateInput(body);
  } catch (err) {
    const status = err instanceof ValidationError ? err.status : 400;
    const message = err instanceof Error ? err.message : "Bad request";
    return jsonResponse({ error: message }, status);
  }

  const cacheKey = buildCacheKey(request);

  // Cache check first — cache hits skip the rate limiter entirely so users
  // never get throttled by repeated lookups of the same word.
  try {
    const cached = await getCached(admin, cacheKey);
    if (cached) return jsonResponse({ ipa: cached, cached: true });
  } catch (err) {
    console.warn("ipa cache check failed:", err);
  }

  // Rate limit only applies to fresh espeak runs (cache misses).
  try {
    await enforceAllLimits(admin, userId);
  } catch (err) {
    if (err instanceof RateLimitError) return jsonResponse({ error: err.message }, err.status);
    if (err instanceof BudgetExhaustedError) return jsonResponse({ error: err.message }, err.status);
    return jsonResponse({ error: "Internal error" }, 500);
  }

  // Generate.
  let ipa = "";
  try {
    ipa = await generateIpa(request);
  } catch (err) {
    console.error("espeak generation failed:", err);
    return jsonResponse({ error: "IPA generation failed" }, 500);
  }
  if (!ipa) {
    return jsonResponse({ error: "empty IPA result" }, 500);
  }

  // Save (fire-and-forget so the response isn't held up).
  saveCache(admin, cacheKey, request, ipa).catch(() => {});
  return jsonResponse({ ipa, cached: false });
});
