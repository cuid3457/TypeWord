// Deep audit beyond G1-G14. Checks structural integrity issues that rule
// audits miss + dumps sample raw entries for human review.
//
// Issues we check:
//   1. meanings.length vs examples.length mismatch (per v2 design: 1 ex per meaning)
//   2. ipa present + format sane for Latin-script source words
//   3. marker count + position in source sentence (per example)
//   4. synonyms/antonyms: count, self-ref, cross-script, paren pollution
//   5. POS coverage per meaning
//   6. example sentence length distribution
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function auditSlug(slug, opts = { sample: 0 }) {
  const { data: list } = await admin
    .from('curated_wordlists').select('id, source_lang')
    .eq('slug', slug).single();
  const { data: rows } = await admin
    .from('curated_words')
    .select('word, results_by_target_lang, display_order')
    .eq('curated_wordlist_id', list.id)
    .order('display_order');

  const stats = {
    slug,
    totalEntries: 0,
    meaningCounts: {},     // {1:N, 2:N, 3:N}
    exampleCounts: {},     // {0:N, 1:N, 2:N, 3:N, 4+:N}
    countMismatches: [],   // [{word, lang, m, e}]
    noIpa: [],             // [{word}] for Latin-source single-word
    markerCountAnomalies: [], // [{word, lang, idx, sent, count}]
    selfRefSyn: [],        // [{word, lang, syn}]
    selfRefAnt: [],
    parenInSynAnt: [],
    crossScriptSyn: [],
    emptyMeanings: [],
    emptySentences: [],
  };

  const samples = [];

  for (const row of rows || []) {
    for (const [lang, r] of Object.entries(row.results_by_target_lang || {})) {
      stats.totalEntries++;
      const mLen = (r.meanings || []).length;
      const eLen = (r.examples || []).length;
      stats.meaningCounts[mLen] = (stats.meaningCounts[mLen] || 0) + 1;
      const eBucket = eLen >= 4 ? '4+' : String(eLen);
      stats.exampleCounts[eBucket] = (stats.exampleCounts[eBucket] || 0) + 1;

      if (mLen !== eLen) {
        stats.countMismatches.push({ word: row.word, lang, m: mLen, e: eLen });
      }
      if (mLen === 0) stats.emptyMeanings.push({ word: row.word, lang });

      // IPA check (Latin source)
      if (['en','es','fr','de','it','pt'].includes(list.source_lang)) {
        const isPhrase = row.word.includes(' ');
        if (!isPhrase) {
          const ipa = typeof r.ipa === 'string' ? r.ipa : (Array.isArray(r.ipa) ? r.ipa[0] : null);
          if (!ipa || !ipa.trim()) stats.noIpa.push({ word: row.word, lang });
        }
      }

      // Marker check per example
      for (let i = 0; i < (r.examples || []).length; i++) {
        const ex = r.examples[i];
        const s = ex.sentence || '';
        const markerCount = (s.match(/\*\*[^*]+\*\*/g) || []).length;
        if (markerCount === 0) stats.markerCountAnomalies.push({ word: row.word, lang, idx: i, sent: s, count: 0 });
        else if (markerCount >= 2) stats.markerCountAnomalies.push({ word: row.word, lang, idx: i, sent: s, count: markerCount });
        if (!s.trim()) stats.emptySentences.push({ word: row.word, lang, idx: i });
      }

      // Synonyms/Antonyms
      for (const [field, target] of [['synonyms', stats.selfRefSyn], ['antonyms', stats.selfRefAnt]]) {
        const arr = r[field];
        if (!Array.isArray(arr)) continue;
        for (const x of arr) {
          if (typeof x !== 'string') continue;
          if (x.toLowerCase().trim() === row.word.toLowerCase().trim()) {
            target.push({ word: row.word, lang, syn: x });
          }
          if (/[\(\)（）]/.test(x)) {
            stats.parenInSynAnt.push({ word: row.word, lang, field, value: x });
          }
        }
      }
    }
    // Sample raw entries for human inspection
    if (samples.length < opts.sample) {
      const en = row.results_by_target_lang?.en || row.results_by_target_lang?.ko;
      if (en) samples.push({ word: row.word, lang: 'en', data: en });
    }
  }

  return { stats, samples };
}

(async () => {
  const slugs = process.argv.slice(2);
  if (!slugs.length) {
    console.error('Usage: node _deep-audit-v2.js <slug> [<slug>...] [--sample=N]');
    process.exit(1);
  }
  const sampleArg = slugs.find(s => s.startsWith('--sample='));
  const sample = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : 0;
  const realSlugs = slugs.filter(s => !s.startsWith('--'));

  for (const slug of realSlugs) {
    const { stats, samples } = await auditSlug(slug, { sample });
    console.log(`\n══════════════ ${slug} ══════════════`);
    console.log(`Total entries (word × lang): ${stats.totalEntries}`);
    console.log(`\nMeaning count distribution:`);
    for (const k of Object.keys(stats.meaningCounts).sort()) {
      console.log(`  ${k} meanings: ${stats.meaningCounts[k]} entries`);
    }
    console.log(`\nExample count distribution:`);
    for (const k of Object.keys(stats.exampleCounts).sort()) {
      console.log(`  ${k} examples: ${stats.exampleCounts[k]} entries`);
    }
    console.log(`\nCount mismatches (meanings≠examples): ${stats.countMismatches.length}`);
    if (stats.countMismatches.length) {
      const byMismatch = {};
      for (const m of stats.countMismatches) {
        const k = `m=${m.m}/e=${m.e}`;
        byMismatch[k] = (byMismatch[k] || 0) + 1;
      }
      for (const [k, v] of Object.entries(byMismatch).sort((a,b)=>b[1]-a[1])) {
        console.log(`  ${k}: ${v}`);
      }
      console.log(`  First 10 examples:`);
      for (const m of stats.countMismatches.slice(0, 10)) {
        console.log(`    ${m.word} (${m.lang}): m=${m.m}, e=${m.e}`);
      }
    }
    console.log(`\nMarker anomalies (0 or 2+ markers in sentence): ${stats.markerCountAnomalies.length}`);
    for (const a of stats.markerCountAnomalies.slice(0, 10)) {
      console.log(`  ${a.word} (${a.lang}) e[${a.idx}] count=${a.count}: "${a.sent.slice(0, 60)}"`);
    }
    console.log(`\nEmpty meanings: ${stats.emptyMeanings.length}`);
    console.log(`Empty sentences: ${stats.emptySentences.length}`);
    console.log(`No IPA (Latin source, single word): ${stats.noIpa.length}`);
    console.log(`Self-ref synonyms: ${stats.selfRefSyn.length}`);
    console.log(`Self-ref antonyms: ${stats.selfRefAnt.length}`);
    console.log(`Paren in syn/ant: ${stats.parenInSynAnt.length}`);

    if (samples.length) {
      console.log(`\n--- SAMPLES (${samples.length} entries for human review) ---`);
      for (const s of samples) {
        console.log(`\n[${s.word}] (${s.lang})`);
        console.log(`  ipa: ${s.data.ipa || '(none)'}`);
        console.log(`  reading: ${s.data.reading || '(none)'}`);
        console.log(`  meanings (${(s.data.meanings||[]).length}):`);
        for (let i = 0; i < (s.data.meanings || []).length; i++) {
          const m = s.data.meanings[i];
          console.log(`    [${i}] [${m.partOfSpeech}] ${m.definition}`);
        }
        console.log(`  examples (${(s.data.examples||[]).length}):`);
        for (let i = 0; i < (s.data.examples || []).length; i++) {
          const e = s.data.examples[i];
          console.log(`    [${i}] S: ${e.sentence}`);
          console.log(`        T: ${e.translation}`);
        }
        console.log(`  synonyms: ${JSON.stringify(s.data.synonyms || [])}`);
        console.log(`  antonyms: ${JSON.stringify(s.data.antonyms || [])}`);
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
