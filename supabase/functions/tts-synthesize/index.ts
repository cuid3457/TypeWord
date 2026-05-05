// Edge Function: tts-synthesize
// ---------------------------------------------------------------------------
// Returns a public mp3 URL for { text, language, gender }, synthesizing via
// Azure Neural TTS on cache miss and serving from Supabase Storage cache on
// subsequent calls.
//
// Flow:
//   1. JWT auth + rate limit (per-user)
//   2. Validate input (text, language ∈ supported, gender ∈ {M,F})
//   3. Build cache_key = nfc(lower(trim(text))) | language | gender
//   4. tts_cache lookup
//      - HIT: bump hit_count, return signed/public URL
//      - MISS: synthesize via Azure → upload to Storage → DB INSERT → URL
//   5. Log to api_calls (cache hit + cost)
// ---------------------------------------------------------------------------

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import { pickVoice, rateCorrectionFor, TTS_LOCALE, type Gender } from "../_shared/tts-voices.ts";
import { logApiCall } from "../_shared/logging.ts";
import { enforceAllLimits, RateLimitError, BudgetExhaustedError } from "../_shared/limits.ts";

const ENDPOINT = "tts-synthesize";

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

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
function fireAndForget(p: Promise<unknown> | unknown): void {
  try {
    const promise = Promise.resolve(p as Promise<unknown>);
    const safe = promise.catch((err) => console.error("background task failed:", err));
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(safe);
    }
  } catch (err) {
    console.error("fireAndForget setup failed:", err);
  }
}

class ValidationError extends Error {
  status = 400;
}

const MAX_TEXT_LEN = 500; // safety bound — typical word/sentence lookup well under this

interface TtsRequest {
  text: string;
  language: string;
  gender: Gender;
  voice?: string;  // optional override of default mapping (for voice comparison)
  /** Optional pronunciation override via SSML <phoneme>. Used for polysemous
   * Chinese chars (e.g. 长 → ph='zhang3' to force the zhǎng reading instead of
   * Azure's default cháng). Cache key includes phoneme so each reading is
   * stored as a separate audio file. */
  phoneme?: { ph: string; alphabet?: string };
}

function validateInput(body: unknown): TtsRequest {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) throw new ValidationError("text is required");
  if (text.length > MAX_TEXT_LEN) throw new ValidationError(`text exceeds ${MAX_TEXT_LEN} chars`);

  const language = typeof b.language === "string" ? b.language : "";
  if (!TTS_LOCALE[language]) throw new ValidationError(`unsupported language: ${language}`);

  const gender = b.gender;
  if (gender !== "M" && gender !== "F") throw new ValidationError("gender must be 'M' or 'F'");

  const voice = typeof b.voice === "string" ? b.voice : undefined;

  let phoneme: TtsRequest["phoneme"];
  if (b.phoneme && typeof b.phoneme === "object") {
    const p = b.phoneme as Record<string, unknown>;
    const ph = typeof p.ph === "string" ? p.ph.trim().slice(0, 100) : "";
    if (ph) {
      phoneme = {
        ph,
        alphabet: typeof p.alphabet === "string" ? p.alphabet.slice(0, 32) : undefined,
      };
    }
  }

  return { text, language, gender, voice, phoneme };
}

/** Extract BCP-47 locale from a voice ID like "en-US-JennyNeural" → "en-US". */
function localeFromVoice(voice: string): string {
  const parts = voice.split("-");
  if (parts.length >= 3) return `${parts[0]}-${parts[1]}`;
  return voice;
}

/** NFC + lowercase + collapse whitespace. Stable across user typing variants. */
function normalizeForKey(text: string): string {
  return text.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildCacheKey(req: TtsRequest, defaultVoice?: string): string {
  // Voice always included in cache_key — prevents stale audio surviving when
  // the default voice mapping changes in tts-voices.ts. Override and default
  // share the same key column so both invalidate consistently on swap.
  const voice = req.voice ?? defaultVoice ?? "";
  const voicePart = voice ? `|${voice}` : "";
  // Phoneme included so polysemy variants (e.g. 长 cháng vs zhǎng) cache as
  // separate audio files even though the text is identical. The `v2:` prefix
  // invalidates earlier `ph:` entries that were poisoned by SSML 400s falling
  // back to plain-text mp3s — those identical fallback files made both
  // polysemy cards play the same sound.
  const phPart = req.phoneme ? `|phv4:${req.phoneme.alphabet ?? "ipa"}:${req.phoneme.ph}` : "";
  return `${normalizeForKey(req.text)}|${req.language}|${req.gender}${voicePart}${phPart}`;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Escape XML special characters for safe SSML embedding. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface AzureSynthArgs {
  text: string;
  voice: string;
  locale: string;
  apiKey: string;
  region: string;
  phoneme?: { ph: string; alphabet?: string };
}

/**
 * Some TTS voices mispronounce isolated reduplicated/short Chinese words
 * (e.g. 爷爷 spoken alone often gets read with two full third tones rather
 * than tone+light-tone). Appending a sentence-ending mark forces the engine
 * into "complete utterance" prosody, which produces correct readings. Only
 * applied to Chinese text with no internal punctuation, since adding 。 to
 * something already containing punctuation would change meaning.
 */
function maybeAddSentenceEnd(text: string, locale: string): string {
  if (!locale.startsWith("zh-")) return text;
  if (/[。！？\.\!\?,，、；：]/.test(text)) return text;
  if ([...text].length > 8) return text;
  return text + "。";
}

async function synthesizeWithAzure(args: AzureSynthArgs): Promise<Uint8Array> {
  const { text, voice, locale, apiKey, region, phoneme } = args;
  // When a phoneme override is set, skip the sentence-end heuristic — adding
  // 。 outside the <phoneme> tag would be voiced separately and ruin the
  // controlled pronunciation. Use the raw text wrapped in the phoneme tag.
  const speechText = phoneme ? text : maybeAddSentenceEnd(text, locale);
  // Wrap inner content in <prosody volume="+40%"> so the mp3 itself is
  // synthesized ~40% louder. iOS plays media noticeably quieter than
  // Android at the same system volume; expo-audio's AudioPlayer.volume
  // clamps at 1.0 so client-side amplification is impossible. We bake the
  // boost into the audio at synthesis time and let the Android client
  // attenuate to compensate (Platform-specific volume in startPlayback).
  const phonemeInner = phoneme
    ? `<phoneme alphabet="${escapeXml(phoneme.alphabet ?? "sapi")}" ` +
      `ph="${escapeXml(phoneme.ph)}">${escapeXml(speechText)}</phoneme>`
    : escapeXml(speechText);
  const inner = `<prosody volume="+40%">${phonemeInner}</prosody>`;
  // mstts namespace declaration required by some Azure parser configurations
  // when phoneme overrides are present. Plain-text payloads tolerate its
  // absence, but neural voices have rejected unnamespaced phoneme requests
  // with empty 400s in production logs. Declaring it here is harmless for
  // the plain-text path and necessary for the phoneme path.
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
      `xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${locale}">` +
      `<voice name="${voice}">${inner}</voice>` +
    `</speak>`;
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "typeword-tts",
    },
    body: ssml,
  });
  if (!resp.ok) {
    const detail = await resp.text();
    // Azure's 400 body is often empty; the actual reason is sometimes in
    // headers (e.g. X-Microsoft-OutputFormat-Details, or the standard headers).
    const headerSummary: string[] = [];
    for (const [k, v] of resp.headers.entries()) {
      if (k.toLowerCase().startsWith('x-') || k.toLowerCase() === 'content-type') {
        headerSummary.push(`${k}=${v}`);
      }
    }
    console.error('Azure TTS error', {
      status: resp.status,
      detail: detail.slice(0, 500),
      ssml: ssml.slice(0, 500),
      headers: headerSummary.join('; '),
    });
    throw new Error(
      `Azure TTS ${resp.status}: ${detail.slice(0, 200)} | hdr=${headerSummary.join(';').slice(0, 200)} | ssml=${ssml.slice(0, 200)}`,
    );
  }
  return new Uint8Array(await resp.arrayBuffer());
}

function publicUrlFor(admin: SupabaseClient, storagePath: string): string {
  const { data } = admin.storage.from("tts").getPublicUrl(storagePath);
  return data.publicUrl;
}

Deno.serve(async (req: Request) => {
  _corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: _corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const admin = getAdmin();
  const azureKey = Deno.env.get("AZURE_TTS_KEY");
  const azureRegion = Deno.env.get("AZURE_TTS_REGION");
  if (!azureKey || !azureRegion) {
    return jsonResponse({ error: "TTS not configured" }, 500);
  }

  // Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "Missing Authorization header" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return jsonResponse({ error: "Invalid token" }, 401);
  const userId = userData.user.id;

  // Parse + validate
  let request: TtsRequest;
  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Voice listing mode (admin/debug): { action: "list_voices", locale?: "ko-KR" }
  if (rawBody.action === "list_voices") {
    const localeFilter = typeof rawBody.locale === "string" ? rawBody.locale : null;
    const resp = await fetch(
      `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      { headers: { "Ocp-Apim-Subscription-Key": azureKey } },
    );
    if (!resp.ok) {
      return jsonResponse({ error: `Azure list failed: ${resp.status}` }, 502);
    }
    const all = await resp.json();
    const filtered = localeFilter
      ? (all as Array<Record<string, unknown>>).filter(
          (v) => typeof v.Locale === "string" && v.Locale === localeFilter,
        )
      : all;
    return jsonResponse({ voices: filtered });
  }

  try {
    request = validateInput(rawBody);
  } catch (err) {
    const status = err instanceof ValidationError ? err.status : 400;
    const message = err instanceof Error ? err.message : "Bad request";
    return jsonResponse({ error: message }, status);
  }

  const startedAt = Date.now();

  // Resolve voice up-front so it can be folded into the cache key — switching
  // the default voice in tts-voices.ts then transparently invalidates old
  // cache entries on the next access (no manual purge needed).
  const picked = pickVoice(request.language, request.gender);
  const resolvedVoice = request.voice ?? picked?.voice;
  const rateCorrection = resolvedVoice ? rateCorrectionFor(resolvedVoice) : 1.0;

  const cacheKey = buildCacheKey(request, picked?.voice);

  // ── 1. Cache check ──────────────────────────────────────────────────
  const { data: existing, error: lookupErr } = await admin
    .from("tts_cache")
    .select("storage_path")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (lookupErr) {
    console.error("tts_cache lookup error:", lookupErr.message);
    // fall through to MISS path; better to re-synthesize than fail
  }

  if (existing?.storage_path) {
    try {
      const url = publicUrlFor(admin, existing.storage_path);
      fireAndForget(admin.rpc("tts_cache_bump", { p_key: cacheKey }));
      fireAndForget(
        logApiCall(admin, {
          userId,
          endpoint: ENDPOINT,
          cacheHit: true,
          costUsd: 0,
          durationMs: Date.now() - startedAt,
          status: "ok",
        }),
      );
      return jsonResponse({ url, cached: true, rateCorrection });
    } catch (err) {
      console.error("cache hit path threw:", err);
      // fall through to MISS path — re-synthesize
    }
  }

  // ── 2. Rate-limit before paying for Azure call ──────────────────────
  try {
    await enforceAllLimits(admin, userId);
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof BudgetExhaustedError) {
      fireAndForget(
        logApiCall(admin, {
          userId,
          endpoint: ENDPOINT,
          cacheHit: false,
          status: "rate_limited",
          errorMessage: err.message,
          durationMs: Date.now() - startedAt,
        }),
      );
      return jsonResponse({ error: err.message }, err.status);
    }
    console.error("limit check failed:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }

  // ── 3. Synthesize via Azure ─────────────────────────────────────────
  if (!picked && !request.voice) {
    return jsonResponse({ error: `unsupported language: ${request.language}` }, 400);
  }

  // Voice override (for comparison testing); locale derived from voice ID.
  const useVoice = resolvedVoice!;
  const useLocale = request.voice ? localeFromVoice(request.voice) : picked!.locale;

  let mp3: Uint8Array;
  try {
    mp3 = await synthesizeWithAzure({
      text: request.text,
      voice: useVoice,
      locale: useLocale,
      apiKey: azureKey,
      region: azureRegion,
      phoneme: request.phoneme,
    });
  } catch (err) {
    // Phoneme override fallback: if Azure rejected the SSML (commonly 400 with
    // <phoneme> in some configurations), retry with plain text so the user
    // hears *something* — even Azure's default reading is better than silence.
    // Polysemy disambiguation is lost on this fallback path; surface that we
    // had to fall back via errorMessage so it shows up in api_calls.
    if (request.phoneme) {
      try {
        mp3 = await synthesizeWithAzure({
          text: request.text,
          voice: useVoice,
          locale: useLocale,
          apiKey: azureKey,
          region: azureRegion,
        });
        const failMsg = err instanceof Error ? err.message : "phoneme rejected";
        fireAndForget(
          logApiCall(admin, {
            userId,
            endpoint: ENDPOINT,
            cacheHit: false,
            status: "ok",
            errorMessage: `phoneme_fallback: ${failMsg.slice(0, 200)}`,
            durationMs: Date.now() - startedAt,
          }),
        );
      } catch (fallbackErr) {
        const message = fallbackErr instanceof Error ? fallbackErr.message : "Azure error";
        fireAndForget(
          logApiCall(admin, {
            userId,
            endpoint: ENDPOINT,
            cacheHit: false,
            status: "error",
            errorMessage: message,
            durationMs: Date.now() - startedAt,
          }),
        );
        return jsonResponse({ error: message }, 502);
      }
    } else {
      const message = err instanceof Error ? err.message : "Azure error";
      fireAndForget(
        logApiCall(admin, {
          userId,
          endpoint: ENDPOINT,
          cacheHit: false,
          status: "error",
          errorMessage: message,
          durationMs: Date.now() - startedAt,
        }),
      );
      return jsonResponse({ error: message }, 502);
    }
  }

  // ── 4. Upload to Storage ────────────────────────────────────────────
  const hash = await sha256Hex(cacheKey);
  const storagePath = `${hash}.mp3`;
  const { error: uploadErr } = await admin.storage
    .from("tts")
    .upload(storagePath, mp3, {
      contentType: "audio/mpeg",
      upsert: true,
      cacheControl: "public, max-age=31536000, immutable",
    });
  if (uploadErr) {
    console.error("storage upload failed:", uploadErr.message);
    return jsonResponse({ error: "storage upload failed" }, 500);
  }

  // ── 5. DB insert (idempotent on cache_key) ──────────────────────────
  const { error: insertErr } = await admin
    .from("tts_cache")
    .upsert(
      {
        cache_key: cacheKey,
        text: request.text,
        language: request.language,
        gender: request.gender,
        storage_path: storagePath,
        byte_size: mp3.byteLength,
        hit_count: 0,
      },
      { onConflict: "cache_key" },
    );
  if (insertErr) {
    console.error("tts_cache insert failed:", insertErr.message);
    // Storage already has the file; client can still play it via URL.
  }

  // ── 6. Log ──────────────────────────────────────────────────────────
  // Azure Neural ~$16 / 1M chars. Track cost in USD for budgeting.
  const costUsd = (request.text.length * 16) / 1_000_000;
  fireAndForget(
    logApiCall(admin, {
      userId,
      endpoint: ENDPOINT,
      cacheHit: false,
      costUsd,
      durationMs: Date.now() - startedAt,
      status: "ok",
    }),
  );

  return jsonResponse({
    url: publicUrlFor(admin, storagePath),
    cached: false,
    rateCorrection,
  });
});
