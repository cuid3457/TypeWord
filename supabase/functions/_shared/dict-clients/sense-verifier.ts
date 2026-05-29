// Polysemy sentence↔sense verifier.
// -----------------------------------------------------------
// LLM judge that reads a polysemous word's SOURCE_LANG sentences and reassigns
// each to the meaning it actually demonstrates. Catches the case where the
// per-meaning generator was anchored to sense A but the LLM emitted a
// sense-B sentence (and matching wrong translation, which defeats the
// translation-token realign safety net).
//
// Only fires when meanings.length >= 2. Single-call batched: one OpenAI
// request returns the sense index for every sentence. Cost: ~$0.0001
// per polysemous word at gpt-4.1-mini pricing.

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = "gpt-4.1-mini";

export interface SenseChoice {
  /** Index into `senses` indicating which sense the sentence demonstrates. */
  index: number;
}

export interface VerifyRequest {
  word: string;
  sourceLang: string;
  /** Each sense gets: short English definition + (optionally) target gloss. */
  senses: Array<{ enDef: string; targetGloss?: string }>;
  /** Sentences in SOURCE_LANG. Marker (**W**) tolerated; not required. */
  sentences: string[];
}

const SYSTEM = `You read polysemous-word example sentences and identify which sense each sentence demonstrates.

You receive:
- WORD: the headword (in SOURCE_LANG)
- SOURCE_LANG: language of WORD and the sentences
- SENSES: a numbered list of distinct senses (English definitions). Each sense may also include a short TARGET_LANG gloss in parentheses.
- SENTENCES: a numbered list of SOURCE_LANG sentences using WORD.

Your task:
- For each SENTENCE, decide which SENSE index it demonstrates based on the sentence's literal meaning in SOURCE_LANG.
- Ignore translations entirely — judge from the SOURCE_LANG sentence's actual meaning.
- If a sentence is genuinely ambiguous between two senses, pick the more natural / contextually dominant reading.
- A sentence MUST be assigned to exactly one sense index (the closest match). Never return -1 or null.

Output strict JSON:
{
  "assignments": [<sense_index_for_sentence_0>, <sense_index_for_sentence_1>, ...]
}

The "assignments" array length MUST equal the number of SENTENCES, in the same order.`;

export async function verifySenseAssignments(
  req: VerifyRequest,
): Promise<number[] | null> {
  if (!OPENAI_KEY) return null;
  if (req.senses.length < 2) return req.sentences.map(() => 0);
  if (req.sentences.length === 0) return [];

  const senseLines = req.senses
    .map(
      (s, i) =>
        `[${i}] ${s.enDef}${s.targetGloss ? ` (${s.targetGloss})` : ""}`,
    )
    .join("\n");
  const sentenceLines = req.sentences
    .map((s, i) => `[${i}] ${s.replace(/\*\*/g, "")}`)
    .join("\n");

  const user =
    `WORD: ${req.word}\n` +
    `SOURCE_LANG: ${req.sourceLang}\n\n` +
    `SENSES:\n${senseLines}\n\n` +
    `SENTENCES:\n${sentenceLines}\n\n` +
    `Return the assignments JSON.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    if (!res.ok) {
      console.warn(`[sense-verifier] HTTP ${res.status}`);
      return null;
    }
    const body = await res.json();
    const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
    const raw = parsed.assignments;
    if (!Array.isArray(raw) || raw.length !== req.sentences.length) return null;
    const out: number[] = [];
    for (const v of raw) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n >= req.senses.length) return null;
      out.push(n);
    }
    return out;
  } catch (err) {
    console.warn(`[sense-verifier] error: ${(err as Error).message}`);
    return null;
  }
}
