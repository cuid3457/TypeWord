// Generate 300 NEW TOEIC 800-target business-English words for part 3.
// Excludes all words already in toeic-600-* and toeic-800-1/2 so part 3
// adds genuinely new vocabulary at the 800-level tier (CEFR B2~C1, upper-
// intermediate to advanced business English).
//
// Output: /tmp/toeic800-part3.json (300 words flat — caller wraps in spec)
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY missing');

const { createClient } = require('@supabase/supabase-js');
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const norm = (w) => String(w).trim().toLowerCase();

async function fetchExisting() {
  const slugs = [
    'toeic-600-part-1', 'toeic-600-part-2', 'toeic-600-part-3',
    'toeic-800', 'toeic-800-1', 'toeic-800-2',
  ];
  const set = new Set();
  for (const slug of slugs) {
    const { data: list } = await admin
      .from('curated_wordlists').select('id').eq('slug', slug).maybeSingle();
    if (!list) continue;
    const { data } = await admin
      .from('curated_words').select('word').eq('curated_wordlist_id', list.id);
    for (const r of (data || [])) set.add(norm(r.word));
  }
  return set;
}

const SYS = `You are an English lexicographer specializing in TOEIC test preparation.

Produce NEW English words/short phrases at TOEIC 800-target difficulty (CEFR B2~C1, upper-intermediate to lower-advanced business English), EXCLUDED from the provided list.

STRICT RULES:
1. Canonical form only: verb infinitive (no "to"), noun singular without article, adjective base form.
2. Common business-English collocations of 2-3 words are OK ("hostile takeover", "due diligence", "exit strategy") but ONLY when truly fixed expressions.
3. Heavy focus on TOEIC business contexts at the 800 tier: corporate finance, M&A, legal contracts, regulatory compliance, strategy, executive operations, capital markets, supply chain, advanced HR (performance/compensation), product management, B2B sales, advanced marketing, risk management.
4. NO proper nouns, NO vulgarities, NO neologisms. NO words below TOEIC 700 difficulty (avoid trivial words like "meeting", "office", "boss"). NO archaic / literary words that don't appear in business contexts ("ephemeral", "ubiquitous" only OK if business-relevant).
5. Each entry must be a real, dictionary-attested word in standard business English usage.
6. Distribute across business domains — don't concentrate in one area.`;

const DOMAINS = `Business domains to cover with rough balance:
- Corporate finance / capital structure / cash flow / capital expenditure
- M&A / due diligence / acquisitions / divestitures / mergers
- Legal & contracts / liability / indemnity / breach / clauses
- Compliance & regulation / governance / audit / SOX-style controls
- Strategy / competitive positioning / market entry / pivots
- Executive operations / leadership / succession / boardroom
- Capital markets / IPO / bonds / equities / valuation
- Supply chain / logistics at scale / procurement / vendor management
- Advanced HR / compensation / performance review / retention / talent acquisition
- Product management / roadmap / lifecycle / launch
- B2B sales / enterprise deals / pipelines / quotas
- Advanced marketing / brand equity / positioning / campaign analytics
- Risk management / mitigation / hedging / contingency
- Operations / efficiency / process improvement / KPIs`;

async function gen(exclude, n) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.6,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: `${DOMAINS}\n\nEXCLUSION LIST (${exclude.length} words — never reuse, case-insensitive):\n${exclude.join(', ')}\n\nProduce ${n} new TOEIC 800-target business English words.\n\nOutput JSON: {"words": [...]} — exactly ${n} entries.` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content).words || [];
}

(async () => {
  const target = 300;
  const baseExclude = [...await fetchExisting()];
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

  fs.writeFileSync('/tmp/toeic800-part3.json', JSON.stringify({ words: out }, null, 2));
  console.log(`\nSaved ${out.length} words to /tmp/toeic800-part3.json`);
  console.log('Sample first 20:', out.slice(0, 20).join(', '));
  console.log('Sample last 10:', out.slice(-10).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
