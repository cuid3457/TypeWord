import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import { LANG_NAMES } from "../_shared/prompts.ts";
import { logApiCall } from "../_shared/logging.ts";
import {
  BudgetExhaustedError,
  enforceAllLimits,
  RateLimitError,
} from "../_shared/limits.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o";

const PRICE_INPUT_PER_1M = 2.50;
const PRICE_OUTPUT_PER_1M = 10.0;

const ENDPOINT = "image-extract";

const IMAGE_LIMIT_FREE = 3;
const IMAGE_LIMIT_PREMIUM = 50;

const ALLOWED_ORIGINS = new Set([
  "https://typeword.app",
  "http://localhost:8081",
]);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
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

function jsonResponse(
  body: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function buildSystemPrompt(sourceLang: string, targetLang: string): string {
  const srcName = LANG_NAMES[sourceLang] ?? sourceLang;
  const tgtName = LANG_NAMES[targetLang] ?? targetLang;

  return `You are a vocabulary extraction expert for language learners.

Given an image containing text, extract individual vocabulary words suitable for a learner studying ${srcName} with ${tgtName} definitions.

Rules:
- Extract only ${srcName} words from the image and define them in ${tgtName}.
- If the image contains no ${srcName} text, return an empty words array.
- Extract 5–20 meaningful vocabulary words. Skip particles, punctuation, and extremely common words (the, a, is, etc.).
- For each word provide: word, reading (if CJK — hiragana for Japanese, pinyin for Chinese, or omit), definition (short, translation-style like a bilingual dictionary), partOfSpeech (in ${tgtName}).
- Return ONLY valid JSON.

JSON schema:
{
  "detectedLang": string,
  "words": [
    {
      "word": string,
      "reading": string | null,
      "definition": string,
      "partOfSpeech": string
    }
  ]
}`;
}

Deno.serve(async (req: Request) => {
  console.log("[image-extract] incoming request", { method: req.method });
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  const admin = getAdmin();
  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    console.log("[image-extract] missing auth header");
    return jsonResponse({ error: "Missing Authorization header" }, 401, cors);
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    console.log("[image-extract] invalid token", { userErr: userErr?.message });
    return jsonResponse({ error: "Invalid token" }, 401, cors);
  }
  const userId = userData.user.id;
  console.log("[image-extract] authenticated", {
    userId,
    email: userData.user.email,
  });

  let imageBase64: string;
  let sourceLang: string;
  let targetLang: string;

  try {
    const body = await req.json();
    imageBase64 = body.image;
    sourceLang = body.sourceLang;
    targetLang = body.targetLang;
    if (!imageBase64 || !sourceLang || !targetLang) {
      throw new Error("missing fields");
    }
  } catch {
    return jsonResponse({ error: "image, sourceLang, targetLang required" }, 400, cors);
  }

  // Cap inbound payload — 5 MB raw image (~6.7 MB base64). Quota + rate
  // limits gate *frequency* of abuse; this gates *size* per call so an
  // attacker can't push 50 MB JPEGs through OpenAI on each allowed shot.
  const MAX_BASE64_BYTES = 7 * 1024 * 1024;
  if (imageBase64.length > MAX_BASE64_BYTES) {
    return jsonResponse({ error: "image too large (max 5MB)" }, 413, cors);
  }

  const startedAt = Date.now();

  try {
    await enforceAllLimits(admin, userId);
    console.log("[image-extract] rate limits passed");
  } catch (err) {
    console.log("[image-extract] rate limit blocked", {
      type: err?.constructor?.name,
      message: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof RateLimitError) {
      return jsonResponse({ error: err.message }, err.status, cors);
    }
    if (err instanceof BudgetExhaustedError) {
      return jsonResponse({ error: err.message }, err.status, cors);
    }
    return jsonResponse({ error: "Internal error" }, 500, cors);
  }

  // ── Image extraction usage limit ──
  // Atomic consume on profiles: O(1) regardless of api_calls volume.
  // Calendar-month reset based on user's stored timezone; falls back to UTC
  // if timezone not set. Refunds on OpenAI-side failure (see catch block).
  const { data: profile } = await admin
    .from("profiles")
    .select("plan, timezone")
    .eq("user_id", userId)
    .single();

  const isPremium = profile?.plan === "premium";
  const userTimezone = profile?.timezone ?? "UTC";
  const limit = isPremium ? IMAGE_LIMIT_PREMIUM : IMAGE_LIMIT_FREE;
  console.log("[image-extract] profile loaded", {
    userId,
    plan: profile?.plan,
    timezone: userTimezone,
    limit,
  });

  // Raw count read just before consume, for divergence diagnosis.
  const { data: rawCheck } = await admin
    .from("profiles")
    .select("image_extract_count, image_extract_bucket")
    .eq("user_id", userId)
    .single();
  console.log("[image-extract] raw profile state pre-consume", rawCheck);

  const { data: quotaResult, error: quotaErr } = await admin.rpc(
    "try_consume_image_extract_quota",
    {
      p_user_id: userId,
      p_timezone: userTimezone,
      p_limit: limit,
    },
  );
  console.log("[image-extract] quota consume result", {
    quotaResult,
    quotaErr: quotaErr?.message,
  });

  if (quotaErr) {
    return jsonResponse({ error: "Internal error" }, 500, cors);
  }

  const quota = quotaResult as { allowed: boolean; used: number; limit: number };
  if (!quota.allowed) {
    return jsonResponse(
      { error: "IMAGE_LIMIT_REACHED", limit: quota.limit, used: quota.used },
      429,
      cors,
    );
  }
  console.log("[image-extract] quota allowed, calling OpenAI", { used: quota.used });

  try {
    const systemPrompt = buildSystemPrompt(sourceLang, targetLang);

    const openaiResp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "high",
                },
              },
              {
                type: "text",
                text: "Extract vocabulary words from this image.",
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4096,
      }),
    });

    if (!openaiResp.ok) {
      const text = await openaiResp.text();
      throw new Error(`OpenAI ${openaiResp.status}: ${text.slice(0, 200)}`);
    }

    const json = await openaiResp.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI returned no content");
    }

    let parsed: unknown;
    try {
      let cleaned = content.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI returned non-JSON content");
    }

    const rawUsage = json?.usage ?? {};
    const promptTokens = rawUsage.prompt_tokens ?? 0;
    const completionTokens = rawUsage.completion_tokens ?? 0;
    const costUsd =
      (promptTokens * PRICE_INPUT_PER_1M +
        completionTokens * PRICE_OUTPUT_PER_1M) /
      1_000_000;

    // Await log write so the edge runtime doesn't terminate it mid-insert.
    await logApiCall(admin, {
      userId,
      endpoint: ENDPOINT,
      cacheHit: false,
      tokensInput: promptTokens,
      tokensOutput: completionTokens,
      costUsd,
      durationMs: Date.now() - startedAt,
      status: "ok",
      timezone: userTimezone,
    }).catch((e) => console.log("[image-extract] logApiCall failed", e));

    return jsonResponse({ result: parsed }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.log("[image-extract] error path", { message });

    // Refund + log in parallel, but AWAIT them — fire-and-forget gets
    // cancelled by the edge runtime when the response returns.
    await Promise.allSettled([
      admin.rpc("refund_image_extract_quota", {
        p_user_id: userId,
        p_timezone: userTimezone,
      }),
      logApiCall(admin, {
        userId,
        endpoint: ENDPOINT,
        cacheHit: false,
        status: "error",
        errorMessage: message,
        durationMs: Date.now() - startedAt,
        timezone: userTimezone,
      }),
    ]);

    return jsonResponse({ error: message }, 500, cors);
  }
});
