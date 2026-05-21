// Generate 600 NEW TOEIC 600-target business-English words, distributed
// across two 300-word parts. Excludes existing TOEIC 600 + TOEIC 800
// wordlists so we don't duplicate either level.
//
// Output: /tmp/toeic600-new.json (600 words flat — caller splits 300/300)
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY missing');

const existing = require('/tmp/toeic-existing.json');
const norm = (w) => String(w).trim().toLowerCase();

const SYS = `You are an English lexicographer specializing in TOEIC test preparation.

Produce NEW English words/short phrases at TOEIC 600-target difficulty (CEFR ~B1, intermediate business English), EXCLUDED from the provided list.

STRICT RULES:
1. Canonical form only: verb infinitive (no "to"), noun singular without article, adjective base form.
2. Common business-English collocations of 2-3 words are OK ("business trip", "press release", "due date") but ONLY when truly fixed expressions.
3. Heavy focus on business contexts present in TOEIC: office, meetings, email, schedule, marketing, HR, finance, contracts, customer service, travel-for-business, manufacturing/logistics, retail.
4. NO proper nouns, NO vulgarities, NO neologisms, NO words above TOEIC 700+ difficulty (avoid words like "ubiquitous", "synergize").
5. Each entry must be a real, dictionary-attested word.
6. Distribute across business domains — don't concentrate in one area.

Output JSON: {"words": [...]} — exactly N entries.`;

const DOMAINS = `Business domains to cover with rough balance:
- Office routines (workspace items, daily tasks)
- Meetings / agendas / minutes
- Email / phone / written communication
- Marketing / advertising / promotion
- HR / recruitment / training
- Finance / accounting / budgets
- Contracts / agreements / legal basics
- Customer service / sales
- Travel for business / accommodations
- Logistics / shipping / inventory
- Manufacturing / production basics
- Retail / e-commerce
- Schedule / deadlines / time management
- Technology in office (software, hardware, tools)`;

async function gen(exclude, n) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.6,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: `${DOMAINS}\n\nEXCLUSION LIST (${exclude.length} words — never reuse, case-insensitive):\n${exclude.join(', ')}\n\nProduce ${n} new TOEIC 600-target business English words.` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content).words || [];
}

(async () => {
  const target = 600;
  const baseExclude = [...new Set([...existing['toeic-600'], ...existing['toeic-800']].map(norm))];
  console.log('Base exclusion:', baseExclude.length, 'unique words');

  const seen = new Set();
  const out = [];
  let attempts = 0;

  while (out.length < target && attempts < 10) {
    attempts++;
    const need = target - out.length;
    const reqN = Math.max(need * 2, 100);
    const exclude = [...baseExclude, ...Array.from(seen)];
    console.log(`attempt ${attempts}: have ${out.length}/${target}, requesting ${reqN}, excluding ${exclude.length}`);
    const batch = await gen(exclude, reqN);
    const exSet = new Set(exclude);
    let added = 0;
    for (const w of batch) {
      const k = norm(w);
      if (seen.has(k) || exSet.has(k)) continue;
      seen.add(k);
      out.push(String(w).trim());
      added++;
      if (out.length >= target) break;
    }
    console.log(`  +${added} → ${out.length}`);
    if (added === 0) break;
  }

  fs.writeFileSync('/tmp/toeic600-new.json', JSON.stringify({ words: out }, null, 2));
  console.log(`\nSaved ${out.length} words to /tmp/toeic600-new.json`);
  console.log('Sample first 20:', out.slice(0, 20).join(', '));
  console.log('Sample last 10:', out.slice(-10).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
