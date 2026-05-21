// Phase 7: TOPIK 1+2 전수 v3 재처리 + 큐레이션 정제.
//
// Step 1: 모든 1,800 단어 forceFresh enrich (canonical + en 번역 + examples).
// Step 2: note='non_word' 응답 단어 식별 → curated_words에서 제외.
// Step 3: 나머지는 v3 quality로 results_by_target_lang.en 갱신.
//
// 다른 6개 lang (ja/zh/es/fr/de/it)은 다음 phase에서.
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUGS = [
  'topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3',
  'topik-2-part-1', 'topik-2-part-2', 'topik-2-part-3',
];

async function processOne(slug, word, listMeta) {
  const proficiencyHint = deriveProficiencyHint(listMeta);
  try {
    const { data, error } = await admin.functions.invoke('word-lookup-v2', {
      body: {
        word, sourceLang: 'ko', targetLang: 'en', mode: 'enrich',
        proficiencyHint, forceFresh: true,
      },
    });
    if (error) throw new Error(error.message);
    const result = data?.result;
    if (!result) return { status: 'NO_RESULT' };
    if (result.note) return { status: 'NON_WORD', note: result.note };

    const meaningCount = (result.meanings || []).length;
    const exampleCount = (result.examples || []).length;
    if (meaningCount === 0) return { status: 'EMPTY_MEANINGS' };

    // Save to curated_words.results_by_target_lang.en
    const { data: row } = await admin.from('curated_words')
      .select('reading_key, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', listMeta.id).eq('word', word).single();
    if (!row) return { status: 'ROW_MISSING' };
    const newResults = { ...(row.results_by_target_lang || {}), en: result };
    await admin.from('curated_words').upsert({
      curated_wordlist_id: listMeta.id, word,
      reading_key: row.reading_key ?? '', display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    return { status: 'OK', meaningCount, exampleCount };
  } catch (e) {
    return { status: 'ERROR', error: e.message };
  }
}

// Concurrent worker pool — process N words in parallel per slug.
async function processSlug(slug, list, words, concurrency = 12) {
  let idx = 0, ok = 0, nw = 0, er = 0;
  const nonWords = [], errors = [];
  const total = words.length;
  async function worker() {
    while (true) {
      const my = idx++;
      if (my >= words.length) return;
      const word = words[my];
      const r = await processOne(slug, word, list);
      if (r.status === 'OK') {
        ok++;
        if (my % 30 === 0) console.log(`  [${my+1}/${total}] ${word} ✓ ${r.meaningCount}m/${r.exampleCount}e`);
      } else if (r.status === 'NON_WORD' || r.status === 'EMPTY_MEANINGS') {
        nw++; nonWords.push({ slug, word, status: r.status, note: r.note });
        console.log(`  [${my+1}/${total}] ${word} ✗ ${r.status} (${r.note ?? ''})`);
      } else {
        er++; errors.push({ slug, word, status: r.status, error: r.error });
        console.log(`  [${my+1}/${total}] ${word} ! ${(r.error||'').slice(0,60)}`);
      }
    }
  }
  const pool = Array.from({ length: concurrency }, () => worker());
  await Promise.all(pool);
  return { ok, nw, er, nonWords, errors };
}

(async () => {
  const summary = {};
  const nonWords = [];
  const errors = [];
  let totalOk = 0, totalNonWord = 0, totalErr = 0;
  for (const slug of SLUGS) {
    const { data: list } = await admin.from('curated_wordlists')
      .select('id, slug, source_lang, exam_type, level').eq('slug', slug).single();
    if (!list) continue;
    const { data: rows } = await admin.from('curated_words')
      .select('word').eq('curated_wordlist_id', list.id).order('display_order');
    const words = (rows || []).map(r => r.word);
    console.log(`\n══ ${slug} (${words.length} words, concurrency=12) ══`);
    const r = await processSlug(slug, list, words, 12);
    totalOk += r.ok; totalNonWord += r.nw; totalErr += r.er;
    nonWords.push(...r.nonWords); errors.push(...r.errors);
    summary[slug] = { total: words.length, ok: r.ok, nw: r.nw, er: r.er };
  }

  console.log('\n\n══ SUMMARY ══');
  console.log('Slug                  | total | OK    | NonWord | Error');
  console.log('-'.repeat(60));
  for (const [slug, s] of Object.entries(summary)) {
    console.log(`${slug.padEnd(20)} | ${String(s.total).padStart(5)} | ${String(s.ok).padStart(5)} | ${String(s.nw).padStart(7)} | ${String(s.er).padStart(5)}`);
  }
  console.log(`TOTAL: ${totalOk} OK / ${totalNonWord} non-word / ${totalErr} error`);

  fs.writeFileSync(path.resolve(__dirname, 'phase7-results.json'), JSON.stringify({ summary, nonWords, errors }, null, 2));
  console.log(`\n→ scripts/curation/phase7-results.json`);
  console.log(`\nNonWord 단어 ${nonWords.length}건 — 큐레이션에서 제외 후보`);
})().catch(e => { console.error(e); process.exit(1); });
