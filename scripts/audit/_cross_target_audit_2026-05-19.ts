// Cross-target audit — 2026-05-19
// -----------------------------------------------------------
// Validates that case-routed QUICK prompts emit correct TARGET_LANG POS
// (from each target's POS_BY_LANG list) and pure TARGET_LANG definitions
// across all (source, target) combinations.
//
// Coverage: 8 sources × 3 words × 7 targets (KO target excluded since
// already extensively measured) = 168 QUICK calls. Concurrency=4.
//
// Run:
//   cd TypeWord
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/audit/_cross_target_audit_2026-05-19.ts
//
// Output:
//   scripts/audit/cross-target-audit-2026-05-19.{md,json}
// -----------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import {
  POS_BY_LANG,
  LANG_NAMES,
} from "../../supabase/functions/_shared/prompts-v3.ts";
import { translatePos } from "../../supabase/functions/_shared/stitch.ts";
import {
  classifyKoInput,
  buildKoSpecializedSystemPrompt,
  buildKoSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-ko.ts";
import {
  classifyEnInput,
  buildEnSpecializedSystemPrompt,
  buildEnSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-en.ts";
import {
  classifyJaInput,
  buildJaSpecializedSystemPrompt,
  buildJaSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-ja.ts";
import {
  classifyZhInput,
  buildZhSpecializedSystemPrompt,
  buildZhSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-zh.ts";
import {
  classifyLatinInput,
  buildLatinSpecializedSystemPrompt,
  buildLatinSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-latin.ts";

const MODEL = "gpt-4.1-mini";
const CONCURRENCY = 4;

// Test words per source: pick (1) common word, (2) polysemous, (3)
// false-friend potential. The translations across 7 targets surface
// whether target POS purity / definition purity holds universally.
const TEST_WORDS: Record<string, string[]> = {
  ko: ["학교", "약속", "운영하다"],
  en: ["book", "happy", "check"],
  ja: ["学校", "約束", "食べる"],
  "zh-CN": ["学校", "朋友", "经济"],
  es: ["hola", "mañana", "correr"],
  fr: ["bonjour", "main", "libre"],
  de: ["Haus", "gehen", "Gift"],
  it: ["ciao", "morbido", "grande"],
};

const ALL_SOURCES = ["ko", "en", "ja", "zh-CN", "es", "fr", "de", "it"];
// KO excluded (already measured); each source's self-pair excluded.
const TARGETS = ["en", "ja", "zh-CN", "es", "fr", "de", "it"];

interface OpenAiUsage { prompt_tokens: number; completion_tokens: number; }
interface OpenAiResponse { choices: { message: { content: string } }[]; usage: OpenAiUsage; }

async function callOpenAi(systemPrompt: string, userPrompt: string, apiKey: string) {
  const body = {
    model: MODEL,
    temperature: 0.3,
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

function buildPrompts(source: string, target: string, word: string): { sys: string; user: string } {
  const req = { word, sourceLang: source, targetLang: target } as never;
  if (source === "ko") {
    const c = classifyKoInput(word);
    return { sys: buildKoSpecializedSystemPrompt(c, target), user: buildKoSpecializedUserPrompt(req, c) };
  }
  if (source === "en") {
    const c = classifyEnInput(word);
    return { sys: buildEnSpecializedSystemPrompt(c, target), user: buildEnSpecializedUserPrompt(req, c) };
  }
  if (source === "ja") {
    const c = classifyJaInput(word);
    return { sys: buildJaSpecializedSystemPrompt(c, target), user: buildJaSpecializedUserPrompt(req, c) };
  }
  if (source === "zh-CN") {
    const c = classifyZhInput(word);
    return { sys: buildZhSpecializedSystemPrompt(c, target), user: buildZhSpecializedUserPrompt(req, c) };
  }
  // Latin: es/fr/de/it
  const c = classifyLatinInput(word, source as never);
  return {
    sys: buildLatinSpecializedSystemPrompt(c, source as never, target),
    user: buildLatinSpecializedUserPrompt(req, c),
  };
}

// Per-target script regex for purity check
const SCRIPT_RE: Record<string, RegExp> = {
  en: /[A-Za-z]/,
  ko: /[가-힣]/,
  ja: /[ぁ-んァ-ヶ一-鿿]/,
  "zh-CN": /[一-鿿]/,
  es: /[A-Za-zÀ-ÿ]/,
  fr: /[A-Za-zÀ-ÿ]/,
  de: /[A-Za-zÀ-ÿß]/,
  it: /[A-Za-zÀ-ÿ]/,
};

// "Non-target" script: characters that should NOT appear in target text
function hasNonTargetScript(text: string, target: string): { found: boolean; chars: string } {
  // Any CJK character that is NOT one of the target's expected scripts
  const cjkRe = /[぀-ヿ一-鿿가-힯]/g;
  const matches = text.match(cjkRe) ?? [];
  if (matches.length === 0) return { found: false, chars: "" };

  // Filter to chars that aren't in target's allowed scripts
  let bad = "";
  for (const ch of matches) {
    const code = ch.codePointAt(0)!;
    const isHiragana = code >= 0x3040 && code <= 0x309f;
    const isKatakana = code >= 0x30a0 && code <= 0x30ff;
    const isCjkUnified = code >= 0x4e00 && code <= 0x9fff;
    const isHangul = code >= 0xac00 && code <= 0xd7af;

    if (target === "ja" && (isHiragana || isKatakana || isCjkUnified)) continue;
    if (target === "zh-CN" && isCjkUnified) continue;
    if (target === "ko" && isHangul) continue;
    // EN / Latin targets: NO CJK allowed
    bad += ch;
  }
  return { found: bad.length > 0, chars: bad };
}

interface MeaningEntry { definition: string; partOfSpeech: string; }
interface QuickResult {
  headword?: string;
  note?: string;
  meanings?: MeaningEntry[];
  meanings_translated?: MeaningEntry[];
}

interface AuditRow {
  source: string;
  target: string;
  word: string;
  translatedPOS: string[];          // RAW AI output
  posAfterStitch: string[];          // After translatePos normalization
  translatedDef: string[];
  posInTargetList: boolean[];        // RAW check
  posAfterStitchInList: boolean[];   // Production-equivalent check
  defScriptClean: boolean[];
  badChars: string[];
  tokensIn: number;
  tokensOut: number;
  error?: string;
}

function parseTargetPosSet(target: string): Set<string> {
  const posStr = POS_BY_LANG[target] ?? POS_BY_LANG[target.split("-")[0]] ?? "";
  return new Set(posStr.split("/").map((s) => s.trim()).filter(Boolean));
}

async function auditPair(
  source: string,
  target: string,
  word: string,
  apiKey: string,
): Promise<AuditRow> {
  try {
    const { sys, user } = buildPrompts(source, target, word);
    const { raw, tokensIn, tokensOut } = await callOpenAi(sys, user, apiKey);
    const q = raw as QuickResult;
    const tPosSet = parseTargetPosSet(target);

    const translatedPOS = (q.meanings_translated ?? []).map((m) => m.partOfSpeech ?? "");
    const translatedDef = (q.meanings_translated ?? []).map((m) => m.definition ?? "");
    const posInTargetList = translatedPOS.map((p) => tPosSet.has(p.trim()));
    // Apply production stitch translatePos to compute user-facing POS.
    // Production calls translatePos with the CANONICAL (source-side)
    // POS, but here we apply it to the AI-emitted translated POS as a
    // best-effort production simulation. translatePos resolves aliases
    // and target-list mismatches deterministically.
    const posAfterStitch = translatedPOS.map((p) => translatePos(p, target));
    const posAfterStitchInList = posAfterStitch.map((p) => tPosSet.has(p.trim()));
    const defScriptClean: boolean[] = [];
    const badChars: string[] = [];
    for (const def of translatedDef) {
      const { found, chars } = hasNonTargetScript(def, target);
      defScriptClean.push(!found);
      badChars.push(chars);
    }
    return { source, target, word, translatedPOS, posAfterStitch, translatedDef, posInTargetList, posAfterStitchInList, defScriptClean, badChars, tokensIn, tokensOut };
  } catch (e) {
    return {
      source, target, word,
      translatedPOS: [], posAfterStitch: [], translatedDef: [],
      posInTargetList: [], posAfterStitchInList: [], defScriptClean: [], badChars: [],
      tokensIn: 0, tokensOut: 0,
      error: (e as Error).message.slice(0, 200),
    };
  }
}

async function runConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<AuditRow>): Promise<AuditRow[]> {
  const results: AuditRow[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const r = await fn(items[idx]);
      results[idx] = r;
      process.stdout.write(`.`);
      if ((idx + 1) % 50 === 0) process.stdout.write(`[${idx + 1}/${items.length}]\n`);
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

  // Build task list: (source, target, word) where target !== source.
  const tasks: { source: string; target: string; word: string }[] = [];
  for (const source of ALL_SOURCES) {
    const words = TEST_WORDS[source] ?? [];
    for (const word of words) {
      for (const target of TARGETS) {
        if (target === source) continue; // skip same-language pair
        tasks.push({ source, target, word });
      }
    }
  }

  console.log(`Running ${tasks.length} cross-target QUICK calls (concurrency=${CONCURRENCY}, model=${MODEL})`);
  console.log(``);

  const rows = await runConcurrent(tasks, CONCURRENCY, (t) => auditPair(t.source, t.target, t.word, apiKey));

  // Summary
  let posInListCount = 0, posTotal = 0;
  let posAfterStitchInListCount = 0;
  let defCleanCount = 0, defTotal = 0;
  let tokensIn = 0, tokensOut = 0, errors = 0;
  for (const r of rows) {
    if (r.error) { errors++; continue; }
    tokensIn += r.tokensIn;
    tokensOut += r.tokensOut;
    for (const ok of r.posInTargetList) { posTotal++; if (ok) posInListCount++; }
    for (const ok of r.posAfterStitchInList) { if (ok) posAfterStitchInListCount++; }
    for (const ok of r.defScriptClean) { defTotal++; if (ok) defCleanCount++; }
  }

  // Format markdown report
  const lines: string[] = [];
  lines.push(`# Cross-target audit — 2026-05-19`);
  lines.push(``);
  lines.push(`Coverage: ${tasks.length} (source, target, word) pairs. Model: ${MODEL}.`);
  lines.push(``);
  lines.push(`## Summary metrics`);
  lines.push(``);
  lines.push(`- POS in target POS_BY_LANG list (RAW AI output): ${posInListCount}/${posTotal} = ${(posInListCount / posTotal * 100).toFixed(1)}%`);
  lines.push(`- POS in target list AFTER stitch.translatePos (user-facing): ${posAfterStitchInListCount}/${posTotal} = ${(posAfterStitchInListCount / posTotal * 100).toFixed(1)}%`);
  lines.push(`- Definition free of cross-script leakage: ${defCleanCount}/${defTotal} = ${(defCleanCount / defTotal * 100).toFixed(1)}%`);
  lines.push(`- API errors: ${errors}`);
  lines.push(`- Tokens: in=${tokensIn}, out=${tokensOut}`);
  lines.push(``);

  // Failures table — POST-stitch only (user-facing)
  const failures = rows.filter((r) =>
    !r.error && (
      r.posAfterStitchInList.some((ok) => !ok) ||
      r.defScriptClean.some((ok) => !ok)
    )
  );
  lines.push(`## Failures (${failures.length} pairs)`);
  lines.push(``);
  if (failures.length === 0) {
    lines.push(`(none — all translated POS in target list and all definitions script-pure)`);
  } else {
    lines.push(`| Source | Target | Word | Issue | Raw POS | Post-stitch POS | Def | Bad chars |`);
    lines.push(`|---|---|---|---|---|---|---|---|`);
    for (const r of failures) {
      for (let i = 0; i < r.translatedPOS.length; i++) {
        const posIssue = !r.posAfterStitchInList[i];
        const defIssue = !r.defScriptClean[i];
        if (!posIssue && !defIssue) continue;
        const issues = [];
        if (posIssue) issues.push("POS not in target list (post-stitch)");
        if (defIssue) issues.push("def script leak");
        lines.push(`| ${r.source} | ${r.target} | \`${r.word}\` | ${issues.join("; ")} | \`${r.translatedPOS[i]}\` | \`${r.posAfterStitch[i]}\` | \`${r.translatedDef[i].slice(0, 30)}\` | \`${r.badChars[i] ?? ""}\` |`);
      }
    }
  }
  lines.push(``);

  // Per-pair details
  lines.push(`## Per-pair details`);
  lines.push(``);
  for (const r of rows) {
    if (r.error) {
      lines.push(`### ${r.source} → ${r.target}: \`${r.word}\` — ERROR`);
      lines.push(``);
      lines.push(r.error);
      lines.push(``);
      continue;
    }
    lines.push(`### ${r.source} → ${r.target}: \`${r.word}\``);
    lines.push(``);
    for (let i = 0; i < r.translatedPOS.length; i++) {
      const posOk = r.posInTargetList[i] ? "✓" : "✗";
      const defOk = r.defScriptClean[i] ? "✓" : "✗";
      lines.push(`- [${i}] (\`${r.translatedPOS[i]}\` ${posOk}) ${r.translatedDef[i]} ${defOk}${r.badChars[i] ? ` (leak: \`${r.badChars[i]}\`)` : ""}`);
    }
    lines.push(``);
  }

  const outDir = path.resolve(import.meta.dirname ?? __dirname);
  const jsonPath = path.join(outDir, "cross-target-audit-2026-05-19.json");
  const mdPath = path.join(outDir, "cross-target-audit-2026-05-19.md");
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
  fs.writeFileSync(mdPath, lines.join("\n"));

  console.log(``);
  console.log(`POS in target list (RAW): ${posInListCount}/${posTotal} = ${(posInListCount / posTotal * 100).toFixed(1)}%`);
  console.log(`POS in target list (post-stitch, user-facing): ${posAfterStitchInListCount}/${posTotal} = ${(posAfterStitchInListCount / posTotal * 100).toFixed(1)}%`);
  console.log(`Definition script clean: ${defCleanCount}/${defTotal} = ${(defCleanCount / defTotal * 100).toFixed(1)}%`);
  console.log(`Errors: ${errors}`);
  console.log(`Tokens: in=${tokensIn}, out=${tokensOut}`);
  console.log(``);
  console.log(`Wrote: ${jsonPath}`);
  console.log(`Wrote: ${mdPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
