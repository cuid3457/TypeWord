// Spot-verify the fixes applied 2026-05-19 (late evening):
//   A. KO_NUMBER_SYMBOL headword surface invariant + 수사 POS
//   B. JA register tag native to target
//   C. stitch.ts POS_ALIASES expansion (German verb/adj/etc.)
//   F. KO forbidden POS leak in definition
//
// Direct OpenAI calls — same as comprehensive audit but small sample.

import { translatePos } from "../../supabase/functions/_shared/stitch.ts";
import { POS_BY_LANG } from "../../supabase/functions/_shared/prompts-v3.ts";
import {
  classifyKoInput, buildKoSpecializedSystemPrompt, buildKoSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-ko.ts";
import {
  classifyJaInput, buildJaSpecializedSystemPrompt, buildJaSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-ja.ts";

const MODEL = "gpt-4.1-mini";

async function callOpenAi(systemPrompt, userPrompt, apiKey) {
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
  const j = await resp.json();
  return JSON.parse(j.choices[0]?.message?.content ?? "{}");
}

const tests = [
  // Issue A+B verify: KO number_symbol with target=en/de/ja
  { src: "ko", word: "42", tgt: "en" },
  { src: "ko", word: "42", tgt: "de" },
  { src: "ko", word: "42", tgt: "ja" },
  { src: "ko", word: "1984", tgt: "en" },
  { src: "ko", word: "1984", tgt: "de" },
  { src: "ko", word: "3.14", tgt: "en" },
  { src: "ko", word: "@", tgt: "ja" },
  // Issue F verify: KO simple_word definition no POS leak
  { src: "ko", word: "학굣", tgt: "en" },
  { src: "ko", word: "학굣", tgt: "es" },
  // Issue C verify: JA register tag native to target
  { src: "ja", word: "おはようございます", tgt: "es" },
  { src: "ja", word: "おはようございます", tgt: "fr" },
  { src: "ja", word: "おはようございます", tgt: "de" },
  { src: "ja", word: "よろしくお願いします", tgt: "en" },
];

const apiKey = process.env.OPENAI_API_KEY;
console.log(`Spot-verify ${tests.length} cases after fixes\n`);

for (const t of tests) {
  let sys, user;
  if (t.src === "ko") {
    const c = classifyKoInput(t.word);
    sys = buildKoSpecializedSystemPrompt(c, t.tgt);
    user = buildKoSpecializedUserPrompt({ word: t.word, sourceLang: t.src, targetLang: t.tgt }, c);
  } else if (t.src === "ja") {
    const c = classifyJaInput(t.word);
    sys = buildJaSpecializedSystemPrompt(c, t.tgt);
    user = buildJaSpecializedUserPrompt({ word: t.word, sourceLang: t.src, targetLang: t.tgt }, c);
  }
  const result = await callOpenAi(sys, user, apiKey);

  const head = result.headword ?? "—";
  const meanings = (result.meanings ?? []).map((m) => `(${m.partOfSpeech}) ${m.definition}`).join(" | ");
  const trans = (result.meanings_translated ?? []).map((m) => {
    const stitched = translatePos(m.partOfSpeech, t.tgt);
    return `(${m.partOfSpeech} → stitched: ${stitched}) ${m.definition}`;
  }).join(" | ");

  console.log(`${t.src} → ${t.tgt}: "${t.word}"`);
  console.log(`  headword: "${head}" ${head === t.word ? "✓ surface preserved" : "✗ surface lost"}`);
  console.log(`  canonical: ${meanings}`);
  console.log(`  translated: ${trans}`);
  console.log(``);
}
