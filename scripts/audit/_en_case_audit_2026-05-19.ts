// EN case-routing audit — 2026-05-19
// -----------------------------------------------------------
// Side-by-side comparison: OLD generic COMBINED_QUICK + ALL_EXAMPLES +
// SYN_ANT prompts vs NEW en-case-routed prompts. 20 words × 4 cases.
//
// Each word generates a QUICK (canonical meanings + target translation)
// and an ENRICH (examples + syn/ant) result for BOTH prompt versions
// via direct OpenAI calls. No deployment side-effects.
//
// Run:
//   cd TypeWord
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/audit/_en_case_audit_2026-05-19.ts
//
// Output:
//   scripts/audit/en-case-audit-2026-05-19.json   (full structured)
//   scripts/audit/en-case-audit-2026-05-19.md     (human-readable)
// -----------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";

import {
  buildCombinedQuickSystemPrompt,
  buildCombinedQuickUserPrompt,
  buildAllExamplesSystemPrompt,
  buildAllExamplesUserPrompt,
  buildSynAntSystemPrompt,
  buildSynAntUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3.ts";
import {
  classifyEnInput,
  buildEnSpecializedSystemPrompt,
  buildEnSpecializedUserPrompt,
  buildEnExamplesSystemPrompt,
  buildEnSynAntSystemPrompt,
  shouldSkipEnSynAnt,
  getEnSynAntCaps,
  getEnMeaningCap,
  type EnCase,
} from "../../supabase/functions/_shared/prompts-v3-en.ts";

const MODEL = "gpt-4.1-mini";
const TARGET_LANG = "ko";
const SOURCE_LANG = "en";

// 4 cases × 5 words = 20 total. Picked to span the case bucket plus
// patterns where the old generic prompt has been observed to misbehave
// (over-padding meanings, cloned examples, fabricated syn/ant).
const TEST_WORDS: { word: string; expectedCase: EnCase; note?: string }[] = [
  // simple_word — most common path; tests anti-padding + example diversity
  { word: "run", expectedCase: "simple_word", note: "polysemous verb" },
  { word: "happy", expectedCase: "simple_word", note: "common adj — syn/ant risk" },
  { word: "book", expectedCase: "simple_word", note: "homonym (noun/verb)" },
  { word: "give", expectedCase: "simple_word", note: "high-frequency verb" },
  { word: "beautiful", expectedCase: "simple_word", note: "adj — register-variant syn risk" },

  // set_expression — phrasal verbs + idioms + compound nouns
  { word: "look up", expectedCase: "set_expression", note: "polysemous phrasal" },
  { word: "give in", expectedCase: "set_expression", note: "phrasal verb" },
  { word: "ice cream", expectedCase: "set_expression", note: "compound noun" },
  { word: "kick the bucket", expectedCase: "set_expression", note: "idiom — figurative" },
  { word: "as soon as possible", expectedCase: "set_expression", note: "fixed adverbial" },

  // proper_acronym — covers both acronyms and Title-Case proper nouns
  { word: "Seoul", expectedCase: "proper_acronym", note: "Korean capital — neutral" },
  { word: "Microsoft", expectedCase: "proper_acronym", note: "brand" },
  { word: "NASA", expectedCase: "proper_acronym", note: "acronym read as word" },
  { word: "FBI", expectedCase: "proper_acronym", note: "initialism" },
  { word: "Tokyo", expectedCase: "proper_acronym", note: "city" },

  // number_symbol — pure digits + symbols
  { word: "42", expectedCase: "number_symbol", note: "plain number" },
  { word: "1984", expectedCase: "number_symbol", note: "year-shaped + cultural ref" },
  { word: "@", expectedCase: "number_symbol", note: "symbol" },
  { word: "100", expectedCase: "number_symbol", note: "round number" },
  { word: "3.14", expectedCase: "number_symbol", note: "decimal" },
];

interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
}
interface OpenAiResponse {
  choices: { message: { content: string } }[];
  usage: OpenAiUsage;
}

async function callOpenAi(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
): Promise<{ raw: unknown; tokensIn: number; tokensOut: number }> {
  const body = {
    model: MODEL,
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 200)}`);
  }
  const j = await resp.json() as OpenAiResponse;
  const content = j.choices[0]?.message?.content ?? "{}";
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    raw = { _parse_error: content.slice(0, 200) };
  }
  return {
    raw,
    tokensIn: j.usage.prompt_tokens,
    tokensOut: j.usage.completion_tokens,
  };
}

interface QuickResult {
  headword?: string;
  ipa?: string;
  note?: string;
  meanings?: { definition: string; partOfSpeech: string }[];
  meanings_translated?: { definition: string; partOfSpeech: string }[];
}

interface ExamplesResult {
  examples?: { sentence: string; meaning_index: number }[];
}

interface SynAntResult {
  synonyms?: string[];
  antonyms?: string[];
}

interface RunResult {
  word: string;
  expectedCase: EnCase;
  classified: EnCase;
  versions: {
    [version: string]: {
      quick: QuickResult;
      examples: ExamplesResult | null;
      synant: SynAntResult | null;
      skippedSynAnt: boolean;
      tokens: { in: number; out: number };
    };
  };
}

async function runVersion(
  word: string,
  enCase: EnCase,
  buildSystem: () => string,
  buildUser: () => string,
  buildExamplesSystem: () => string,
  buildSynAntSystem: () => string,
  skipSynAnt: boolean,
  apiKey: string,
): Promise<RunResult["versions"][string]> {
  let tokensIn = 0;
  let tokensOut = 0;

  // 1. QUICK call
  const quickSys = buildSystem();
  const quickUser = buildUser();
  const quickCall = await callOpenAi(quickSys, quickUser, apiKey);
  const quick = quickCall.raw as QuickResult;
  tokensIn += quickCall.tokensIn;
  tokensOut += quickCall.tokensOut;

  const meanings = Array.isArray(quick.meanings) ? quick.meanings : [];
  if (meanings.length === 0) {
    return {
      quick,
      examples: null,
      synant: null,
      skippedSynAnt: skipSynAnt,
      tokens: { in: tokensIn, out: tokensOut },
    };
  }

  // 2. ENRICH calls — examples + (optional) syn/ant in parallel
  const exSys = buildExamplesSystem();
  const exUser = buildAllExamplesUserPrompt(
    { word, sourceLang: SOURCE_LANG, targetLang: TARGET_LANG } as never,
    quick.headword ?? word,
    meanings,
  );

  const synAntSys = buildSynAntSystem();
  const synAntUser = buildSynAntUserPrompt(
    { word, sourceLang: SOURCE_LANG, targetLang: TARGET_LANG } as never,
    quick.headword ?? word,
    meanings,
  );

  const exPromise = callOpenAi(exSys, exUser, apiKey);
  const synAntPromise = skipSynAnt
    ? Promise.resolve(null)
    : callOpenAi(synAntSys, synAntUser, apiKey);

  const [exCall, synAntCall] = await Promise.all([exPromise, synAntPromise]);
  tokensIn += exCall.tokensIn;
  tokensOut += exCall.tokensOut;
  if (synAntCall) {
    tokensIn += synAntCall.tokensIn;
    tokensOut += synAntCall.tokensOut;
  }

  return {
    quick,
    examples: exCall.raw as ExamplesResult,
    synant: synAntCall ? (synAntCall.raw as SynAntResult) : null,
    skippedSynAnt: skipSynAnt,
    tokens: { in: tokensIn, out: tokensOut },
  };
}

async function auditWord(
  entry: { word: string; expectedCase: EnCase; note?: string },
  apiKey: string,
): Promise<RunResult> {
  const enCase = classifyEnInput(entry.word);

  // OLD: generic prompts (current production behaviour for non-KO source)
  const oldPromise = runVersion(
    entry.word,
    enCase,
    () => buildCombinedQuickSystemPrompt(SOURCE_LANG, TARGET_LANG),
    () => buildCombinedQuickUserPrompt(
      { word: entry.word, sourceLang: SOURCE_LANG, targetLang: TARGET_LANG } as never,
    ),
    () => buildAllExamplesSystemPrompt(SOURCE_LANG),
    () => buildSynAntSystemPrompt(SOURCE_LANG),
    // OLD path only skips for numeric/symbol via shouldSkipSynAnt — which
    // we approximate here by skipping syn/ant for number_symbol case too so
    // both sides spend the same calls. Proper/acronym, OLD path would have
    // called syn/ant (and likely fabricated) — keep that call to show the
    // exact regression in the report.
    enCase === "number_symbol",
    apiKey,
  );

  // NEW: case-routed prompts + per-case caps
  const newPromise = runVersion(
    entry.word,
    enCase,
    () => buildEnSpecializedSystemPrompt(enCase, TARGET_LANG),
    () => buildEnSpecializedUserPrompt(
      { word: entry.word, sourceLang: SOURCE_LANG, targetLang: TARGET_LANG } as never,
      enCase,
    ),
    () => buildEnExamplesSystemPrompt(enCase),
    () => buildEnSynAntSystemPrompt(enCase),
    shouldSkipEnSynAnt(enCase),
    apiKey,
  );

  const [oldRes, newRes] = await Promise.all([oldPromise, newPromise]);

  return {
    word: entry.word,
    expectedCase: entry.expectedCase,
    classified: enCase,
    versions: {
      old: oldRes,
      new: newRes,
    },
  };
}

function formatMarkdown(results: RunResult[]): string {
  const lines: string[] = [];
  lines.push(`# EN case-routing audit — 2026-05-19`);
  lines.push(``);
  lines.push(`Sample: 20 words × 4 cases. Model: ${MODEL}. Target: ${TARGET_LANG}.`);
  lines.push(``);
  lines.push(`Each entry shows OLD (current generic prompt) vs NEW (case-routed) side-by-side. Raw output — not metric-scored. Decide quality by reading.`);
  lines.push(``);

  let totalOldTokensIn = 0, totalOldTokensOut = 0;
  let totalNewTokensIn = 0, totalNewTokensOut = 0;

  for (const r of results) {
    lines.push(`## \`${r.word}\` — case=${r.classified}${r.classified !== r.expectedCase ? ` ⚠ expected=${r.expectedCase}` : ""}`);
    lines.push(``);
    for (const [v, label] of [["old", "OLD"], ["new", "NEW"]] as const) {
      const ver = r.versions[v];
      lines.push(`**${label}** — meanings ${ver.quick.meanings?.length ?? 0}, examples ${ver.examples?.examples?.length ?? 0}, syn ${ver.synant?.synonyms?.length ?? 0}, ant ${ver.synant?.antonyms?.length ?? 0}${ver.skippedSynAnt ? " (syn/ant skipped)" : ""}`);
      lines.push(``);

      if (v === "old") { totalOldTokensIn += ver.tokens.in; totalOldTokensOut += ver.tokens.out; }
      else { totalNewTokensIn += ver.tokens.in; totalNewTokensOut += ver.tokens.out; }

      if (ver.quick.note) {
        lines.push(`note: \`${ver.quick.note}\``);
        lines.push(``);
      }

      // Meanings
      const meanings = ver.quick.meanings ?? [];
      const meaningsTr = ver.quick.meanings_translated ?? [];
      if (meanings.length > 0) {
        lines.push(`Meanings:`);
        for (let i = 0; i < meanings.length; i++) {
          const en = meanings[i];
          const ko = meaningsTr[i];
          lines.push(`- [${i}] (${en.partOfSpeech}) ${en.definition}  →  ${ko ? `(${ko.partOfSpeech}) ${ko.definition}` : "—"}`);
        }
        lines.push(``);
      }

      // Examples
      const ex = ver.examples?.examples ?? [];
      if (ex.length > 0) {
        lines.push(`Examples:`);
        for (const e of ex) {
          lines.push(`- [m=${e.meaning_index}] ${e.sentence}`);
        }
        lines.push(``);
      }

      // Syn/Ant
      const syn = ver.synant?.synonyms ?? [];
      const ant = ver.synant?.antonyms ?? [];
      if (syn.length > 0) lines.push(`syn: ${syn.map((s) => `\`${s}\``).join(", ")}`);
      if (ant.length > 0) lines.push(`ant: ${ant.map((s) => `\`${s}\``).join(", ")}`);
      if (syn.length > 0 || ant.length > 0) lines.push(``);

      lines.push(`<sub>tokens: in=${ver.tokens.in} out=${ver.tokens.out}</sub>`);
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  }

  lines.push(`## Token totals`);
  lines.push(``);
  lines.push(`- OLD: in=${totalOldTokensIn}, out=${totalOldTokensOut}`);
  lines.push(`- NEW: in=${totalNewTokensIn}, out=${totalNewTokensOut}`);
  lines.push(`- delta: in=${totalNewTokensIn - totalOldTokensIn} (${(((totalNewTokensIn - totalOldTokensIn) / totalOldTokensIn) * 100).toFixed(1)}%), out=${totalNewTokensOut - totalOldTokensOut} (${(((totalNewTokensOut - totalOldTokensOut) / totalOldTokensOut) * 100).toFixed(1)}%)`);

  return lines.join("\n");
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY missing. Run with --env-file=.env.local");
    process.exit(1);
  }

  console.log(`Running audit: ${TEST_WORDS.length} words × 2 versions, model=${MODEL}`);
  console.log(``);

  const results: RunResult[] = [];
  for (const entry of TEST_WORDS) {
    const t0 = Date.now();
    process.stdout.write(`  ${entry.word.padEnd(22)} [${classifyEnInput(entry.word).padEnd(15)}] ... `);
    try {
      const r = await auditWord(entry, apiKey);
      results.push(r);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `OLD: m${r.versions.old.quick.meanings?.length ?? 0}/ex${r.versions.old.examples?.examples?.length ?? 0}/s${r.versions.old.synant?.synonyms?.length ?? 0}/a${r.versions.old.synant?.antonyms?.length ?? 0} | `
        + `NEW: m${r.versions.new.quick.meanings?.length ?? 0}/ex${r.versions.new.examples?.examples?.length ?? 0}/s${r.versions.new.synant?.synonyms?.length ?? 0}/a${r.versions.new.synant?.antonyms?.length ?? 0} | ${dt}s`,
      );
    } catch (e) {
      console.log(`ERR: ${(e as Error).message.slice(0, 100)}`);
      results.push({
        word: entry.word,
        expectedCase: entry.expectedCase,
        classified: classifyEnInput(entry.word),
        versions: { _error: e as never } as never,
      });
    }
  }

  const outDir = path.resolve(import.meta.dirname ?? __dirname);
  const jsonPath = path.join(outDir, "en-case-audit-2026-05-19.json");
  const mdPath = path.join(outDir, "en-case-audit-2026-05-19.md");

  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(mdPath, formatMarkdown(results));

  console.log(``);
  console.log(`Wrote: ${jsonPath}`);
  console.log(`Wrote: ${mdPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
