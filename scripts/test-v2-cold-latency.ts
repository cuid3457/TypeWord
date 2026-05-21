/**
 * Cold-latency benchmark for COMBINED_QUICK (the new single-call QUICK mode).
 *
 * Measures end-to-end LLM round-trip time for a brand-new word lookup
 * (no canonical cache). Reports per-test timing and an aggregate P50/P95.
 * Also verifies canonical consistency: the same word lookup across
 * multiple target languages must produce identical canonical meanings.
 *
 * Run:
 *   cd TypeWord && npx --yes tsx scripts/test-v2-cold-latency.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCombinedQuickSystemPrompt,
  buildCombinedQuickUserPrompt,
} from "../supabase/functions/_shared/prompts-v2.ts";

function loadEnv(): Record<string, string> {
  const envPath = join(process.cwd(), ".env.local");
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* */ }
  return out;
}
const env = loadEnv();
const OPENAI_API_KEY = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY missing");
  process.exit(1);
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4.1-mini";

interface CombinedResult {
  headword?: string;
  ipa?: string;
  reading?: string[];
  confidence?: number;
  note?: string;
  meanings?: Array<{ definition: string; partOfSpeech: string; relevanceScore?: number; gender?: string }>;
  meanings_translated?: Array<{ definition: string; partOfSpeech: string }>;
}

async function callCombined(
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ json: CombinedResult; durationMs: number; promptTok: number; outputTok: number }> {
  const systemPrompt = buildCombinedQuickSystemPrompt(sourceLang, targetLang);
  const userPrompt = buildCombinedQuickUserPrompt({
    word, sourceLang, targetLang,
  });

  const started = Date.now();
  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
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
  const data = await resp.json() as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  const content = data.choices[0]?.message?.content ?? "";
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  return {
    json: JSON.parse(cleaned),
    durationMs,
    promptTok: data.usage.prompt_tokens,
    outputTok: data.usage.completion_tokens,
  };
}

const COLD_TESTS: Array<{ word: string; src: string; tgt: string }> = [
  { word: "사과", src: "ko", tgt: "en" },
  { word: "여름", src: "ko", tgt: "en" },
  { word: "lecture", src: "fr", tgt: "ko" },
  { word: "Hund", src: "de", tgt: "ko" },
  { word: "bank", src: "en", tgt: "ko" },
  { word: "食べる", src: "ja", tgt: "ko" },
  { word: "Trump", src: "en", tgt: "ko" },
  { word: "Taiwan", src: "en", tgt: "ko" },
  { word: "love", src: "en", tgt: "ja" },
  { word: "Kosovo", src: "en", tgt: "ko" },
];

const CONSISTENCY_WORD = "사과";
const CONSISTENCY_TARGETS = ["en", "ja", "zh-CN", "fr", "es"];

function pcolor(s: string, c: "cyan" | "yellow" | "green" | "red" | "dim" = "dim") {
  const codes = { cyan: "\x1b[36m", yellow: "\x1b[33m", green: "\x1b[32m", red: "\x1b[31m", dim: "\x1b[2m" };
  return `${codes[c]}${s}\x1b[0m`;
}

async function runColdBenchmark() {
  console.log(pcolor("─".repeat(72), "cyan"));
  console.log(pcolor("COLD LATENCY BENCHMARK — COMBINED_QUICK single-call", "cyan"));
  console.log(pcolor("─".repeat(72), "cyan"));
  console.log();

  const timings: number[] = [];
  for (const t of COLD_TESTS) {
    try {
      const r = await callCombined(t.word, t.src, t.tgt);
      timings.push(r.durationMs);
      const meanings = r.json.meanings ?? [];
      const translated = r.json.meanings_translated ?? [];
      const m1 = meanings[0]?.definition ?? "(empty)";
      const t1 = translated[0]?.definition ?? "(empty)";
      console.log(
        `${t.src}→${t.tgt} ${pcolor(t.word.padEnd(12), "yellow")} ` +
        `${pcolor((r.durationMs / 1000).toFixed(2) + "s", "green").padEnd(20)} ` +
        `${r.promptTok}→${r.outputTok} tok  ` +
        pcolor(`canonical: "${m1}" → "${t1}"`, "dim"),
      );
    } catch (err) {
      console.log(`${t.src}→${t.tgt} ${t.word}: ${pcolor("FAIL", "red")} ${(err as Error).message}`);
    }
  }
  console.log();
  if (timings.length > 0) {
    timings.sort((a, b) => a - b);
    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    const p50 = timings[Math.floor(timings.length * 0.5)];
    const p95 = timings[Math.floor(timings.length * 0.95)] ?? timings[timings.length - 1];
    const min = timings[0];
    const max = timings[timings.length - 1];
    console.log(pcolor("Cold latency stats:", "cyan"));
    console.log(`  min:   ${(min / 1000).toFixed(2)}s`);
    console.log(`  P50:   ${(p50 / 1000).toFixed(2)}s`);
    console.log(`  avg:   ${(avg / 1000).toFixed(2)}s`);
    console.log(`  P95:   ${(p95 / 1000).toFixed(2)}s`);
    console.log(`  max:   ${(max / 1000).toFixed(2)}s`);
  }
}

async function runConsistencyCheck() {
  console.log();
  console.log(pcolor("─".repeat(72), "cyan"));
  console.log(pcolor(`CANONICAL CONSISTENCY CHECK — "${CONSISTENCY_WORD}" across ${CONSISTENCY_TARGETS.length} targets`, "cyan"));
  console.log(pcolor("─".repeat(72), "cyan"));
  console.log();

  type Canon = { def: string; pos: string }[];
  const canonicals: Array<{ target: string; canon: Canon; translated: Canon }> = [];

  for (const tgt of CONSISTENCY_TARGETS) {
    try {
      const r = await callCombined(CONSISTENCY_WORD, "ko", tgt);
      const canon: Canon = (r.json.meanings ?? []).map((m) => ({ def: m.definition, pos: m.partOfSpeech }));
      const translated: Canon = (r.json.meanings_translated ?? []).map((m) => ({ def: m.definition, pos: m.partOfSpeech }));
      canonicals.push({ target: tgt, canon, translated });
      console.log(`target=${pcolor(tgt.padEnd(6), "yellow")} canonical: ${canon.map((c) => `[${c.pos}] ${c.def}`).join(" | ")}`);
      console.log(`${" ".repeat(13)}translated: ${translated.map((c) => `[${c.pos}] ${c.def}`).join(" | ")}`);
    } catch (err) {
      console.log(`${tgt}: ${pcolor("FAIL", "red")}`);
    }
  }

  console.log();
  // Check: canonical[0] should be identical across all targets
  if (canonicals.length >= 2) {
    const ref = canonicals[0];
    let allMatch = true;
    for (let i = 1; i < canonicals.length; i++) {
      const c = canonicals[i];
      if (c.canon.length !== ref.canon.length) {
        allMatch = false;
        console.log(pcolor(`  DRIFT: ${c.target} has ${c.canon.length} meanings vs ref ${ref.target} ${ref.canon.length}`, "red"));
        continue;
      }
      for (let j = 0; j < c.canon.length; j++) {
        if (c.canon[j].def !== ref.canon[j].def || c.canon[j].pos !== ref.canon[j].pos) {
          allMatch = false;
          console.log(pcolor(`  DRIFT at meaning[${j}]: ${c.target} "${c.canon[j].def}" vs ${ref.target} "${ref.canon[j].def}"`, "red"));
        }
      }
    }
    if (allMatch) {
      console.log(pcolor(`  ✓ Canonical IDENTICAL across all ${CONSISTENCY_TARGETS.length} targets`, "green"));
    }
  }
}

(async () => {
  await runColdBenchmark();
  await runConsistencyCheck();
  console.log();
  console.log(pcolor("Done.", "green"));
})();
