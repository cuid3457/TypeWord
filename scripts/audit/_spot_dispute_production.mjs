// Spot-test dispute rewrite in production by invoking the deployed
// word-lookup-v2 edge function with `translate: false` (forward lookup
// path). Uses service-role key to bypass user auth.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function lookup(word, sourceLang, targetLang) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ word, sourceLang, targetLang, forceFresh: true }),
  });
  if (!resp.ok) {
    return { error: `HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
  }
  const j = await resp.json();
  return j;
}

const cases = [
  { word: "김치", src: "ko", tgt: "zh-CN", expect: "辛奇 (NOT 泡菜)" },
  { word: "동해", src: "ko", tgt: "ja", expect: "東海 (NOT 日本海)" },
  { word: "독도", src: "ko", tgt: "ja", expect: "独島 (NOT 竹島)" },
  { word: "한복", src: "ko", tgt: "zh-CN", expect: "韩服 (NOT 朝鲜族服装)" },
  { word: "日本海", src: "ja", tgt: "ko", expect: "동해 framing" },
  { word: "Holocaust", src: "en", tgt: "ko", expect: "neutral encyclopedic" },
];

for (const c of cases) {
  const r = await lookup(c.word, c.src, c.tgt);
  console.log(`${c.src}→${c.tgt}: "${c.word}" (expect: ${c.expect})`);
  if (r.error) { console.log(`  ERR: ${r.error}`); console.log(); continue; }
  const result = r.result;
  console.log(`  note: ${result?.note ?? "(none)"}`);
  console.log(`  headword: ${result?.headword ?? "?"}`);
  for (const m of (result?.meanings ?? [])) {
    console.log(`  → (${m.partOfSpeech}) ${m.definition}`);
  }
  console.log();
}
