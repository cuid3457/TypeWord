// Reverse-lookup audit — direct OpenAI calls
// Tests native-lang → study-lang translation across:
//   - common words
//   - polysemy / homonyms (disambiguation)
//   - typos
//   - loanwords
//   - set expressions
//   - numbers / symbols
//   - gender variants (m/f)
//   - sensitive / proper nouns
//
// Run: node --experimental-strip-types --env-file=.env.local
//      scripts/audit/_reverse_lookup_audit.mjs

import { buildReverseLookupSystemPrompt, buildReverseLookupUserPrompt }
  from "../../supabase/functions/_shared/prompts-v3.ts";

const MODEL = "gpt-4.1-mini";

async function call(sys, user, apiKey) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    }),
  });
  const j = await r.json();
  return JSON.parse(j.choices[0]?.message?.content ?? "{}");
}

// Test cases: { from, to, word, expect, category }
const cases = [
  // common — direct translation
  { id: "C1", from: "ko", to: "en", word: "사과", category: "common", expect: "apple" },
  { id: "C2", from: "ko", to: "ja", word: "사과", category: "common", expect: "りんご or 林檎" },
  { id: "C3", from: "ko", to: "es", word: "사과", category: "common", expect: "manzana" },
  { id: "C4", from: "en", to: "ko", word: "apple", category: "common", expect: "사과" },
  { id: "C5", from: "ja", to: "ko", word: "りんご", category: "common", expect: "사과" },
  { id: "C6", from: "en", to: "ja", word: "book", category: "common", expect: "本 (noun) + 予約 (verb)" },
  { id: "C7", from: "en", to: "de", word: "house", category: "common", expect: "Haus (with article context)" },

  // polysemy — multiple candidates with sense hints
  { id: "P1", from: "ko", to: "en", word: "배", category: "polysemy", expect: "pear / ship / belly (3 candidates with KO hints)" },
  { id: "P2", from: "ko", to: "ja", word: "배", category: "polysemy", expect: "梨 / 船 / 腹 (3 candidates)" },
  { id: "P3", from: "ko", to: "en", word: "은행", category: "polysemy", expect: "bank / ginkgo (2 candidates)" },
  { id: "P4", from: "ja", to: "en", word: "橋", category: "common", expect: "bridge" },
  { id: "P5", from: "en", to: "ko", word: "spring", category: "polysemy", expect: "봄 / 용수철 / 샘 (multi-candidate)" },
  { id: "P6", from: "en", to: "ja", word: "bank", category: "polysemy", expect: "銀行 / 川岸 (2 candidates)" },

  // typo
  { id: "T1", from: "ko", to: "en", word: "사괘", category: "typo", expect: "corrected to 사과 → apple" },
  { id: "T2", from: "en", to: "ko", word: "recieve", category: "typo", expect: "corrected to receive → 받다" },
  { id: "T3", from: "en", to: "ja", word: "definately", category: "typo", expect: "corrected → 確かに" },
  { id: "T4", from: "ko", to: "en", word: "은햄", category: "typo", expect: "corrected to 은행 → bank/ginkgo" },

  // set expression
  { id: "S1", from: "ko", to: "en", word: "안녕하세요", category: "set_expr", expect: "Hello" },
  { id: "S2", from: "ko", to: "ja", word: "감사합니다", category: "set_expr", expect: "ありがとうございます" },
  { id: "S3", from: "en", to: "ko", word: "thank you", category: "set_expr", expect: "감사합니다 / 고맙습니다" },
  { id: "S4", from: "ja", to: "en", word: "よろしくお願いします", category: "set_expr", expect: "Nice to meet you / Looking forward..." },

  // gender variants (m/f)
  { id: "G1", from: "ko", to: "es", word: "학생", category: "gender", expect: "estudiante or alumno/alumna" },
  { id: "G2", from: "ko", to: "fr", word: "친구", category: "gender", expect: "ami/amie (both genders)" },
  { id: "G3", from: "en", to: "de", word: "teacher", category: "gender", expect: "Lehrer/Lehrerin (m/f)" },
  { id: "G4", from: "ko", to: "es", word: "여학생", category: "gender", expect: "estudiante (female only) — alumna" },

  // loanword
  { id: "L1", from: "ko", to: "en", word: "커피", category: "loanword", expect: "coffee" },
  { id: "L2", from: "ja", to: "en", word: "マンション", category: "loanword", expect: "condominium NOT mansion" },
  { id: "L3", from: "en", to: "ja", word: "smartphone", category: "loanword", expect: "スマートフォン or スマホ" },

  // proper noun
  { id: "PN1", from: "ko", to: "en", word: "서울", category: "proper", expect: "Seoul" },
  { id: "PN2", from: "en", to: "ko", word: "Tokyo", category: "proper", expect: "도쿄 / 동경" },
  { id: "PN3", from: "en", to: "zh-CN", word: "Beijing", category: "proper", expect: "北京" },

  // numbers / symbols
  { id: "N1", from: "ko", to: "en", word: "42", category: "number", expect: "?? — number passthrough or note" },
  { id: "N2", from: "en", to: "ko", word: "@", category: "symbol", expect: "?? — symbol passthrough" },

  // wrong language / non-word
  { id: "W1", from: "ko", to: "en", word: "hello", category: "wrong_lang", expect: "note=wrong_language" },
  { id: "W2", from: "ko", to: "en", word: "ㅎㅎㅎ", category: "non_word", expect: "note=non_word" },

  // sentence (full clause)
  { id: "SX", from: "ko", to: "en", word: "오늘 날씨가 좋네요", category: "sentence", expect: "note=sentence" },

  // sensitive / cultural
  { id: "K1", from: "ko", to: "ja", word: "독도", category: "cultural", expect: "독도 not 竹島 (Korea-position)" },
  { id: "K2", from: "ko", to: "zh-CN", word: "김치", category: "cultural", expect: "辛奇 not 泡菜" },
];

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) { console.error("OPENAI_API_KEY missing"); process.exit(1); }

console.log(`Reverse-lookup audit: ${cases.length} cases\n`);
const results = [];
for (const c of cases) {
  const sys = buildReverseLookupSystemPrompt(c.from, c.to);
  const user = buildReverseLookupUserPrompt(c.word);
  try {
    const r = await call(sys, user, apiKey);
    const note = r.note ?? "";
    const cands = (r.candidates ?? []).map((x) => `${x.headword}${x.hint ? ` (${x.hint})` : ""}`).join(" | ");
    console.log(`[${c.id}] ${c.from}→${c.to}: "${c.word}" (${c.category})`);
    console.log(`  expected: ${c.expect}`);
    console.log(`  actual: ${note ? `note=${note}` : cands || "(empty)"}`);
    console.log();
    results.push({ id: c.id, from: c.from, to: c.to, word: c.word, category: c.category, expect: c.expect, note, candidates: r.candidates ?? [] });
  } catch (e) {
    console.log(`[${c.id}] ERROR: ${e.message?.slice(0, 100)}`);
    results.push({ id: c.id, from: c.from, to: c.to, word: c.word, error: e.message });
  }
}

import * as fs from "node:fs";
import * as path from "node:path";
const dir = path.resolve(import.meta.dirname ?? __dirname);
fs.writeFileSync(path.join(dir, "reverse-lookup-audit-2026-05-19.json"), JSON.stringify(results, null, 2));
console.log(`\nWrote: reverse-lookup-audit-2026-05-19.json`);
