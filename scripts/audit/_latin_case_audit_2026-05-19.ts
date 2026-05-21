// Latin case-routing audit — 2026-05-19
// -----------------------------------------------------------
// Side-by-side comparison: OLD generic COMBINED_QUICK vs NEW Latin
// case-routed prompts, across es / fr / de / it × 12 words per lang.
//
// Run:
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/audit/_latin_case_audit_2026-05-19.ts
//
// Output:
//   scripts/audit/latin-case-audit-2026-05-19.json
//   scripts/audit/latin-case-audit-2026-05-19.md
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
  classifyLatinInput,
  buildLatinSpecializedSystemPrompt,
  buildLatinSpecializedUserPrompt,
  buildLatinExamplesSystemPrompt,
  buildLatinSynAntSystemPrompt,
  shouldSkipLatinSynAnt,
  type LatinCase,
  type LatinSourceLang,
} from "../../supabase/functions/_shared/prompts-v3-latin.ts";

const MODEL = "gpt-4.1-mini";
const TARGET_LANG = "ko";

interface TestWord {
  word: string;
  expectedCase: LatinCase;
  note?: string;
}

const TEST_SETS: Record<LatinSourceLang, TestWord[]> = {
  es: [
    // simple_word
    { word: "comer", expectedCase: "simple_word", note: "verb infinitive" },
    { word: "libro", expectedCase: "simple_word", note: "masc noun" },
    { word: "feliz", expectedCase: "simple_word", note: "adjective" },
    // set_expression
    { word: "por favor", expectedCase: "set_expression", note: "fixed phrase" },
    { word: "a pesar de", expectedCase: "set_expression", note: "prepositional idiom" },
    { word: "dar de comer", expectedCase: "set_expression", note: "verbal idiom" },
    // proper_acronym
    { word: "Madrid", expectedCase: "proper_acronym", note: "city" },
    { word: "ONU", expectedCase: "proper_acronym", note: "acronym (UN)" },
    { word: "RAE", expectedCase: "proper_acronym", note: "acronym" },
    // number_symbol
    { word: "42", expectedCase: "number_symbol", note: "plain number" },
    { word: "3.14", expectedCase: "number_symbol", note: "decimal" },
    { word: "@", expectedCase: "number_symbol", note: "symbol" },
  ],
  fr: [
    { word: "manger", expectedCase: "simple_word", note: "verb infinitive" },
    { word: "livre", expectedCase: "simple_word", note: "noun (homograph: book / pound)" },
    { word: "heureux", expectedCase: "simple_word", note: "adjective" },
    { word: "s'il vous plaît", expectedCase: "set_expression", note: "polite request" },
    { word: "à cause de", expectedCase: "set_expression", note: "causal idiom" },
    { word: "avoir faim", expectedCase: "set_expression", note: "verbal idiom" },
    { word: "Paris", expectedCase: "proper_acronym", note: "city" },
    { word: "SNCF", expectedCase: "proper_acronym", note: "acronym" },
    { word: "Dupont", expectedCase: "proper_acronym", note: "surname" },
    { word: "42", expectedCase: "number_symbol" },
    { word: "3.14", expectedCase: "number_symbol" },
    { word: "@", expectedCase: "number_symbol" },
  ],
  de: [
    { word: "essen", expectedCase: "simple_word", note: "verb infinitive" },
    { word: "Buch", expectedCase: "simple_word", note: "neut noun" },
    { word: "glücklich", expectedCase: "simple_word", note: "adjective + umlaut" },
    { word: "zum Beispiel", expectedCase: "set_expression", note: "idiom" },
    { word: "auf Wiedersehen", expectedCase: "set_expression", note: "goodbye" },
    { word: "vor allem", expectedCase: "set_expression", note: "above all" },
    // German: only ACRONYM regex matches (no Title-Case → ambiguous w/ common nouns)
    { word: "BMW", expectedCase: "proper_acronym", note: "acronym (also brand)" },
    { word: "ICE", expectedCase: "proper_acronym", note: "acronym (train)" },
    { word: "EU", expectedCase: "proper_acronym", note: "acronym" },
    { word: "42", expectedCase: "number_symbol" },
    { word: "3.14", expectedCase: "number_symbol" },
    { word: "@", expectedCase: "number_symbol" },
  ],
  it: [
    { word: "mangiare", expectedCase: "simple_word", note: "verb infinitive" },
    { word: "libro", expectedCase: "simple_word", note: "masc noun" },
    { word: "felice", expectedCase: "simple_word", note: "adjective" },
    { word: "per favore", expectedCase: "set_expression", note: "polite request" },
    { word: "a causa di", expectedCase: "set_expression", note: "causal idiom" },
    { word: "avere fame", expectedCase: "set_expression", note: "verbal idiom" },
    { word: "Roma", expectedCase: "proper_acronym", note: "city" },
    { word: "FIAT", expectedCase: "proper_acronym", note: "acronym/brand" },
    { word: "Rossi", expectedCase: "proper_acronym", note: "surname" },
    { word: "42", expectedCase: "number_symbol" },
    { word: "3.14", expectedCase: "number_symbol" },
    { word: "@", expectedCase: "number_symbol" },
  ],
};

interface OpenAiResponse {
  choices: { message: { content: string } }[];
  usage: { prompt_tokens: number; completion_tokens: number };
}

async function callOpenAi(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
): Promise<{ raw: unknown; tokensIn: number; tokensOut: number }> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json() as OpenAiResponse;
  let raw: unknown;
  try { raw = JSON.parse(j.choices[0]?.message?.content ?? "{}"); } catch { raw = {}; }
  return { raw, tokensIn: j.usage.prompt_tokens, tokensOut: j.usage.completion_tokens };
}

interface RunResult {
  word: string;
  sourceLang: LatinSourceLang;
  expectedCase: LatinCase;
  classified: LatinCase;
  versions: Record<string, {
    quick: unknown;
    examples: unknown;
    synant: unknown;
    skippedSynAnt: boolean;
    tokens: { in: number; out: number };
  }>;
}

async function runVersion(
  word: string,
  sourceLang: LatinSourceLang,
  buildSystem: () => string,
  buildUser: () => string,
  buildExamplesSystem: () => string,
  buildSynAntSystem: () => string,
  skipSynAnt: boolean,
  apiKey: string,
) {
  let tokensIn = 0, tokensOut = 0;
  const quickCall = await callOpenAi(buildSystem(), buildUser(), apiKey);
  const quick = quickCall.raw as { meanings?: { definition: string; partOfSpeech: string }[]; headword?: string };
  tokensIn += quickCall.tokensIn; tokensOut += quickCall.tokensOut;
  const meanings = Array.isArray(quick.meanings) ? quick.meanings : [];
  if (meanings.length === 0) {
    return { quick, examples: null, synant: null, skippedSynAnt: skipSynAnt, tokens: { in: tokensIn, out: tokensOut } };
  }
  const req = { word, sourceLang, targetLang: TARGET_LANG } as never;
  const exUser = buildAllExamplesUserPrompt(req, quick.headword ?? word, meanings);
  const synAntUser = buildSynAntUserPrompt(req, quick.headword ?? word, meanings);
  const [exCall, synAntCall] = await Promise.all([
    callOpenAi(buildExamplesSystem(), exUser, apiKey),
    skipSynAnt ? Promise.resolve(null) : callOpenAi(buildSynAntSystem(), synAntUser, apiKey),
  ]);
  tokensIn += exCall.tokensIn; tokensOut += exCall.tokensOut;
  if (synAntCall) { tokensIn += synAntCall.tokensIn; tokensOut += synAntCall.tokensOut; }
  return { quick, examples: exCall.raw, synant: synAntCall?.raw ?? null, skippedSynAnt: skipSynAnt, tokens: { in: tokensIn, out: tokensOut } };
}

async function auditOne(
  word: TestWord,
  sourceLang: LatinSourceLang,
  apiKey: string,
): Promise<RunResult> {
  const latinCase = classifyLatinInput(word.word, sourceLang);
  const oldP = runVersion(
    word.word, sourceLang,
    () => buildCombinedQuickSystemPrompt(sourceLang, TARGET_LANG),
    () => buildCombinedQuickUserPrompt({ word: word.word, sourceLang, targetLang: TARGET_LANG } as never),
    () => buildAllExamplesSystemPrompt(sourceLang),
    () => buildSynAntSystemPrompt(sourceLang),
    latinCase === "number_symbol",  // approximate the OLD skip path
    apiKey,
  );
  const newP = runVersion(
    word.word, sourceLang,
    () => buildLatinSpecializedSystemPrompt(latinCase, sourceLang, TARGET_LANG),
    () => buildLatinSpecializedUserPrompt({ word: word.word, sourceLang, targetLang: TARGET_LANG } as never, latinCase),
    () => buildLatinExamplesSystemPrompt(latinCase, sourceLang),
    () => buildLatinSynAntSystemPrompt(latinCase),
    shouldSkipLatinSynAnt(latinCase),
    apiKey,
  );
  const [oldRes, newRes] = await Promise.all([oldP, newP]);
  return {
    word: word.word, sourceLang,
    expectedCase: word.expectedCase,
    classified: latinCase,
    versions: { old: oldRes, new: newRes },
  };
}

function formatMd(results: RunResult[]): string {
  const lines: string[] = [];
  lines.push(`# Latin (es / fr / de / it) case-routing audit — 2026-05-19`);
  lines.push(``);
  lines.push(`Sample: 12 words × 4 languages. Model: ${MODEL}. Target: ${TARGET_LANG}.`);
  lines.push(``);

  let oldIn = 0, oldOut = 0, newIn = 0, newOut = 0;
  let curLang = "";
  for (const r of results) {
    if (r.sourceLang !== curLang) {
      curLang = r.sourceLang;
      lines.push(`# ${curLang.toUpperCase()}`);
      lines.push(``);
    }
    lines.push(`## \`${r.word}\` — case=${r.classified}${r.classified !== r.expectedCase ? ` ⚠ expected=${r.expectedCase}` : ""}`);
    lines.push(``);
    for (const [v, label] of [["old", "OLD"], ["new", "NEW"]] as const) {
      const ver = r.versions[v];
      const q = ver.quick as { meanings?: { definition: string; partOfSpeech: string; gender?: string }[]; meanings_translated?: { definition: string; partOfSpeech: string }[]; note?: string; ipa?: string };
      const ex = ver.examples as { examples?: { sentence: string; meaning_index: number }[] } | null;
      const sa = ver.synant as { synonyms?: string[]; antonyms?: string[] } | null;
      lines.push(`**${label}** — meanings ${q.meanings?.length ?? 0}, examples ${ex?.examples?.length ?? 0}, syn ${sa?.synonyms?.length ?? 0}, ant ${sa?.antonyms?.length ?? 0}${ver.skippedSynAnt ? " (syn/ant skipped)" : ""}`);
      lines.push(``);
      if (v === "old") { oldIn += ver.tokens.in; oldOut += ver.tokens.out; }
      else { newIn += ver.tokens.in; newOut += ver.tokens.out; }
      if (q.note) { lines.push(`note: \`${q.note}\``); lines.push(``); }
      if (q.ipa) { lines.push(`ipa: \`${q.ipa}\``); lines.push(``); }
      const meanings = q.meanings ?? [];
      const mt = q.meanings_translated ?? [];
      if (meanings.length > 0) {
        lines.push(`Meanings:`);
        for (let i = 0; i < meanings.length; i++) {
          const en = meanings[i]; const ko = mt[i];
          const g = en.gender ? ` [${en.gender}]` : "";
          lines.push(`- [${i}] (${en.partOfSpeech}) ${en.definition}${g}  →  ${ko ? `(${ko.partOfSpeech}) ${ko.definition}` : "—"}`);
        }
        lines.push(``);
      }
      if (ex?.examples?.length) {
        lines.push(`Examples:`);
        for (const e of ex.examples) lines.push(`- [m=${e.meaning_index}] ${e.sentence}`);
        lines.push(``);
      }
      const syn = sa?.synonyms ?? []; const ant = sa?.antonyms ?? [];
      if (syn.length) lines.push(`syn: ${syn.map((s) => `\`${s}\``).join(", ")}`);
      if (ant.length) lines.push(`ant: ${ant.map((s) => `\`${s}\``).join(", ")}`);
      if (syn.length || ant.length) lines.push(``);
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
  lines.push(`- delta: in=${(((newIn - oldIn) / oldIn) * 100).toFixed(1)}%, out=${(((newOut - oldOut) / oldOut) * 100).toFixed(1)}%`);
  return lines.join("\n");
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error("OPENAI_API_KEY missing"); process.exit(1); }

  const langs: LatinSourceLang[] = ["es", "fr", "de", "it"];
  const total = langs.reduce((s, l) => s + TEST_SETS[l].length, 0);
  console.log(`Latin audit: ${total} words × 2 versions, model=${MODEL}`);
  console.log(``);

  const results: RunResult[] = [];
  for (const lang of langs) {
    console.log(`# ${lang.toUpperCase()}`);
    for (const w of TEST_SETS[lang]) {
      const t0 = Date.now();
      process.stdout.write(`  ${w.word.padEnd(20)} [${classifyLatinInput(w.word, lang).padEnd(15)}] ... `);
      try {
        const r = await auditOne(w, lang, apiKey);
        results.push(r);
        const old = r.versions.old; const nu = r.versions.new;
        const ms = (q: unknown) => (q as { meanings?: unknown[] })?.meanings?.length ?? 0;
        const exs = (e: unknown) => (e as { examples?: unknown[] } | null)?.examples?.length ?? 0;
        const syns = (s: unknown) => (s as { synonyms?: string[] } | null)?.synonyms?.length ?? 0;
        const ants = (s: unknown) => (s as { antonyms?: string[] } | null)?.antonyms?.length ?? 0;
        console.log(
          `OLD m${ms(old.quick)}/ex${exs(old.examples)}/s${syns(old.synant)}/a${ants(old.synant)} | `
          + `NEW m${ms(nu.quick)}/ex${exs(nu.examples)}/s${syns(nu.synant)}/a${ants(nu.synant)} | ${((Date.now() - t0) / 1000).toFixed(1)}s`,
        );
      } catch (e) {
        console.log(`ERR: ${(e as Error).message.slice(0, 80)}`);
      }
    }
    console.log(``);
  }

  const outDir = path.resolve(import.meta.dirname ?? __dirname);
  fs.writeFileSync(path.join(outDir, "latin-case-audit-2026-05-19.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(outDir, "latin-case-audit-2026-05-19.md"), formatMd(results));
  console.log(`Wrote: ${path.join(outDir, "latin-case-audit-2026-05-19.json")}`);
  console.log(`Wrote: ${path.join(outDir, "latin-case-audit-2026-05-19.md")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
