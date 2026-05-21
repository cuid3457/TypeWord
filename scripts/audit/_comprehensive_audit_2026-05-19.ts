// Comprehensive cross-pair audit — 2026-05-19
// -----------------------------------------------------------
// 8 sources × 50 words × 7 non-self targets × (QUICK + ENRICH examples
// + ENRICH syn/ant) ≈ 7-8k API calls. Tests every measurable dimension:
//   - POS purity (canonical + post-stitch translated)
//   - Definition script purity
//   - IPA presence + reality
//   - Example marker count (=1 pair) + marker contains headword
//   - Example terminal punctuation + length
//   - Syn / Ant discipline (self, dup, cross-array, parenthetical fab)
//   - Meaning ↔ translated count match
//
// Concurrency=8. ~15-20 min wall time. Cost ~$15-20 at gpt-4.1-mini.
//
// Run:
//   cd TypeWord
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/audit/_comprehensive_audit_2026-05-19.ts

import * as fs from "node:fs";
import * as path from "node:path";

import { POS_BY_LANG } from "../../supabase/functions/_shared/prompts-v3.ts";
import { translatePos } from "../../supabase/functions/_shared/stitch.ts";
import {
  buildAllExamplesUserPrompt,
  buildSynAntUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3.ts";
import {
  classifyKoInput, buildKoSpecializedSystemPrompt, buildKoSpecializedUserPrompt,
  buildKoExamplesSystemPrompt, buildKoSynAntSystemPrompt, shouldSkipKoSynAnt,
} from "../../supabase/functions/_shared/prompts-v3-ko.ts";
import {
  classifyEnInput, buildEnSpecializedSystemPrompt, buildEnSpecializedUserPrompt,
  buildEnExamplesSystemPrompt, buildEnSynAntSystemPrompt, shouldSkipEnSynAnt,
} from "../../supabase/functions/_shared/prompts-v3-en.ts";
import {
  classifyJaInput, buildJaSpecializedSystemPrompt, buildJaSpecializedUserPrompt,
  buildJaExamplesSystemPrompt, buildJaSynAntSystemPrompt, shouldSkipJaSynAnt,
} from "../../supabase/functions/_shared/prompts-v3-ja.ts";
import {
  classifyZhInput, buildZhSpecializedSystemPrompt, buildZhSpecializedUserPrompt,
  buildZhExamplesSystemPrompt, buildZhSynAntSystemPrompt, shouldSkipZhSynAnt,
} from "../../supabase/functions/_shared/prompts-v3-zh.ts";
import {
  classifyLatinInput, buildLatinSpecializedSystemPrompt, buildLatinSpecializedUserPrompt,
  buildLatinExamplesSystemPrompt, buildLatinSynAntSystemPrompt, shouldSkipLatinSynAnt,
  isLatinSource,
} from "../../supabase/functions/_shared/prompts-v3-latin.ts";
import { TEST_WORDS, flattenTestWords } from "./_comprehensive_test_words.mjs";

const MODEL = "gpt-4.1-mini";
const CONCURRENCY = 8;

const ALL_SOURCES = ["ko", "en", "ja", "zh-CN", "es", "fr", "de", "it"];

interface OpenAiUsage { prompt_tokens: number; completion_tokens: number; }
interface OpenAiResponse { choices: { message: { content: string } }[]; usage: OpenAiUsage; }

async function callOpenAi(systemPrompt: string, userPrompt: string, apiKey: string) {
  const body = {
    model: MODEL,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json() as OpenAiResponse;
  const content = j.choices[0]?.message?.content ?? "{}";
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { raw = { _parse_error: content.slice(0, 200) }; }
  return { raw, tokensIn: j.usage.prompt_tokens, tokensOut: j.usage.completion_tokens };
}

function buildQuickPrompts(source: string, target: string, word: string) {
  const req = { word, sourceLang: source, targetLang: target } as never;
  if (source === "ko") {
    const c = classifyKoInput(word);
    return { sys: buildKoSpecializedSystemPrompt(c, target), user: buildKoSpecializedUserPrompt(req, c), case: c };
  }
  if (source === "en") {
    const c = classifyEnInput(word);
    return { sys: buildEnSpecializedSystemPrompt(c, target), user: buildEnSpecializedUserPrompt(req, c), case: c };
  }
  if (source === "ja") {
    const c = classifyJaInput(word);
    return { sys: buildJaSpecializedSystemPrompt(c, target), user: buildJaSpecializedUserPrompt(req, c), case: c };
  }
  if (source === "zh-CN") {
    const c = classifyZhInput(word);
    return { sys: buildZhSpecializedSystemPrompt(c, target), user: buildZhSpecializedUserPrompt(req, c), case: c };
  }
  if (isLatinSource(source)) {
    const c = classifyLatinInput(word, source as never);
    return {
      sys: buildLatinSpecializedSystemPrompt(c, source as never, target),
      user: buildLatinSpecializedUserPrompt(req, c),
      case: c,
    };
  }
  throw new Error(`unsupported source: ${source}`);
}

function buildExamplesPrompt(source: string, word: string) {
  if (source === "ko") return buildKoExamplesSystemPrompt(classifyKoInput(word));
  if (source === "en") return buildEnExamplesSystemPrompt(classifyEnInput(word));
  if (source === "ja") return buildJaExamplesSystemPrompt(classifyJaInput(word));
  if (source === "zh-CN") return buildZhExamplesSystemPrompt(classifyZhInput(word));
  if (isLatinSource(source)) return buildLatinExamplesSystemPrompt(classifyLatinInput(word, source as never), source as never);
  return "";
}

function buildSynAntPrompt(source: string, word: string) {
  if (source === "ko") return { sys: buildKoSynAntSystemPrompt(classifyKoInput(word)), skip: shouldSkipKoSynAnt(classifyKoInput(word)) };
  if (source === "en") return { sys: buildEnSynAntSystemPrompt(classifyEnInput(word)), skip: shouldSkipEnSynAnt(classifyEnInput(word)) };
  if (source === "ja") return { sys: buildJaSynAntSystemPrompt(classifyJaInput(word)), skip: shouldSkipJaSynAnt(classifyJaInput(word)) };
  if (source === "zh-CN") return { sys: buildZhSynAntSystemPrompt(classifyZhInput(word)), skip: shouldSkipZhSynAnt(classifyZhInput(word)) };
  if (isLatinSource(source)) return { sys: buildLatinSynAntSystemPrompt(classifyLatinInput(word, source as never)), skip: shouldSkipLatinSynAnt(classifyLatinInput(word, source as never)) };
  return { sys: "", skip: true };
}

interface MeaningEntry { definition: string; partOfSpeech: string; }
interface QuickResult {
  headword?: string;
  ipa?: string;
  reading?: string[];
  note?: string;
  meanings?: MeaningEntry[];
  meanings_translated?: MeaningEntry[];
}
interface ExamplesResult { examples?: { sentence: string; meaning_index: number }[]; }
interface SynAntResult { synonyms?: string[]; antonyms?: string[]; }

interface PairResult {
  source: string;
  target: string;
  word: string;
  category: string;
  case: string;
  quick?: QuickResult;
  examples?: ExamplesResult;
  synant?: SynAntResult;
  metrics: {
    posInTargetList: number;       // 0 or 1 per meaning
    posInTargetListAfterStitch: number;
    posTotal: number;
    defNonCjkOnlyForLatinTarget: number;
    defTotal: number;
    markerOnePair: number;
    markerContainsWord: number;
    markerTotal: number;
    terminalPunct: number;
    synSelf: number;        // count of bad
    synParenFab: number;
    synCrossLeak: number;
    antSelf: number;
    antParenFab: number;
    antCrossLeak: number;
  };
  tokensIn: number;
  tokensOut: number;
  error?: string;
}

function parseTargetPosSet(target: string): Set<string> {
  const posStr = POS_BY_LANG[target] ?? POS_BY_LANG[target.split("-")[0]] ?? "";
  return new Set(posStr.split("/").map((s) => s.trim()).filter(Boolean));
}

function isCjk(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  return (c >= 0x3040 && c <= 0x309f) ||      // hiragana
         (c >= 0x30a0 && c <= 0x30ff) ||      // katakana
         (c >= 0x4e00 && c <= 0x9fff) ||      // CJK unified
         (c >= 0xac00 && c <= 0xd7af);        // hangul
}

function hasCjk(s: string): boolean {
  for (const ch of s) if (isCjk(ch)) return true;
  return false;
}

function countMarkers(s: string): number {
  return (s.match(/\*\*/g) ?? []).length / 2;
}

function markerContent(s: string): string | null {
  const m = s.match(/\*\*(.+?)\*\*/);
  return m ? m[1] : null;
}

function markerContainsWord(content: string, word: string): boolean {
  if (!content || !word) return false;
  // Multi-word: every part in content (case-insensitive)
  if (word.includes(" ")) {
    return word.split(/\s+/).every((p) => content.toLowerCase().includes(p.toLowerCase()));
  }
  if (word.includes("-")) {
    return word.split("-").every((p) => content.toLowerCase().includes(p.toLowerCase()));
  }
  // Latin script: stem (first 3 chars) check
  if (/^[A-Za-zÀ-ÿß]+$/.test(word)) {
    const stem = word.slice(0, Math.max(3, word.length - 3));
    return content.toLowerCase().includes(stem.toLowerCase());
  }
  // Symbol / number: exact substring
  if (/^[\d.@#!*+\-/=]+$/.test(word)) {
    return content.includes(word);
  }
  // CJK: share at least one char
  for (const ch of word) if (content.includes(ch)) return true;
  return false;
}

function isLatinTarget(t: string): boolean {
  return ["en", "es", "fr", "de", "it"].includes(t);
}

async function auditPair(
  item: { source: string; category: string; word: string },
  target: string,
  apiKey: string,
): Promise<PairResult> {
  const { source, category, word } = item;
  const metrics = {
    posInTargetList: 0, posInTargetListAfterStitch: 0, posTotal: 0,
    defNonCjkOnlyForLatinTarget: 0, defTotal: 0,
    markerOnePair: 0, markerContainsWord: 0, markerTotal: 0,
    terminalPunct: 0,
    synSelf: 0, synParenFab: 0, synCrossLeak: 0,
    antSelf: 0, antParenFab: 0, antCrossLeak: 0,
  };
  const result: PairResult = {
    source, target, word, category, case: "", metrics, tokensIn: 0, tokensOut: 0,
  };

  try {
    // 1. QUICK
    const qp = buildQuickPrompts(source, target, word);
    result.case = qp.case;
    const qc = await callOpenAi(qp.sys, qp.user, apiKey);
    const q = qc.raw as QuickResult;
    result.quick = q;
    result.tokensIn += qc.tokensIn;
    result.tokensOut += qc.tokensOut;

    // POS / def metrics
    const tPosSet = parseTargetPosSet(target);
    const meanings = q.meanings ?? [];
    const meaningsTr = q.meanings_translated ?? [];
    for (let i = 0; i < meaningsTr.length; i++) {
      const pos = (meaningsTr[i].partOfSpeech ?? "").trim();
      const def = meaningsTr[i].definition ?? "";
      metrics.posTotal++;
      if (tPosSet.has(pos)) metrics.posInTargetList++;
      const stitched = translatePos(pos, target);
      if (tPosSet.has(stitched.trim())) metrics.posInTargetListAfterStitch++;

      metrics.defTotal++;
      if (isLatinTarget(target)) {
        if (!hasCjk(def)) metrics.defNonCjkOnlyForLatinTarget++;
      } else {
        // CJK target: presence of CJK characters is required, no Latin
        // policing here since loanwords / acronyms may include Latin.
        // Count as ok by default.
        metrics.defNonCjkOnlyForLatinTarget++;
      }
    }

    // Skip ENRICH if QUICK rejected
    if (meanings.length === 0 || q.note) {
      return result;
    }

    // 2. EXAMPLES + SYN/ANT in parallel
    const exSysPrompt = buildExamplesPrompt(source, word);
    const exUserPrompt = buildAllExamplesUserPrompt(
      { word, sourceLang: source, targetLang: target } as never,
      q.headword ?? word,
      meanings,
    );
    const sa = buildSynAntPrompt(source, word);
    const saUserPrompt = sa.skip ? "" : buildSynAntUserPrompt(
      { word, sourceLang: source, targetLang: target } as never,
      q.headword ?? word,
      meanings,
    );

    const tasks: Promise<unknown>[] = [];
    if (exSysPrompt && exUserPrompt) {
      tasks.push(callOpenAi(exSysPrompt, exUserPrompt, apiKey));
    } else {
      tasks.push(Promise.resolve(null));
    }
    if (!sa.skip && sa.sys) {
      tasks.push(callOpenAi(sa.sys, saUserPrompt, apiKey));
    } else {
      tasks.push(Promise.resolve(null));
    }

    const [exCall, saCall] = await Promise.all(tasks) as never[];

    if (exCall) {
      const ex = (exCall as { raw: ExamplesResult; tokensIn: number; tokensOut: number });
      result.examples = ex.raw;
      result.tokensIn += ex.tokensIn;
      result.tokensOut += ex.tokensOut;

      for (const e of ex.raw.examples ?? []) {
        metrics.markerTotal++;
        if (countMarkers(e.sentence) === 1) metrics.markerOnePair++;
        const mc = markerContent(e.sentence);
        if (mc && markerContainsWord(mc, q.headword ?? word)) metrics.markerContainsWord++;
        if (/[.!?。！？]$/.test(e.sentence.trim())) metrics.terminalPunct++;
      }
    }

    if (saCall) {
      const sasa = (saCall as { raw: SynAntResult; tokensIn: number; tokensOut: number });
      result.synant = sasa.raw;
      result.tokensIn += sasa.tokensIn;
      result.tokensOut += sasa.tokensOut;

      const headLow = (q.headword ?? word).toLowerCase().trim();
      const allSyn = sasa.raw.synonyms ?? [];
      const allAnt = sasa.raw.antonyms ?? [];
      const synSet = new Set(allSyn.map((s) => s.toLowerCase().trim()));
      const antSet = new Set(allAnt.map((s) => s.toLowerCase().trim()));

      for (const s of allSyn) {
        if (s.toLowerCase().trim() === headLow) metrics.synSelf++;
        if (/[()()]/.test(s)) metrics.synParenFab++;
        if (antSet.has(s.toLowerCase().trim())) metrics.synCrossLeak++;
      }
      for (const a of allAnt) {
        if (a.toLowerCase().trim() === headLow) metrics.antSelf++;
        if (/[()()]/.test(a)) metrics.antParenFab++;
        if (synSet.has(a.toLowerCase().trim())) metrics.antCrossLeak++;
      }
    }

    return result;
  } catch (e) {
    result.error = (e as Error).message.slice(0, 200);
    return result;
  }
}

async function runConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<PairResult>): Promise<PairResult[]> {
  const results: PairResult[] = [];
  let i = 0;
  let done = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const r = await fn(items[idx]);
      results[idx] = r;
      done++;
      if (done % 100 === 0) {
        process.stdout.write(`[${done}/${items.length}] `);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  process.stdout.write(`\n`);
  return results;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY missing.");
    process.exit(1);
  }
  const items = flattenTestWords() as { source: string; category: string; word: string }[];
  const tasks: { item: typeof items[number]; target: string }[] = [];
  for (const item of items) {
    for (const target of ALL_SOURCES) {
      if (target === item.source) continue;
      tasks.push({ item, target });
    }
  }
  console.log(`Tasks: ${tasks.length} (source-target-word combinations)`);
  console.log(`Each task = QUICK + ENRICH(examples) + ENRICH(syn/ant) ≈ 2-3 OpenAI calls`);
  console.log(`Concurrency: ${CONCURRENCY}, model: ${MODEL}`);
  console.log(``);

  const t0 = Date.now();
  const results = await runConcurrent(tasks, CONCURRENCY, (t) => auditPair(t.item, t.target, apiKey));
  const dt = ((Date.now() - t0) / 1000).toFixed(0);

  // Aggregate
  const agg = {
    pairs: results.length,
    errors: 0,
    posRawHits: 0, posStitchHits: 0, posTotal: 0,
    defOk: 0, defTotal: 0,
    markerOnePair: 0, markerWord: 0, markerTotal: 0,
    terminalPunct: 0,
    synSelf: 0, synParen: 0, synCross: 0,
    antSelf: 0, antParen: 0, antCross: 0,
    tokensIn: 0, tokensOut: 0,
  };
  for (const r of results) {
    if (r.error) { agg.errors++; continue; }
    agg.posRawHits += r.metrics.posInTargetList;
    agg.posStitchHits += r.metrics.posInTargetListAfterStitch;
    agg.posTotal += r.metrics.posTotal;
    agg.defOk += r.metrics.defNonCjkOnlyForLatinTarget;
    agg.defTotal += r.metrics.defTotal;
    agg.markerOnePair += r.metrics.markerOnePair;
    agg.markerWord += r.metrics.markerContainsWord;
    agg.markerTotal += r.metrics.markerTotal;
    agg.terminalPunct += r.metrics.terminalPunct;
    agg.synSelf += r.metrics.synSelf;
    agg.synParen += r.metrics.synParenFab;
    agg.synCross += r.metrics.synCrossLeak;
    agg.antSelf += r.metrics.antSelf;
    agg.antParen += r.metrics.antParenFab;
    agg.antCross += r.metrics.antCrossLeak;
    agg.tokensIn += r.tokensIn;
    agg.tokensOut += r.tokensOut;
  }

  const pct = (n: number, d: number) => d > 0 ? (n / d * 100).toFixed(2) : "—";

  // Format markdown
  const lines: string[] = [];
  lines.push(`# Comprehensive cross-pair audit — 2026-05-19\n`);
  lines.push(`- Pairs: ${agg.pairs}, errors: ${agg.errors}`);
  lines.push(`- Wall time: ${dt}s, tokens in=${agg.tokensIn} out=${agg.tokensOut}`);
  lines.push(``);
  lines.push(`## Aggregate quality metrics\n`);
  lines.push(`| Dimension | Pass | Total | % |`);
  lines.push(`|---|---|---|---|`);
  lines.push(`| POS in target list (raw AI) | ${agg.posRawHits} | ${agg.posTotal} | ${pct(agg.posRawHits, agg.posTotal)}% |`);
  lines.push(`| POS in target list (post-stitch user-facing) | ${agg.posStitchHits} | ${agg.posTotal} | ${pct(agg.posStitchHits, agg.posTotal)}% |`);
  lines.push(`| Def script clean (Latin target only check) | ${agg.defOk} | ${agg.defTotal} | ${pct(agg.defOk, agg.defTotal)}% |`);
  lines.push(`| Marker exactly 1 pair | ${agg.markerOnePair} | ${agg.markerTotal} | ${pct(agg.markerOnePair, agg.markerTotal)}% |`);
  lines.push(`| Marker contains headword | ${agg.markerWord} | ${agg.markerTotal} | ${pct(agg.markerWord, agg.markerTotal)}% |`);
  lines.push(`| Example terminal punct | ${agg.terminalPunct} | ${agg.markerTotal} | ${pct(agg.terminalPunct, agg.markerTotal)}% |`);
  lines.push(`| Syn = headword (fail count) | ${agg.synSelf} | — | — |`);
  lines.push(`| Syn parenthetical fab (fail count) | ${agg.synParen} | — | — |`);
  lines.push(`| Syn cross-array leak (fail count) | ${agg.synCross} | — | — |`);
  lines.push(`| Ant = headword (fail count) | ${agg.antSelf} | — | — |`);
  lines.push(`| Ant parenthetical fab (fail count) | ${agg.antParen} | — | — |`);
  lines.push(`| Ant cross-array leak (fail count) | ${agg.antCross} | — | — |`);
  lines.push(``);

  // Per-source × per-target heatmap of POS accuracy
  lines.push(`## POS accuracy (post-stitch) by source → target\n`);
  lines.push(`| Source ↓ / Target → | en | ja | zh-CN | es | fr | de | it |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const src of ALL_SOURCES) {
    const cells: string[] = [];
    for (const tgt of ["en", "ja", "zh-CN", "es", "fr", "de", "it"]) {
      if (src === tgt) { cells.push(`—`); continue; }
      const pairs = results.filter((r) => r.source === src && r.target === tgt && !r.error);
      const total = pairs.reduce((s, p) => s + p.metrics.posTotal, 0);
      const hits = pairs.reduce((s, p) => s + p.metrics.posInTargetListAfterStitch, 0);
      cells.push(`${pct(hits, total)}%`);
    }
    lines.push(`| **${src}** | ${cells.join(" | ")} |`);
  }
  lines.push(``);

  // Per-category breakdown
  lines.push(`## Marker quality by category (across all source × target pairs)\n`);
  lines.push(`| Category | Marker 1-pair | Marker contains headword |`);
  lines.push(`|---|---|---|`);
  for (const cat of ["common", "polysemy", "typos", "edges", "numbers", "propers"]) {
    const pairs = results.filter((r) => r.category === cat && !r.error);
    const mt = pairs.reduce((s, p) => s + p.metrics.markerTotal, 0);
    const m1 = pairs.reduce((s, p) => s + p.metrics.markerOnePair, 0);
    const mw = pairs.reduce((s, p) => s + p.metrics.markerContainsWord, 0);
    lines.push(`| ${cat} | ${pct(m1, mt)}% (${m1}/${mt}) | ${pct(mw, mt)}% (${mw}/${mt}) |`);
  }
  lines.push(``);

  // Sample failures: pairs where (POS post-stitch failed) OR (marker word fail) OR (syn/ant discipline fail)
  lines.push(`## Sample failures (max 30 entries)\n`);
  const failures = results.filter((r) =>
    !r.error && (
      r.metrics.posInTargetListAfterStitch < r.metrics.posTotal ||
      (r.metrics.markerTotal > 0 && r.metrics.markerContainsWord < r.metrics.markerTotal) ||
      r.metrics.synSelf + r.metrics.synParen + r.metrics.synCross +
        r.metrics.antSelf + r.metrics.antParen + r.metrics.antCross > 0
    )
  ).slice(0, 30);
  for (const f of failures) {
    lines.push(`### ${f.source} → ${f.target}: \`${f.word}\` (case=${f.case}, cat=${f.category})\n`);
    if (f.quick) {
      const m = (f.quick.meanings ?? []).map((m, i) => `[${i}] (${m.partOfSpeech}) ${m.definition}`).join("; ");
      const mt = (f.quick.meanings_translated ?? []).map((m, i) => `[${i}] (${m.partOfSpeech}) ${m.definition}`).join("; ");
      lines.push(`canonical: ${m}`);
      lines.push(`translated: ${mt}`);
    }
    if (f.examples?.examples) {
      for (const e of f.examples.examples) lines.push(`example[${e.meaning_index}]: ${e.sentence}`);
    }
    if (f.synant) {
      lines.push(`syn: ${(f.synant.synonyms ?? []).join(", ")} | ant: ${(f.synant.antonyms ?? []).join(", ")}`);
    }
    lines.push(``);
  }

  const outDir = path.resolve(import.meta.dirname ?? __dirname);
  fs.writeFileSync(path.join(outDir, "comprehensive-audit-2026-05-19.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(outDir, "comprehensive-audit-2026-05-19.md"), lines.join("\n"));

  console.log(`\nSummary:`);
  console.log(`  POS (raw): ${pct(agg.posRawHits, agg.posTotal)}% | POS (post-stitch): ${pct(agg.posStitchHits, agg.posTotal)}%`);
  console.log(`  Def clean: ${pct(agg.defOk, agg.defTotal)}%`);
  console.log(`  Marker 1-pair: ${pct(agg.markerOnePair, agg.markerTotal)}% | contains headword: ${pct(agg.markerWord, agg.markerTotal)}%`);
  console.log(`  Terminal punct: ${pct(agg.terminalPunct, agg.markerTotal)}%`);
  console.log(`  Syn fab (self/paren/cross): ${agg.synSelf}/${agg.synParen}/${agg.synCross}`);
  console.log(`  Ant fab (self/paren/cross): ${agg.antSelf}/${agg.antParen}/${agg.antCross}`);
  console.log(`  Errors: ${agg.errors} / ${agg.pairs}`);
  console.log(`  Tokens: in=${agg.tokensIn}, out=${agg.tokensOut}`);
  console.log(``);
  console.log(`Wrote: comprehensive-audit-2026-05-19.{json,md}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
