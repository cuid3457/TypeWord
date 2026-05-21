// Count all user_words across all users + unique (word, source_lang, target_lang).
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Total rows
const { count: total } = await c.from('user_words').select('id', { count: 'exact', head: true });
console.log(`Total user_words rows: ${total}`);

// Unique (word, book_id) → fetch with book join to get source/target_lang
// Use paginated fetch (PostgREST max 1000 per page).
let all = [];
let from = 0;
while (true) {
  const { data, error } = await c
    .from('user_words')
    .select('word, book_id, books!inner(source_lang, target_lang)')
    .order('id', { ascending: true })
    .range(from, from + 999);
  if (error) { console.error(error); break; }
  if (!data || data.length === 0) break;
  all = all.concat(data);
  if (data.length < 1000) break;
  from += 1000;
}

// Dedup by (word, source_lang, target_lang)
const tuples = new Set();
const perLangPair = new Map();
for (const w of all) {
  const src = w.books?.source_lang;
  const tgt = w.books?.target_lang;
  if (!src) continue;
  const tgtKey = tgt ?? '?';
  tuples.add(`${w.word}|${src}|${tgtKey}`);
  const k = `${src}→${tgtKey}`;
  perLangPair.set(k, (perLangPair.get(k) || 0) + 1);
}

console.log(`Unique (word, src, tgt) tuples: ${tuples.size}`);
console.log(`\nPer (source→target) language pair:`);
const sorted = [...perLangPair.entries()].sort((a,b)=>b[1]-a[1]);
for (const [k, v] of sorted) console.log(`  ${k}: ${v}`);

// Estimate
const seconds_per_word = 2.5; // conservative for per-meaning enrich
const concurrency = 5;
const eta_min = Math.ceil((tuples.size * seconds_per_word) / concurrency / 60);
const cost_per_word = 0.001; // ~$0.001 per lookup (canonical + translate + enrich)
const cost = (tuples.size * cost_per_word).toFixed(2);
console.log(`\nEstimate at concurrency=${concurrency}: ~${eta_min} min, ~$${cost}`);
