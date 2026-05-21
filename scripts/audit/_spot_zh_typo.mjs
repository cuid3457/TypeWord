import { classifyZhInput, buildZhSpecializedSystemPrompt, buildZhSpecializedUserPrompt } from "../../supabase/functions/_shared/prompts-v3-zh.ts";

const MODEL = "gpt-4.1-mini";
async function call(sys, user, apiKey) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, temperature: 0.3, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }),
  });
  const j = await r.json();
  return JSON.parse(j.choices[0]?.message?.content ?? "{}");
}

const tests = [
  { word: "你号", tgt: "en", expect: "corrected to 你好 (greeting)" },
  { word: "你号", tgt: "ja", expect: "corrected to 你好" },
  { word: "你号", tgt: "es", expect: "corrected to 你好" },
  { word: "謝謝", tgt: "en", expect: "Traditional → 谢谢 (thanks)" },
  { word: "對不起", tgt: "en", expect: "Traditional → 对不起 (sorry)" },
];

const apiKey = process.env.OPENAI_API_KEY;
for (const t of tests) {
  const c = classifyZhInput(t.word);
  const sys = buildZhSpecializedSystemPrompt(c, t.tgt);
  const user = buildZhSpecializedUserPrompt({ word: t.word, sourceLang: "zh-CN", targetLang: t.tgt }, c);
  const r = await call(sys, user, apiKey);
  console.log(`zh-CN → ${t.tgt}: "${t.word}" (expected: ${t.expect})`);
  console.log(`  headword="${r.headword}" note="${r.note ?? ''}" case=${c}`);
  for (const m of (r.meanings ?? [])) {
    console.log(`  (${m.partOfSpeech}) ${m.definition}`);
  }
  console.log();
}
