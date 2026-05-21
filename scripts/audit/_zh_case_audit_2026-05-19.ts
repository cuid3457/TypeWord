// ZH case-routing audit — 2026-05-19
// -----------------------------------------------------------
// Side-by-side comparison: OLD generic COMBINED_QUICK + ALL_EXAMPLES +
// SYN_ANT prompts vs NEW zh-case-routed prompts. 24 words × 6 cases.
//
// Run:
//   cd TypeWord
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/audit/_zh_case_audit_2026-05-19.ts
//
// Output:
//   scripts/audit/zh-case-audit-2026-05-19.json
//   scripts/audit/zh-case-audit-2026-05-19.md
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
  classifyZhInput,
  buildZhSpecializedSystemPrompt,
  buildZhSpecializedUserPrompt,
  buildZhExamplesSystemPrompt,
  buildZhSynAntSystemPrompt,
  shouldSkipZhSynAnt,
  type ZhCase,
} from "../../supabase/functions/_shared/prompts-v3-zh.ts";

const MODEL = "gpt-4.1-mini";
const TARGET_LANG = "ko";
const SOURCE_LANG = "zh-CN";

const TEST_WORDS: { word: string; expectedCase: ZhCase; note?: string }[] = [
  // number_symbol
  { word: "42", expectedCase: "number_symbol", note: "plain number + Hitchhiker meme" },
  { word: "1984", expectedCase: "number_symbol", note: "year + Orwell novel" },
  { word: "@", expectedCase: "number_symbol", note: "symbol" },
  { word: "3.14", expectedCase: "number_symbol", note: "decimal + pi constant" },

  // set_expression (no whitespace, prefix-detected)
  { word: "你好", expectedCase: "set_expression", note: "casual greeting" },
  { word: "谢谢", expectedCase: "set_expression", note: "gratitude" },
  { word: "对不起", expectedCase: "set_expression", note: "apology" },
  { word: "再见", expectedCase: "set_expression", note: "farewell" },

  // chengyu_4char
  { word: "一帆风顺", expectedCase: "chengyu_4char", note: "common chengyu (smooth sailing)" },
  { word: "马马虎虎", expectedCase: "chengyu_4char", note: "common chengyu (so-so)" },
  { word: "中华民族", expectedCase: "chengyu_4char", note: "4-char proper noun compound" },
  { word: "人民日报", expectedCase: "chengyu_4char", note: "4-char proper noun (newspaper)" },

  // single_char
  { word: "水", expectedCase: "single_char", note: "standalone noun" },
  { word: "月", expectedCase: "single_char", note: "moon/month dual sense" },
  { word: "人", expectedCase: "single_char", note: "person noun + counter" },
  { word: "行", expectedCase: "single_char", note: "polyphone xíng vs háng" },

  // latin_acronym
  { word: "CCTV", expectedCase: "latin_acronym", note: "China Central TV" },
  { word: "NBA", expectedCase: "latin_acronym", note: "American basketball" },
  { word: "WTO", expectedCase: "latin_acronym", note: "World Trade Organization" },
  { word: "BTS", expectedCase: "latin_acronym", note: "Korean boy band" },

  // simple_word
  { word: "北京", expectedCase: "simple_word", note: "hanzi-form proper noun (capital)" },
  { word: "中国", expectedCase: "simple_word", note: "hanzi-form proper noun (country)" },
  { word: "学校", expectedCase: "simple_word", note: "common compound noun" },
  { word: "朋友", expectedCase: "simple_word", note: "common compound noun" },
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
  reading?: string[];
  note?: string;
  meanings?: { definition: string; partOfSpeech: string }[];
  meanings_translated?: { definition: string; partOfSpeech: string }[];
}
interface ExamplesResult { examples?: { sentence: string; meaning_index: number }[]; }
interface SynAntResult { synonyms?: string[]; antonyms?: string[]; }

interface RunResult {
  word: string;
  expectedCase: ZhCase;
  classified: ZhCase;
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
  zhCase: ZhCase,
  buildSystem: () => string,
  buildUser: () => string,
  buildExamplesSystem: () => string,
  buildSynAntSystem: () => string,
  skipSynAnt: boolean,
  apiKey: string,
): Promise<RunResult["versions"][string]> {
  let tokensIn = 0;
  let tokensOut = 0;

  const quickSys = buildSystem();
  const quickUser = buildUser();
  const quickCall = await callOpenAi(quickSys, quickUser, apiKey);
  const quick = quickCall.raw as QuickResult;
  tokensIn += quickCall.tokensIn;
  tokensOut += quickCall.tokensOut;

  const meanings = Array.isArray(quick.meanings) ? quick.meanings : [];
  if (meanings.length === 0) {
    return {
      quick, examples: null, synant: null,
      skippedSynAnt: skipSynAnt,
      tokens: { in: tokensIn, out: tokensOut },
    };
  }

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
  entry: { word: string; expectedCase: ZhCase; note?: string },
  apiKey: string,
): Promise<RunResult> {
  const zhCase = classifyZhInput(entry.word);

  const oldPromise = runVersion(
    entry.word, zhCase,
    () => buildCombinedQuickSystemPrompt(SOURCE_LANG, TARGET_LANG),
    () => buildCombinedQuickUserPrompt(
      { word: entry.word, sourceLang: SOURCE_LANG, targetLang: TARGET_LANG } as never,
    ),
    () => buildAllExamplesSystemPrompt(SOURCE_LANG),
    () => buildSynAntSystemPrompt(SOURCE_LANG),
    zhCase === "number_symbol",
    apiKey,
  );

  const newPromise = runVersion(
    entry.word, zhCase,
    () => buildZhSpecializedSystemPrompt(zhCase, TARGET_LANG),
    () => buildZhSpecializedUserPrompt(
      { word: entry.word, sourceLang: SOURCE_LANG, targetLang: TARGET_LANG } as never,
      zhCase,
    ),
    () => buildZhExamplesSystemPrompt(zhCase),
    () => buildZhSynAntSystemPrompt(zhCase),
    shouldSkipZhSynAnt(zhCase),
    apiKey,
  );

  const [oldRes, newRes] = await Promise.all([oldPromise, newPromise]);

  return {
    word: entry.word,
    expectedCase: entry.expectedCase,
    classified: zhCase,
    versions: { old: oldRes, new: newRes },
  };
}

function formatMarkdown(results: RunResult[]): string {
  const lines: string[] = [];
  lines.push(`# ZH case-routing audit — 2026-05-19`);
  lines.push(``);
  lines.push(`Sample: ${TEST_WORDS.length} words × 6 cases. Model: ${MODEL}. Target: ${TARGET_LANG}.`);
  lines.push(``);

  let oldIn = 0, oldOut = 0, newIn = 0, newOut = 0;
  for (const r of results) {
    lines.push(`## \`${r.word}\` — case=${r.classified}${r.classified !== r.expectedCase ? ` ⚠ expected=${r.expectedCase}` : ""}`);
    lines.push(``);
    for (const [v, label] of [["old", "OLD"], ["new", "NEW"]] as const) {
      const ver = r.versions[v];
      lines.push(`**${label}** — meanings ${ver.quick.meanings?.length ?? 0}, examples ${ver.examples?.examples?.length ?? 0}, syn ${ver.synant?.synonyms?.length ?? 0}, ant ${ver.synant?.antonyms?.length ?? 0}${ver.skippedSynAnt ? " (syn/ant skipped)" : ""}`);
      lines.push(``);
      if (v === "old") { oldIn += ver.tokens.in; oldOut += ver.tokens.out; }
      else { newIn += ver.tokens.in; newOut += ver.tokens.out; }
      if (ver.quick.note) { lines.push(`note: \`${ver.quick.note}\``); lines.push(``); }
      if (ver.quick.headword) {
        const readingStr = Array.isArray(ver.quick.reading) && ver.quick.reading.length > 0
          ? ` [${ver.quick.reading.join(", ")}]` : "";
        lines.push(`headword: \`${ver.quick.headword}\`${readingStr}`);
        lines.push(``);
      }
      const meanings = ver.quick.meanings ?? [];
      const meaningsTr = ver.quick.meanings_translated ?? [];
      if (meanings.length > 0) {
        lines.push(`Meanings:`);
        for (let i = 0; i < meanings.length; i++) {
          const zh = meanings[i];
          const ko = meaningsTr[i];
          lines.push(`- [${i}] (${zh.partOfSpeech}) ${zh.definition}  →  ${ko ? `(${ko.partOfSpeech}) ${ko.definition}` : "—"}`);
        }
        lines.push(``);
      }
      const ex = ver.examples?.examples ?? [];
      if (ex.length > 0) {
        lines.push(`Examples:`);
        for (const e of ex) lines.push(`- [m=${e.meaning_index}] ${e.sentence}`);
        lines.push(``);
      }
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
  lines.push(`- OLD: in=${oldIn}, out=${oldOut}`);
  lines.push(`- NEW: in=${newIn}, out=${newOut}`);
  lines.push(`- delta: in=${newIn - oldIn} (${(((newIn - oldIn) / oldIn) * 100).toFixed(1)}%), out=${newOut - oldOut} (${(((newOut - oldOut) / oldOut) * 100).toFixed(1)}%)`);
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
    process.stdout.write(`  ${entry.word.padEnd(22)} [${classifyZhInput(entry.word).padEnd(15)}] ... `);
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
        word: entry.word, expectedCase: entry.expectedCase,
        classified: classifyZhInput(entry.word),
        versions: { _error: e as never } as never,
      });
    }
  }
  const outDir = path.resolve(import.meta.dirname ?? __dirname);
  const jsonPath = path.join(outDir, "zh-case-audit-2026-05-19.json");
  const mdPath = path.join(outDir, "zh-case-audit-2026-05-19.md");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(mdPath, formatMarkdown(results));
  console.log(``);
  console.log(`Wrote: ${jsonPath}`);
  console.log(`Wrote: ${mdPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
