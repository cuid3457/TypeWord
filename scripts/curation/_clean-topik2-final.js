// Final clean pass on /tmp/topik2-words-final.json:
//   - Drops phrases (any word with whitespace)
//   - Drops X+generic_suffix for additional generic stems
//   - Drops specific known-bad compositions
//   - Regenerates the deficit
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const STAGE2_FAB_SUFFIXES = new Set([
  '사진', '모임', '행사', '여행', '관계', '문', '말', '상품', '평',
  '명', '주인', '내용', '대화', '소식', '안내문',
]);

const STAGE2_DROP = new Set([
  '특가세일', '이벤트상품', '초대문', '거절문', '부탁말', '거절당하다',
  '가족사진', '가족모임', '가족행사', '가족여행', '가족관계',
  '친구관계', '동료관계', '이웃집', '이웃동네', '이웃사촌',
  '부부싸움', '부부동반', '부부생활',
  '상품권', '상품명', '상품평', '구매자', '소비자', '가게주인',
  '점포', '점장', '도움말', '점원',
]);

const STAGE2_KEEP = new Set([
  // Don't lose these to the suffix-based rule
  '소비자', '회의록', '사원증', '명함', '업무량',
]);

async function fetchTopik1() {
  const set = new Set();
  for (const slug of ['topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3']) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).maybeSingle();
    if (!list) continue;
    const { data } = await admin.from('curated_words').select('word').eq('curated_wordlist_id', list.id);
    for (const r of (data || [])) set.add(String(r.word).trim());
  }
  return set;
}

function isFab(w, allSet) {
  if (STAGE2_KEEP.has(w)) return false;
  if (STAGE2_DROP.has(w)) return true;
  if (/\s/.test(w)) return true; // phrase
  for (let i = 2; i <= w.length - 1; i++) {
    const px = w.slice(0, i), sx = w.slice(i);
    if (allSet.has(px) && STAGE2_FAB_SUFFIXES.has(sx)) return true;
  }
  return false;
}

const SYS = `Korean lexicographer for TOPIK 2급. Produce real dictionary-attested Korean words (표준국어대사전 or 우리말샘 표제어).

ABSOLUTE RULES:
1. Canonical dictionary form (-다 for verb/adj, bare noun, bare adverb).
2. No spaced phrases (only single lexical units that appear as one headword).
3. No mechanically-grafted compounds (X+사진/모임/행사/여행/관계/문/말/평/명 are almost always fabricated unless dictionary-attested).
4. No more than 2 distinct words sharing the same stem in your output.
5. CEFR A2 level — beyond basic 1급 survival vocabulary but not yet 3급 abstract.
6. Each entry must pass: "if I look this up in 우리말샘, will it return a definition page?"

Output exactly the requested count.`;

async function gen(exclude, n, attempt) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.4,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: `[EXCLUSION LIST — ${exclude.length} words]:\n${exclude.join(', ')}\n\nAttempt ${attempt}: Produce ${n} new TOPIK 2급 Korean words. Cover real daily/school/work/health/emotion/travel/shopping vocabulary at A2. Diverse stems.\n\nJSON: {"words": [...]}` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return JSON.parse((await resp.json()).choices[0].message.content).words || [];
}

(async () => {
  const current = JSON.parse(fs.readFileSync('/tmp/topik2-words-final.json', 'utf8')).words;
  const topik1 = await fetchTopik1();
  const curSet = new Set(current);

  const kept = current.filter((w) => !isFab(w, curSet));
  const dropped = current.filter((w) => isFab(w, curSet));
  console.log(`Stage 2 filter: ${current.length} → ${kept.length} (dropped ${dropped.length})`);
  console.log('Dropped samples:', dropped.slice(0, 20).join(', '));

  const need = 900 - kept.length;
  if (need <= 0) {
    fs.writeFileSync('/tmp/topik2-words-final.json', JSON.stringify({ words: kept.slice(0, 900) }, null, 2));
    console.log(`Final ${kept.length} → trimmed to 900`);
    return;
  }
  console.log(`\nBackfill needed: ${need} words`);

  const exclude = new Set([...kept, ...topik1, ...dropped]);
  const newOnes = [];
  let attempts = 0;
  while (newOnes.length < need && attempts < 6) {
    attempts++;
    const reqN = Math.max(need * 3, 60);
    console.log(`backfill attempt ${attempts}: have ${newOnes.length}/${need}, requesting ${reqN}`);
    const batch = await gen([...exclude, ...newOnes], reqN, attempts);
    let added = 0;
    for (const raw of batch) {
      const w = String(raw).trim();
      if (!w || !/\p{Script=Hangul}/u.test(w) || exclude.has(w) || newOnes.includes(w)) continue;
      // Apply fab check too
      const combo = new Set([...exclude, ...newOnes]);
      if (isFab(w, combo)) continue;
      newOnes.push(w);
      added++;
      if (newOnes.length >= need) break;
    }
    console.log(`  +${added} → ${newOnes.length}`);
    if (added === 0) break;
  }

  const final = [...kept, ...newOnes].slice(0, 900);
  fs.writeFileSync('/tmp/topik2-words-final.json', JSON.stringify({ words: final }, null, 2));
  console.log(`\n✓ Final: ${final.length} words`);
  console.log(`Backfill sample: ${newOnes.slice(0, 30).join(', ')}`);
})().catch(e => { console.error(e); process.exit(1); });
