// Spot-verify the part-2 fixes (G/I/J/K/L):
// G: KO polysemy non-collapse (배 should yield 3 separate meanings to zh/de/it)
// I: JA proper noun anchor (東京 → 東京、都市)
// J: ZH 1984 → en should be "nineteen eighty-four", not digit-by-digit
// K: JA verb_adj 3-meaning cap (かける ≤ 3)
// L: Latin typo of fixed expressions accepted (merci beacoup → meanings emitted)

import {
  classifyKoInput, buildKoSpecializedSystemPrompt, buildKoSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-ko.ts";
import {
  classifyJaInput, buildJaSpecializedSystemPrompt, buildJaSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-ja.ts";
import {
  classifyZhInput, buildZhSpecializedSystemPrompt, buildZhSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-zh.ts";
import {
  classifyLatinInput, buildLatinSpecializedSystemPrompt, buildLatinSpecializedUserPrompt,
} from "../../supabase/functions/_shared/prompts-v3-latin.ts";

const MODEL = "gpt-4.1-mini";

async function callOpenAi(sys, user, apiKey) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
  const j = await resp.json();
  return JSON.parse(j.choices[0]?.message?.content ?? "{}");
}

const tests = [
  // G: KO polysemy
  { id: "G1", src: "ko", word: "배", tgt: "zh-CN", expect: "3 meanings" },
  { id: "G2", src: "ko", word: "배", tgt: "de", expect: "3 meanings" },
  { id: "G3", src: "ko", word: "다리", tgt: "fr", expect: "2 meanings" },
  // I: JA proper noun
  { id: "I1", src: "ja", word: "東京", tgt: "en", expect: "東京、都市" },
  { id: "I2", src: "ja", word: "日本", tgt: "es", expect: "日本、国" },
  { id: "I3", src: "ja", word: "東京", tgt: "fr", expect: "東京、都市" },
  // J: ZH 1984
  { id: "J1", src: "zh-CN", word: "1984", tgt: "en", expect: "nineteen eighty-four" },
  { id: "J2", src: "zh-CN", word: "1984", tgt: "es", expect: "mil novecientos ochenta y cuatro" },
  // K: JA かける cap
  { id: "K1", src: "ja", word: "かける", tgt: "en", expect: "≤ 3 meanings, no note=sentence" },
  // L: Latin typo
  { id: "L1", src: "fr", word: "merci beacoup", tgt: "en", expect: "corrected + meanings emit, no note=sentence" },
  { id: "L2", src: "fr", word: "comment alle vous", tgt: "en", expect: "corrected + meanings emit" },
  { id: "L3", src: "de", word: "guten morgan", tgt: "en", expect: "corrected + meanings emit" },
];

const apiKey = process.env.OPENAI_API_KEY;
console.log(`Spot-verify part 2: ${tests.length} cases\n`);

for (const t of tests) {
  let sys, user;
  const req = { word: t.word, sourceLang: t.src, targetLang: t.tgt };
  if (t.src === "ko") {
    const c = classifyKoInput(t.word);
    sys = buildKoSpecializedSystemPrompt(c, t.tgt);
    user = buildKoSpecializedUserPrompt(req, c);
  } else if (t.src === "ja") {
    const c = classifyJaInput(t.word);
    sys = buildJaSpecializedSystemPrompt(c, t.tgt);
    user = buildJaSpecializedUserPrompt(req, c);
  } else if (t.src === "zh-CN") {
    const c = classifyZhInput(t.word);
    sys = buildZhSpecializedSystemPrompt(c, t.tgt);
    user = buildZhSpecializedUserPrompt(req, c);
  } else {
    const c = classifyLatinInput(t.word, t.src);
    sys = buildLatinSpecializedSystemPrompt(c, t.src, t.tgt);
    user = buildLatinSpecializedUserPrompt(req, c);
  }
  const r = await callOpenAi(sys, user, apiKey);
  const head = r.headword ?? "—";
  const note = r.note ?? "";
  const cnt = (r.meanings ?? []).length;
  const cans = (r.meanings ?? []).map((m) => `(${m.partOfSpeech}) ${m.definition}`).join(" | ");
  const trans = (r.meanings_translated ?? []).map((m) => `(${m.partOfSpeech}) ${m.definition}`).join(" | ");
  console.log(`[${t.id}] ${t.src} → ${t.tgt}: "${t.word}" expected: ${t.expect}`);
  console.log(`  headword="${head}" note="${note}" meanings=${cnt}`);
  console.log(`  canonical: ${cans}`);
  console.log(`  translated: ${trans}`);
  console.log(``);
}
