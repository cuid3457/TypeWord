// Probe krdict for a Korean word — replicates the exact API call v4 uses.
// Usage:  node scripts/_diag-krdict.js "야속하다"
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const KEY = process.env.KRDICT_API_KEY;
if (!KEY) {
  // Fall back to fetching from supabase secrets via service role? Not trivial
  // from here — instruct user.
  console.error('KRDICT_API_KEY missing in .env.local. Try `supabase secrets list` and copy KRDICT_API_KEY into .env.local for this probe.');
  process.exit(1);
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Referer: 'https://krdict.korean.go.kr/', Accept: '*/*' };

async function probe(word) {
  const url =
    `https://krdict.korean.go.kr/api/search?key=${KEY}&q=${encodeURIComponent(word)}` +
    `&part=word&num=10&advanced=y&method=exact&translated=y&trans_lang=1`;
  console.log(`\n--- query: "${word}" ---`);
  console.log(`URL: ${url.replace(KEY, '<KEY>')}`);
  const res = await fetch(url, { headers: HEADERS });
  console.log(`HTTP ${res.status}`);
  const xml = await res.text();
  // Quick stats
  const itemCount = (xml.match(/<item>/g) ?? []).length;
  console.log(`<item> count: ${itemCount}`);
  if (itemCount === 0) {
    // Show a chunk of the response to see error
    console.log('--- response (first 800 chars) ---');
    console.log(xml.slice(0, 800));
    console.log('--- end ---');
    return;
  }
  // Print headwords + senses
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const it of items.slice(0, 5)) {
    const w = (it.match(/<word>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/word>/) ?? [])[1] || '?';
    const pos = (it.match(/<pos>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/pos>/) ?? [])[1] || '';
    const senseDefs = it.match(/<definition>(?:<!\[CDATA\[([\s\S]*?)\]\]>)?<\/definition>/g) ?? [];
    console.log(`  word="${w}" pos="${pos}" senses=${senseDefs.length}`);
    for (const sd of senseDefs.slice(0, 3)) {
      const def = (sd.match(/<definition>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/definition>/) ?? [])[1] || '';
      console.log(`    - ${def.slice(0, 80)}`);
    }
  }
}

(async () => {
  for (const w of process.argv.slice(2)) {
    try { await probe(w); } catch (e) { console.error(e.message); }
  }
})();
