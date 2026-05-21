/**
 * Local test runner for word-lookup-v2 prompts.
 *
 * Runs the 3-prompt chain (ANALYZE → TRANSLATE_MEANING → TRANSLATE_SENTENCE)
 * against OpenAI directly — no Supabase deployment required.
 *
 * Run:
 *   cd TypeWord && npx --yes tsx scripts/test-v2-prompts.ts
 *
 * Outputs side-by-side: canonical entry (in word_lang) + translated
 * meanings + translated examples for each test case. Eyeball the
 * output for consistency before deploying.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAnalyzeSystemPrompt,
  buildAnalyzeUserPrompt,
  buildTranslateMeaningSystemPrompt,
  buildTranslateMeaningUserPrompt,
  buildTranslateSentenceSystemPrompt,
  buildTranslateSentenceUserPrompt,
} from "../supabase/functions/_shared/prompts-v2.ts";
import type {
  CanonicalMeaning,
  CanonicalExample,
  WordEntry,
  WordTranslation,
  TranslatedMeaning,
  TranslatedExample,
} from "../supabase/functions/_shared/cache-v2.ts";
import { stitchAndNormalize } from "../supabase/functions/_shared/stitch.ts";
import {
  getFallbackMeanings,
  getForceOverrideMeanings,
  getSensitiveLookupHint,
  isSensitiveLookup,
} from "../supabase/functions/_shared/disputes.ts";
import { getDualNumeralOverride } from "../supabase/functions/_shared/numerals.ts";

// ── Load OPENAI_API_KEY from .env.local ──
function loadEnv(): Record<string, string> {
  const envPath = join(process.cwd(), ".env.local");
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local missing — caller will error on key lookup
  }
  return out;
}
const env = loadEnv();
const OPENAI_API_KEY = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY missing (checked .env.local and process.env)");
  process.exit(1);
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANALYZE_MODEL = "gpt-4.1-mini";   // selectModelForLookup default
const TRANSLATE_MODEL = "gpt-4.1-mini"; // user-confirmed: keep mini

interface UsageOut {
  prompt_tokens: number;
  completion_tokens: number;
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<{ json: unknown; usage: UsageOut; durationMs: number }> {
  const started = Date.now();
  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const durationMs = Date.now() - started;
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  const content = data.choices[0]?.message?.content ?? "";
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  const parsed = JSON.parse(cleaned);
  return {
    json: parsed,
    usage: {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
    },
    durationMs,
  };
}

interface TestCase {
  label: string;
  word: string;
  sourceLang: string;
  targetLangs: string[]; // multiple targets — test cross-pair consistency
}

const TESTS: TestCase[] = [
  // POS consistency across a semantic group — the biggest improvement claim
  { label: "season-spring", word: "봄", sourceLang: "ko", targetLangs: ["en", "ja", "zh-CN"] },
  { label: "season-summer", word: "여름", sourceLang: "ko", targetLangs: ["en", "ja", "zh-CN"] },
  { label: "season-fall",   word: "가을", sourceLang: "ko", targetLangs: ["en", "ja", "zh-CN"] },
  { label: "season-winter", word: "겨울", sourceLang: "ko", targetLangs: ["en", "ja", "zh-CN"] },
  // Polysemy
  { label: "polysemy-사과", word: "사과", sourceLang: "ko", targetLangs: ["en", "ja"] },
  { label: "polysemy-bank", word: "bank", sourceLang: "en", targetLangs: ["ko", "ja"] },
  // Korea-position dispute (must apply override hint at canonical, plus 辛奇 in zh translation)
  { label: "kimchi-zh", word: "김치", sourceLang: "ko", targetLangs: ["zh-CN", "ja", "en"] },
  // French false friend — definition should reflect actual sense
  { label: "fr-lecture", word: "lecture", sourceLang: "fr", targetLangs: ["ko", "en"] },
  // German gender + IPA
  { label: "de-Hund", word: "Hund", sourceLang: "de", targetLangs: ["ko", "en"] },
  // CJK reading test (Japanese kanji)
  { label: "ja-食べる", word: "食べる", sourceLang: "ja", targetLangs: ["ko", "en"] },
  // Cross-pair consistency: same English word across multiple targets
  { label: "consistency-love", word: "love", sourceLang: "en", targetLangs: ["ko", "ja", "fr", "es"] },
  // ── Sensitive lookup tests ──
  { label: "sensitive-일본해", word: "일본해", sourceLang: "ko", targetLangs: ["en", "ja"] },
  { label: "sensitive-takeshima", word: "takeshima", sourceLang: "en", targetLangs: ["ko", "ja"] },
  { label: "sensitive-다케시마", word: "다케시마", sourceLang: "ko", targetLangs: ["en", "ja"] },
  { label: "sensitive-위안부", word: "위안부", sourceLang: "ko", targetLangs: ["en", "ja"] },
  { label: "sensitive-Trump", word: "Trump", sourceLang: "en", targetLangs: ["ko", "ja"] },
  { label: "sensitive-Holocaust", word: "Holocaust", sourceLang: "en", targetLangs: ["ko", "ja"] },
  { label: "sensitive-Taiwan", word: "Taiwan", sourceLang: "en", targetLangs: ["ko", "ja"] },
  { label: "sensitive-Jerusalem", word: "Jerusalem", sourceLang: "en", targetLangs: ["ko"] },
  { label: "sensitive-Kosovo", word: "Kosovo", sourceLang: "en", targetLangs: ["ko"] },
  { label: "sensitive-jesus", word: "Jesus", sourceLang: "en", targetLangs: ["ko"] },
];

function tag(s: string, color: "cyan" | "yellow" | "green" | "red" | "dim" = "dim") {
  const codes = { cyan: "\x1b[36m", yellow: "\x1b[33m", green: "\x1b[32m", red: "\x1b[31m", dim: "\x1b[2m" };
  return `${codes[color]}${s}\x1b[0m`;
}

async function runOne(tc: TestCase): Promise<void> {
  console.log(`\n${tag("═".repeat(70), "cyan")}`);
  console.log(`${tag("TEST:", "cyan")} ${tc.label} — "${tc.word}" (${tc.sourceLang})`);
  console.log(tag("═".repeat(70), "cyan"));

  // ── ANALYZE (called once, target-agnostic) ──
  const analyzeStart = Date.now();
  const analyzeSys = buildAnalyzeSystemPrompt(tc.sourceLang);
  const sensitive = isSensitiveLookup(tc.sourceLang, tc.word);
  if (sensitive) {
    console.log(tag("  [SENSITIVE LOOKUP — metalinguistic templates only]", "yellow"));
  }
  const analyzeUser = buildAnalyzeUserPrompt(
    {
      word: tc.word,
      sourceLang: tc.sourceLang,
      targetLang: tc.targetLangs[0], // unused by ANALYZE but type requires it
    },
    sensitive ? getSensitiveLookupHint() : undefined,
  );
  const analyze = await callOpenAI(analyzeSys, analyzeUser, ANALYZE_MODEL);
  const a = analyze.json as {
    headword?: string; ipa?: string; reading?: string[]; confidence?: number;
    note?: string;
    meanings?: CanonicalMeaning[];
    synonyms?: string[]; antonyms?: string[];
    examples?: CanonicalExample[];
  };
  const analyzeMs = Date.now() - analyzeStart;

  console.log(`\n${tag("[1] ANALYZE", "yellow")} (${analyze.usage.prompt_tokens}→${analyze.usage.completion_tokens} tok, ${analyzeMs}ms)`);
  console.log(`  headword: ${a.headword ?? "(missing)"}`);
  if (a.ipa) console.log(`  ipa:      ${a.ipa}`);
  if (a.reading) console.log(`  reading:  ${JSON.stringify(a.reading)}`);
  console.log(`  confidence: ${a.confidence ?? "?"}`);
  if (a.note) console.log(`  ${tag("note:", "red")} ${a.note}`);
  if (a.meanings?.length) {
    console.log(`  meanings:`);
    a.meanings.forEach((m, i) => {
      const g = m.gender ? ` [${m.gender}]` : "";
      console.log(`    [${i}] (${m.partOfSpeech})${g} ${m.definition}  ${tag(`r=${m.relevanceScore ?? "?"}`, "dim")}`);
    });
  }
  if (a.synonyms?.length) console.log(`  synonyms: ${a.synonyms.join(", ")}`);
  if (a.antonyms?.length) console.log(`  antonyms: ${a.antonyms.join(", ")}`);
  if (a.examples?.length) {
    console.log(`  examples:`);
    a.examples.forEach((ex, i) => {
      console.log(`    [${i}] m=${ex.meaning_index}: ${ex.sentence}`);
    });
  }

  if (a.note || !a.meanings?.length) {
    console.log(tag("\n  (skipping translation — empty meanings)", "dim"));
    return;
  }

  // Build a synthetic WordEntry for stitchAndNormalize.
  const wordEntry: WordEntry = {
    id: "",
    word: tc.word,
    word_lang: tc.sourceLang,
    headword: a.headword ?? tc.word,
    ipa: a.ipa ?? null,
    reading: a.reading ?? null,
    confidence: a.confidence ?? 80,
    note: null,
    original_input: tc.word,
    meanings: a.meanings ?? [],
    synonyms: a.synonyms ?? [],
    antonyms: a.antonyms ?? [],
    examples: a.examples ?? [],
    model: ANALYZE_MODEL,
    prompt_version: "v1",
  };

  // ── For each target lang: TRANSLATE_MEANING (+ override) + TRANSLATE_SENTENCE → stitch+normalize ──
  for (const targetLang of tc.targetLangs) {
    console.log(`\n${tag(`[2] TRANSLATE → ${targetLang}`, "green")}`);

    // Check production-style override chain first.
    const fo = getForceOverrideMeanings(tc.sourceLang, tc.word, targetLang);
    const dualNum = getDualNumeralOverride(tc.sourceLang, targetLang, tc.word);
    const overrideMeanings = fo ?? dualNum;
    let preTranslated: TranslatedMeaning[] | null = null;
    if (overrideMeanings) {
      preTranslated = overrideMeanings.map((m) => ({
        definition: m.definition, partOfSpeech: m.partOfSpeech,
      }));
      console.log(`  ${tag("[override applied — skipping TRANSLATE_MEANING]", "yellow")}`);
    } else if ((a.meanings?.length ?? 0) === 0) {
      const fb = getFallbackMeanings(tc.sourceLang, tc.word, targetLang);
      if (fb) {
        preTranslated = fb.map((m) => ({
          definition: m.definition, partOfSpeech: m.partOfSpeech,
        }));
        console.log(`  ${tag("[fallback applied]", "yellow")}`);
      }
    }

    let translatedMeanings: TranslatedMeaning[] = [];
    if (preTranslated) {
      translatedMeanings = preTranslated;
    } else if ((a.meanings?.length ?? 0) > 0) {
      const transMeaningSys = buildTranslateMeaningSystemPrompt(tc.sourceLang, targetLang);
      const transMeaningUser = buildTranslateMeaningUserPrompt(
        a.headword ?? tc.word,
        tc.sourceLang,
        targetLang,
        a.meanings ?? [],
      );
      const tm = await callOpenAI(transMeaningSys, transMeaningUser, TRANSLATE_MODEL);
      const tmJson = tm.json as { meanings?: TranslatedMeaning[] };
      translatedMeanings = tmJson.meanings ?? [];
      console.log(`  ${tag(`raw meanings (${tm.usage.prompt_tokens}→${tm.usage.completion_tokens} tok)`, "dim")}`);
      translatedMeanings.forEach((m, i) => {
        console.log(`    [${i}] (${m.partOfSpeech}) ${m.definition}`);
      });
    }

    let translatedExamples: TranslatedExample[] = [];
    if (a.examples?.length) {
      const transSentSys = buildTranslateSentenceSystemPrompt(tc.sourceLang, targetLang);
      const transSentUser = buildTranslateSentenceUserPrompt(
        a.headword ?? tc.word,
        tc.sourceLang,
        targetLang,
        a.examples,
        translatedMeanings,
      );
      const ts = await callOpenAI(transSentSys, transSentUser, TRANSLATE_MODEL);
      const tsJson = ts.json as { examples?: TranslatedExample[] };
      translatedExamples = tsJson.examples ?? [];
      console.log(`  ${tag(`raw examples (${ts.usage.prompt_tokens}→${ts.usage.completion_tokens} tok)`, "dim")}`);
      a.examples.forEach((ex, i) => {
        const t = translatedExamples[i]?.translation ?? "(missing)";
        console.log(`    [${i}] ${ex.sentence}`);
        console.log(`        ${tag("→", "dim")} ${t}`);
      });
    }

    // Stitch + normalize (v1 post-processing + v2 filters).
    const wordTranslation: WordTranslation = {
      id: "", word_entry_id: "", target_lang: targetLang,
      meanings_translated: translatedMeanings,
      examples_translated: translatedExamples,
      model: TRANSLATE_MODEL, prompt_version: "v1",
    };
    const final = stitchAndNormalize(wordEntry, wordTranslation, targetLang);

    console.log(`  ${tag("STITCHED + NORMALIZED:", "cyan")}`);
    console.log(`    headword: ${final.headword}`);
    if (final.ipa) console.log(`    ipa:      ${final.ipa}`);
    if (final.reading) console.log(`    reading:  ${JSON.stringify(final.reading)}`);
    console.log(`    confidence: ${final.confidence}`);
    if (final.note) console.log(`    ${tag("note:", "red")} ${final.note}`);
    final.meanings?.forEach((m, i) => {
      const g = m.gender ? ` [${m.gender}]` : "";
      console.log(`    [${i}] (${m.partOfSpeech})${g} ${m.definition}  ${tag(`r=${m.relevanceScore}`, "dim")}`);
    });
    if (final.synonyms?.length) console.log(`    synonyms: ${final.synonyms.join(", ")}`);
    if (final.antonyms?.length) console.log(`    antonyms: ${final.antonyms.join(", ")}`);
    final.examples?.forEach((ex, i) => {
      console.log(`    ex[${i}] ${ex.sentence}`);
      console.log(`           ${tag("→", "dim")} ${ex.translation}`);
    });
  }
}

(async () => {
  const target = process.argv[2]; // optional label filter
  const filtered = target ? TESTS.filter((t) => t.label === target) : TESTS;
  if (filtered.length === 0) {
    console.error(`No test matches label "${target}". Available:`);
    TESTS.forEach((t) => console.error(`  ${t.label}`));
    process.exit(1);
  }
  console.log(`Running ${filtered.length} test case${filtered.length === 1 ? "" : "s"}...\n`);
  for (const tc of filtered) {
    try {
      await runOne(tc);
    } catch (err) {
      console.error(`${tag("FAIL:", "red")} ${tc.label} — ${(err as Error).message}`);
    }
  }
  console.log(`\n${tag("Done.", "green")}`);
})();
