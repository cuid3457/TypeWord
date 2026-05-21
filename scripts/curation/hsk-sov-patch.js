/**
 * HSK 1/2 Korean SOV regression patch.
 * The difficulty re-curation introduced 11 entries with English-order Korean
 * (verb-first instead of verb-final). This patch reorders the affected
 * examples back to natural SOV.
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Each patch identifies the entry and rewrites specific example translations.
const patches = [
  // ── HSK 1 ──────────────────────────────────────────────────────────────
  { slug: 'hsk-1', word: '住', mut: (r) => {
    r.examples[0].translation = '나는 베이징에 **산다**.';
  }},
  { slug: 'hsk-1', word: '去', mut: (r) => {
    r.examples[0].translation = '나는 오늘 학교에 **갑니다**.';
    r.examples[2].translation = '그들은 과일을 사러 시장에 **갑니다**.';
  }},
  { slug: 'hsk-1', word: '在', mut: (r) => {
    r.examples[0].translation = '그는 지금 학교에 **있어요**.';
  }},
  { slug: 'hsk-1', word: '学习', mut: (r) => {
    r.examples[0].translation = '나는 매일 중국어를 **공부한다**.';
  }},
  { slug: 'hsk-1', word: '是', mut: (r) => {
    // 이다 as separate word doesn't work in Korean; copula attaches to noun.
    r.examples[0].translation = '그녀는 선생**님입니다**.';
  }},

  // ── HSK 2 ──────────────────────────────────────────────────────────────
  { slug: 'hsk-2', word: '得', readingMatch: (r) => r.examples[2]?.translation?.includes('1등'), mut: (r) => {
    r.examples[2].translation = '그는 마침내 1등을 **했다**.';
  }},
  { slug: 'hsk-2', word: '进', mut: (r) => {
    r.examples[0].translation = '그는 매일 8시에 정확히 사무실에 **들어갑니다**.';
  }},
  { slug: 'hsk-2', word: '踢', mut: (r) => {
    r.examples[0].translation = '그는 힘껏 축구공을 **찼어요**.';
  }},
  { slug: 'hsk-2', word: '找', mut: (r) => {
    r.examples[1].translation = '그는 시장에 가서 신선한 과일을 **찾아요**.';
  }},
  { slug: 'hsk-2', word: '正在', mut: (r) => {
    // Aspect marker placeholder "~하고 있다" doesn't belong as the bolded
    // span of an example sentence — mark the actual conjugated form.
    r.examples[0].translation = '나는 밥을 **먹고 있어요**.';
    r.examples[1].translation = '그는 숙제를 **하고 있어요**.';
    r.examples[2].translation = '우리는 영화를 **보고 있어요**.';
  }},
];

async function main() {
  for (const p of patches) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', p.slug).single();
    const { data: rows } = await admin.from('curated_words')
      .select('reading_key, results_by_target_lang')
      .eq('curated_wordlist_id', list.id).eq('word', p.word);
    if (!rows || rows.length === 0) { console.log(`  ✗ [${p.slug}] ${p.word}: not found`); continue; }
    // If polysemy match function provided, filter to the right reading.
    const candidates = p.readingMatch
      ? rows.filter((r) => p.readingMatch(r.results_by_target_lang.ko))
      : rows;
    if (candidates.length === 0) { console.log(`  ✗ [${p.slug}] ${p.word}: no reading matches`); continue; }
    for (const row of candidates) {
      const updated = JSON.parse(JSON.stringify(row.results_by_target_lang));
      p.mut(updated.ko);
      const { error } = await admin.from('curated_words')
        .update({ results_by_target_lang: updated })
        .eq('curated_wordlist_id', list.id).eq('word', p.word).eq('reading_key', row.reading_key);
      if (error) console.log(`  ✗ [${p.slug}] ${p.word}: ${error.message}`);
      else console.log(`  ✓ [${p.slug}] ${p.word} (rk='${row.reading_key}')`);
    }
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
