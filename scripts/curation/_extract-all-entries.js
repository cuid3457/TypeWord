// Extract ALL 12,600 entries (1,800 words × 7 langs) for direct audit.
// Compact format optimized for context efficiency.
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUGS = ['topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3', 'topik-2-part-1', 'topik-2-part-2', 'topik-2-part-3'];
const TARGET_LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

function compact(result) {
  if (!result) return null;
  if (result.note) return { note: result.note };
  const meanings = (result.meanings || []).map(m => `${m.definition} (${m.partOfSpeech})`);
  const examples = (result.examples || []).map(ex => {
    const t = ex.translation || '';
    const s = ex.sentence || '';
    return `${s} | ${t}`;
  });
  return { m: meanings, e: examples };
}

(async () => {
  const allWords = [];
  for (const slug of SLUGS) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    if (!list) continue;
    const { data: rows } = await admin.from('curated_words')
      .select('word, results_by_target_lang').eq('curated_wordlist_id', list.id).order('display_order');
    for (const r of (rows || [])) {
      const byLang = {};
      for (const lang of TARGET_LANGS) {
        const res = r.results_by_target_lang?.[lang];
        byLang[lang] = compact(res);
      }
      allWords.push({ slug, word: r.word, byLang });
    }
  }
  console.log(`Total words: ${allWords.length}`);

  // Auto-detect suspect patterns
  const suspects = {
    nullEntry: [],
    nonWord: [],
    emptyMeanings: [],
    emptyExamples: [],
    meaningCountDiffAcrossLangs: [],
    examplesMissingMarker: [],
    multipleMeaningsLooseSenses: [],
  };

  for (const w of allWords) {
    const langs = Object.entries(w.byLang);
    const meaningCounts = new Set();
    let anyEmpty = false;
    let anyNonWord = false;

    for (const [lang, data] of langs) {
      if (!data) {
        suspects.nullEntry.push({ word: w.word, slug: w.slug, lang });
        continue;
      }
      if (data.note === 'non_word' || data.note === 'sentence') {
        suspects.nonWord.push({ word: w.word, slug: w.slug, lang, note: data.note });
        anyNonWord = true;
        continue;
      }
      const mc = (data.m || []).length;
      const ec = (data.e || []).length;
      meaningCounts.add(mc);
      if (mc === 0) {
        suspects.emptyMeanings.push({ word: w.word, slug: w.slug, lang });
        anyEmpty = true;
      }
      if (ec === 0 && mc > 0) {
        suspects.emptyExamples.push({ word: w.word, slug: w.slug, lang });
      }
      // Check markers in examples (en only - sample)
      if (lang === 'en' && data.e) {
        for (const ex of data.e) {
          if (!ex.includes('**')) {
            suspects.examplesMissingMarker.push({ word: w.word, slug: w.slug, example: ex.slice(0, 80) });
            break;
          }
        }
      }
    }
    // Inconsistent meaning counts across langs
    if (meaningCounts.size > 1 && !anyNonWord) {
      suspects.meaningCountDiffAcrossLangs.push({
        word: w.word, slug: w.slug,
        counts: Object.fromEntries(langs.map(([l, d]) => [l, d?.m?.length ?? null])),
      });
    }
  }

  console.log('\nSuspect counts:');
  for (const [k, v] of Object.entries(suspects)) {
    console.log(`  ${k}: ${v.length}`);
  }

  fs.writeFileSync(path.resolve(__dirname, 'all-entries.json'), JSON.stringify(allWords, null, 0));
  fs.writeFileSync(path.resolve(__dirname, 'suspects.json'), JSON.stringify(suspects, null, 2));
  console.log(`\n→ scripts/curation/all-entries.json (${allWords.length} entries)`);
  console.log(`→ scripts/curation/suspects.json (${Object.values(suspects).reduce((s,a)=>s+a.length,0)} flagged)`);
})();
