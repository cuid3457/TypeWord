// KO SynAnt audit — 2026-05-19
// -----------------------------------------------------------
// Validates the case-routed KO syn/ant prompt fix for the 7 fabrication
// patterns surfaced in the 5/18 TOPIK 1,800 audit:
//   1. register variants: 감사합니다↔고맙다, 죄송↔미안, 너↔당신
//   2. peer-not-antonym demonstratives: 그것↔저것, 여기↔저기
//   3. part-whole body confusion: 손↔팔/주먹, 다리↔발, 입↔입술
//   4. hyponym leak: 시계↔손목시계, 바지↔청바지
//   5. English loanword imposters: 안녕↔하이, 양말↔삭스
//   6. fabricated compounds: 방향↔이방향, 안경↔빛안경
//   7. slang leak: 얼굴↔얼짱
//
// Each headword runs OLD (generic SYN_ANT) vs NEW (case-routed KO
// SynAnt) and surfaces both for inspection.
//
// Run:
//   cd TypeWord
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/audit/_ko_synant_audit_2026-05-19.ts
// -----------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";

import {
  buildSynAntSystemPrompt,
  buildSynAntUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3.ts";
import {
  classifyKoInput,
  buildKoSynAntSystemPrompt,
  shouldSkipKoSynAnt,
} from "../../supabase/functions/_shared/prompts-v3-ko.ts";

const MODEL = "gpt-4.1-mini";
const TARGET_LANG = "en";
const SOURCE_LANG = "ko";

// Headwords that historically triggered each fabrication pattern.
// 'meanings' is a synthetic stub matching what the canonical pipeline
// would have produced — used as input to the syn/ant prompt.
const TEST_WORDS: {
  word: string;
  meanings: { definition: string; partOfSpeech: string }[];
  note?: string;
}[] = [
  // 1. register variants
  { word: "감사합니다", meanings: [{ definition: "감사 표현", partOfSpeech: "표현" }], note: "register: should reject 고맙다" },
  { word: "죄송합니다", meanings: [{ definition: "사과 표현", partOfSpeech: "표현" }], note: "register: should reject 미안하다" },
  { word: "너", meanings: [{ definition: "2인칭 대명사", partOfSpeech: "대명사" }], note: "register/peer: should reject 당신/자네; antonym=[]" },
  // 2. peer-not-antonym demonstratives
  { word: "그것", meanings: [{ definition: "지시 대명사", partOfSpeech: "대명사" }], note: "peer: should reject 이것/저것 as antonym" },
  { word: "여기", meanings: [{ definition: "지시 장소", partOfSpeech: "명사" }], note: "peer: should reject 거기/저기 as antonym" },
  // 3. part-whole body confusion
  { word: "손", meanings: [{ definition: "신체 부위", partOfSpeech: "명사" }], note: "part-whole: should reject 팔/주먹/손가락 as syn" },
  { word: "다리", meanings: [{ definition: "신체 부위", partOfSpeech: "명사" }], note: "part-whole: should reject 발/무릎 as syn" },
  { word: "입", meanings: [{ definition: "신체 부위", partOfSpeech: "명사" }], note: "part-whole: should reject 입술/혀 as syn" },
  // 4. hyponym leak
  { word: "시계", meanings: [{ definition: "시간을 표시하는 도구", partOfSpeech: "명사" }], note: "hyponym: should reject 손목시계/벽시계" },
  { word: "바지", meanings: [{ definition: "다리에 입는 의류", partOfSpeech: "명사" }], note: "hyponym: should reject 청바지/반바지" },
  // 5. English loanword imposters
  { word: "안녕", meanings: [{ definition: "인사 표현", partOfSpeech: "표현" }], note: "loanword: should reject 하이" },
  { word: "양말", meanings: [{ definition: "발에 신는 의류", partOfSpeech: "명사" }], note: "loanword: should reject 삭스" },
  // 6. fabricated compounds (these headwords would historically generate
  // fabricated compound synonyms)
  { word: "방향", meanings: [{ definition: "위치나 진행하는 쪽", partOfSpeech: "명사" }], note: "fabrication: should reject 이방향" },
  { word: "안경", meanings: [{ definition: "시력 교정 도구", partOfSpeech: "명사" }], note: "fabrication: should reject 빛안경" },
  // 7. slang leak
  { word: "얼굴", meanings: [{ definition: "사람의 머리 앞면", partOfSpeech: "명사" }], note: "slang: should reject 얼짱" },
  // Positive control: word with legitimate antonym
  { word: "크다", meanings: [{ definition: "사이즈가 큼", partOfSpeech: "형용사" }], note: "positive control: 작다 is legitimate ant" },
  { word: "행복하다", meanings: [{ definition: "기쁘고 만족스러움", partOfSpeech: "형용사" }], note: "positive control: 슬프다 is legitimate ant" },
];

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

interface SynAntRes { synonyms?: string[]; antonyms?: string[]; }

async function auditWord(
  entry: typeof TEST_WORDS[number],
  apiKey: string,
): Promise<{ word: string; case: string; old: SynAntRes & { tokens: { in: number; out: number } }; new: SynAntRes & { tokens: { in: number; out: number } } | null; note?: string }> {
  const koCase = classifyKoInput(entry.word);

  // OLD: generic SYN_ANT prompt
  const oldSys = buildSynAntSystemPrompt(SOURCE_LANG);
  const oldUser = buildSynAntUserPrompt(
    { word: entry.word, sourceLang: SOURCE_LANG, targetLang: TARGET_LANG } as never,
    entry.word,
    entry.meanings,
  );
  const oldCall = await callOpenAi(oldSys, oldUser, apiKey);
  const oldRes = oldCall.raw as SynAntRes;

  // NEW: case-routed KO SynAnt
  let newOut: SynAntRes & { tokens: { in: number; out: number } } | null = null;
  if (!shouldSkipKoSynAnt(koCase)) {
    const newSys = buildKoSynAntSystemPrompt(koCase);
    const newUser = buildSynAntUserPrompt(
      { word: entry.word, sourceLang: SOURCE_LANG, targetLang: TARGET_LANG } as never,
      entry.word,
      entry.meanings,
    );
    const newCall = await callOpenAi(newSys, newUser, apiKey);
    newOut = { ...(newCall.raw as SynAntRes), tokens: { in: newCall.tokensIn, out: newCall.tokensOut } };
  }

  return {
    word: entry.word,
    case: koCase,
    old: { ...oldRes, tokens: { in: oldCall.tokensIn, out: oldCall.tokensOut } },
    new: newOut,
    note: entry.note,
  };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY missing. Run with --env-file=.env.local");
    process.exit(1);
  }
  console.log(`Running KO SynAnt audit: ${TEST_WORDS.length} words, model=${MODEL}`);
  console.log(``);
  const results = [];
  for (const entry of TEST_WORDS) {
    const t0 = Date.now();
    process.stdout.write(`  ${entry.word.padEnd(12)} [${classifyKoInput(entry.word).padEnd(17)}] ... `);
    try {
      const r = await auditWord(entry, apiKey);
      results.push(r);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const newSkipped = r.new === null;
      console.log(
        `OLD: s${(r.old.synonyms ?? []).length}/a${(r.old.antonyms ?? []).length} | `
        + `NEW: ${newSkipped ? "SKIPPED" : `s${(r.new!.synonyms ?? []).length}/a${(r.new!.antonyms ?? []).length}`} | ${dt}s`,
      );
    } catch (e) {
      console.log(`ERR: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  // Format human-readable report
  const lines: string[] = [];
  lines.push(`# KO SynAnt audit — 2026-05-19`);
  lines.push(``);
  lines.push(`Sample: ${TEST_WORDS.length} words designed to probe the 7 fabrication patterns from 5/18 TOPIK audit.`);
  lines.push(`Model: ${MODEL}. Target: ${TARGET_LANG}.`);
  lines.push(``);
  for (const r of results) {
    lines.push(`## \`${r.word}\` — case=${r.case}`);
    lines.push(``);
    if (r.note) {
      lines.push(`note: ${r.note}`);
      lines.push(``);
    }
    lines.push(`**OLD** (generic SYN_ANT)`);
    const oldSyn = r.old.synonyms ?? [];
    const oldAnt = r.old.antonyms ?? [];
    if (oldSyn.length > 0) lines.push(`syn: ${oldSyn.map((s) => `\`${s}\``).join(", ")}`);
    if (oldAnt.length > 0) lines.push(`ant: ${oldAnt.map((s) => `\`${s}\``).join(", ")}`);
    if (oldSyn.length === 0 && oldAnt.length === 0) lines.push(`(empty)`);
    lines.push(``);
    lines.push(`**NEW** (case-routed KO SynAnt)`);
    if (r.new === null) {
      lines.push(`SKIPPED (case=${r.case} routed to empty per shouldSkipKoSynAnt)`);
    } else {
      const newSyn = r.new.synonyms ?? [];
      const newAnt = r.new.antonyms ?? [];
      if (newSyn.length > 0) lines.push(`syn: ${newSyn.map((s) => `\`${s}\``).join(", ")}`);
      if (newAnt.length > 0) lines.push(`ant: ${newAnt.map((s) => `\`${s}\``).join(", ")}`);
      if (newSyn.length === 0 && newAnt.length === 0) lines.push(`(empty)`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  const outDir = path.resolve(import.meta.dirname ?? __dirname);
  const jsonPath = path.join(outDir, "ko-synant-audit-2026-05-19.json");
  const mdPath = path.join(outDir, "ko-synant-audit-2026-05-19.md");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(mdPath, lines.join("\n"));
  console.log(``);
  console.log(`Wrote: ${jsonPath}`);
  console.log(`Wrote: ${mdPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
