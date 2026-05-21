// Phase 7 multi-lang: TOPIK 1+2 1,800 단어 × 7 target lang 전수 재처리.
// Canonical은 첫 lang 처리 시 1회만 v3 생성됨 (forceFresh).
// 다른 lang은 forceFreshTranslation 으로 번역만 갱신.
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
const TARGET_LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

async function processOne(word, listMeta, targetLang, isFirstLang) {
  const proficiencyHint = deriveProficiencyHint(listMeta);
  try {
    const body = {
      word, sourceLang: 'ko', targetLang, mode: 'enrich',
      proficiencyHint,
    };
    if (isFirstLang) body.forceFresh = true;
    else body.forceFreshTranslation = true;

    const { data, error } = await admin.functions.invoke('word-lookup-v2', { body });
    if (error) throw new Error(error.message);
    const result = data?.result;
    if (!result) return { status: 'NO_RESULT' };
    if (result.note) return { status: 'NON_WORD', note: result.note };

    // Save to curated_words.results_by_target_lang[targetLang]
    const { data: row } = await admin.from('curated_words')
      .select('reading_key, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', listMeta.id).eq('word', word).single();
    if (!row) return { status: 'ROW_MISSING' };
    const newResults = { ...(row.results_by_target_lang || {}), [targetLang]: result };
    await admin.from('curated_words').upsert({
      curated_wordlist_id: listMeta.id, word,
      reading_key: row.reading_key ?? '', display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    return { status: 'OK' };
  } catch (e) {
    return { status: 'ERROR', error: e.message };
  }
}

async function processSlugLang(slug, listMeta, words, targetLang, isFirstLang, concurrency = 12) {
  let idx = 0, ok = 0, nw = 0, er = 0;
  const total = words.length;
  async function worker() {
    while (true) {
      const my = idx++;
      if (my >= words.length) return;
      const word = words[my];
      const r = await processOne(word, listMeta, targetLang, isFirstLang);
      if (r.status === 'OK') {
        ok++;
        if (my % 50 === 0) console.log(`  [${targetLang} ${my+1}/${total}] ${word} ✓`);
      } else if (r.status === 'NON_WORD') {
        nw++;
      } else {
        er++;
        if (my % 30 === 0) console.log(`  [${targetLang} ${my+1}/${total}] ${word} ! ${(r.error||r.status).slice(0,60)}`);
      }
    }
  }
  const pool = Array.from({ length: concurrency }, () => worker());
  await Promise.all(pool);
  return { ok, nw, er };
}

(async () => {
  console.log(`Multi-lang reprocess: ${SLUGS.length} slugs × ${TARGET_LANGS.length} langs (${TARGET_LANGS.join(',')})`);
  console.log(`First lang (en) uses forceFresh (canonical 재생성). Others use forceFreshTranslation (번역만).\n`);

  const summary = {};
  for (const slug of SLUGS) {
    const { data: list } = await admin.from('curated_wordlists')
      .select('id, slug, source_lang, exam_type, level').eq('slug', slug).single();
    if (!list) continue;
    const { data: rows } = await admin.from('curated_words')
      .select('word').eq('curated_wordlist_id', list.id).order('display_order');
    const words = (rows || []).map(r => r.word);
    summary[slug] = { total: words.length, byLang: {} };
    console.log(`\n══ ${slug} (${words.length} words × ${TARGET_LANGS.length} langs) ══`);
    for (let i = 0; i < TARGET_LANGS.length; i++) {
      const lang = TARGET_LANGS[i];
      const isFirst = (i === 0);
      console.log(`\n--- target=${lang} (${isFirst ? 'forceFresh' : 'forceFreshTranslation'}) ---`);
      const r = await processSlugLang(slug, list, words, lang, isFirst, 12);
      summary[slug].byLang[lang] = r;
      console.log(`  → ${r.ok} OK / ${r.nw} non-word / ${r.er} error`);
    }
  }

  console.log('\n\n══ MULTI-LANG SUMMARY ══');
  for (const [slug, s] of Object.entries(summary)) {
    console.log(`\n${slug} (${s.total}):`);
    for (const [lang, r] of Object.entries(s.byLang)) {
      console.log(`  ${lang.padEnd(6)} OK=${r.ok}, nw=${r.nw}, err=${r.er}`);
    }
  }

  fs.writeFileSync(path.resolve(__dirname, 'phase7-multilang-results.json'), JSON.stringify(summary, null, 2));
  console.log(`\n→ scripts/curation/phase7-multilang-results.json`);
})().catch(e => { console.error(e); process.exit(1); });
