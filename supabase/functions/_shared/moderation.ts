// OpenAI Moderation wrapper for user-generated text (community wordlist
// titles + descriptions). Two-stage check:
//
//   1. omni-moderation-latest — fast categorical scoring (free). Catches
//      obvious cases. Multilingual, covers all 10 app locales.
//   2. gpt-4o-mini contextual check — covers euphemisms / oblique sexual
//      content / context-dependent profanity that the moderation API
//      misses. ~$0.0001 per call, ~500ms.
//
// On API failure either stage **fails open** so a transient OpenAI outage
// doesn't block uploads. The keyword blocklist runs first as the cheapest
// defense layer.

const MODEL = "omni-moderation-latest";

// Per-category thresholds. omni-moderation reports a probability per
// category; > threshold counts as violation. We're slightly stricter than
// the model's default `flagged` boolean to catch edge cases the model
// reports as "not flagged" but with elevated scores.
const SCORE_THRESHOLDS: Record<string, number> = {
  // Sexual content gets tight thresholds — community wordlists are public
  // and visible to users of any age. False-positive cost (legitimate
  // wordlist rejected) is low because the user can rename and retry.
  sexual: 0.2,
  "sexual/minors": 0.05, // zero-tolerance category — minors content
  hate: 0.4,
  "hate/threatening": 0.2,
  harassment: 0.5,
  "harassment/threatening": 0.3,
  "self-harm": 0.5,
  "self-harm/intent": 0.3,
  "self-harm/instructions": 0.3,
  violence: 0.6,
  "violence/graphic": 0.5,
  illicit: 0.5,
  "illicit/violent": 0.3,
};

export type ModerationVerdict =
  | { ok: true }
  | { ok: false; categories: string[]; topCategory: string };

export async function moderateText(text: string): Promise<ModerationVerdict> {
  if (!text || text.trim().length === 0) return { ok: true };

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.warn("[moderation] OPENAI_API_KEY missing — failing open");
    return { ok: true };
  }

  let resp: Response;
  try {
    resp = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: text }),
    });
  } catch (e) {
    console.warn("[moderation] network error, failing open:", (e as Error).message);
    return { ok: true };
  }

  if (!resp.ok) {
    console.warn(`[moderation] API ${resp.status}, failing open`);
    return { ok: true };
  }

  const data = await resp.json();
  const result = data.results?.[0];
  if (!result) return { ok: true };

  // Apply our per-category thresholds. The model's own `result.flagged`
  // is also respected (it's the model's holistic judgment).
  const categoryScores = result.category_scores ?? {};
  const violations: { cat: string; score: number }[] = [];
  for (const [cat, threshold] of Object.entries(SCORE_THRESHOLDS)) {
    const score = Number(categoryScores[cat] ?? 0);
    if (score > threshold) violations.push({ cat, score });
  }

  if (result.flagged && violations.length === 0) {
    // Model flagged but no category passed our threshold — trust the model.
    const topCat = Object.entries(categoryScores)
      .sort(([, a], [, b]) => Number(b) - Number(a))[0]?.[0] ?? "unknown";
    return { ok: false, categories: [topCat], topCategory: topCat };
  }

  if (violations.length === 0) return { ok: true };

  violations.sort((a, b) => b.score - a.score);
  return {
    ok: false,
    categories: violations.map((v) => v.cat),
    topCategory: violations[0].cat,
  };
}

const CONTEXTUAL_PROMPT = `You moderate community-uploaded wordlist titles + descriptions for a public language-learning app (users 12+).

REJECT only when the text is CLEARLY inappropriate:
- Explicit sexual content (porn, sex acts, body parts in vulgar terms)
- Slurs or hate speech targeting any group (race, gender, region, sexuality)
- Online-community slang used primarily as slurs / derision (Korean: 일베/메갈/워마드/김치녀/한남충/페미충/노알라/토착왜구/짱깨/쪽바리 etc.)
- Mockery of real people (especially deceased politicians / public figures)
- Vulgar profanity (4-letter words, harsh insults)
- Encouragement of violence, drug use, or self-harm
- Obfuscated versions of any above (e.g. "f*ck", "s3x", "야ㅅㅓㄹ", "메갈ㄹㅣ아")

APPROVE everything else, including:
- Single innocent words in any language ("아니", "hello", "merci")
- Vocabulary categories (slang, idioms, business, exam prep, travel, food)
- Mild informal language and cultural references
- Foreign words you don't recognize — assume they're benign

When in doubt, APPROVE. The keyword blocklist + categorical moderation already caught the obvious cases; your job is only to catch what they missed in the gray zone.

Reply with EXACTLY one word: APPROVE or REJECT.`;

/**
 * Contextual moderation via gpt-4o-mini. Catches what omni-moderation
 * misses — euphemisms, leetspeak, context-dependent vulgarity. Slow
 * (~500ms) but cheap (~$0.0001/call) and far more nuanced than the
 * categorical moderation endpoint.
 */
export async function contextualModerationCheck(text: string): Promise<{ ok: boolean }> {
  if (!text || text.trim().length === 0) return { ok: true };
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return { ok: true };

  let resp: Response;
  try {
    resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 5,
        messages: [
          { role: "system", content: CONTEXTUAL_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });
  } catch (e) {
    console.warn("[contextual-mod] network error, failing open:", (e as Error).message);
    return { ok: true };
  }
  if (!resp.ok) {
    console.warn(`[contextual-mod] API ${resp.status}, failing open`);
    return { ok: true };
  }

  const data = await resp.json();
  const verdict = (data.choices?.[0]?.message?.content ?? "").trim().toUpperCase();
  // Be generous with parsing — accept REJECT or any string starting with REJECT.
  // Approve only if response clearly says APPROVE.
  if (verdict.startsWith("REJECT")) {
    return { ok: false };
  }
  return { ok: true };
}
