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
  if (!jwt) return jsonResponse({ error: "Missing Authorization header" }, 401, cors);

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Invalid token" }, 401, cors);
  }
  const userId = userData.user.id;

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

  const startedAt = Date.now();

  try {
    await enforceAllLimits(admin, userId);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return jsonResponse({ error: err.message }, err.status, cors);
    }
    if (err instanceof BudgetExhaustedError) {
      return jsonResponse({ error: err.message }, err.status, cors);
    }
    return jsonResponse({ error: "Internal error" }, 500, cors);
  }

  // ── Image extraction usage limit ──
  const { data: profile } = await admin
    .from("profiles")
    .select("plan")
    .eq("user_id", userId)
    .single();

  const isPremium = profile?.plan === "premium";

  if (isPremium) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count } = await admin
      .from("api_calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("endpoint", ENDPOINT)
      .eq("status", "ok")
      .gte("created_at", monthStart.toISOString());

    if ((count ?? 0) >= IMAGE_LIMIT_PREMIUM) {
      return jsonResponse(
        { error: "IMAGE_LIMIT_REACHED", limit: IMAGE_LIMIT_PREMIUM, used: count },
        429,
        cors,
      );
    }
  } else {
    const { count } = await admin
      .from("api_calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("endpoint", ENDPOINT)
      .eq("status", "ok");

    if ((count ?? 0) >= IMAGE_LIMIT_FREE) {
      return jsonResponse(
        { error: "IMAGE_LIMIT_REACHED", limit: IMAGE_LIMIT_FREE, used: count },
        429,
        cors,
      );
    }
  }

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

    logApiCall(admin, {
      userId,
      endpoint: ENDPOINT,
      cacheHit: false,
      tokensInput: promptTokens,
      tokensOutput: completionTokens,
      costUsd,
      durationMs: Date.now() - startedAt,
      status: "ok",
    }).catch(() => {});

    return jsonResponse({ result: parsed }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logApiCall(admin, {
      userId,
      endpoint: ENDPOINT,
      cacheHit: false,
      status: "error",
      errorMessage: message,
      durationMs: Date.now() - startedAt,
    }).catch(() => {});
    return jsonResponse({ error: message }, 500, cors);
  }
});
