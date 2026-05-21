const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const KOREAN_RE = /[가-힣]/;
const FRENCH_LETTER_RE = /[a-zA-ZÀ-ÿœŒæÆ]/;
const CYRILLIC_RE = /[А-Яа-я]/;
const CJK_RE = /[一-鿿]/;

function audit(word, res) {
  const issues = [];
  if (!res) return ['null result'];

  const hasSpace = /\s/.test(word);
  const primaryPOS = res.meanings?.[0]?.partOfSpeech || '';
  const isExpression = primaryPOS === 'expression' || primaryPOS === '표현' || primaryPOS === 'expr';
  if (!hasSpace && !isExpression && (!res.ipa || !res.ipa.trim())) {
    issues.push('NO_IPA');
  }

  for (let i = 0; i < (res.examples || []).length; i++) {
    const ex = res.examples[i];
    if (!ex.sentence) { issues.push(`ex${i}_empty_sentence`); continue; }
    if (!/\*\*[^*]+\*\*/.test(ex.sentence)) {
      issues.push(`ex${i}_no_marker`);
    }
    if (CYRILLIC_RE.test(ex.sentence) || CJK_RE.test(ex.sentence)) {
      issues.push(`ex${i}_wrong_script_in_sentence`);
    }
    if (!FRENCH_LETTER_RE.test(ex.sentence)) {
      issues.push(`ex${i}_no_french_letters`);
    }
    if (!ex.translation) { issues.push(`ex${i}_no_translation`); continue; }
    if (!KOREAN_RE.test(ex.translation)) {
      issues.push(`ex${i}_translation_not_korean`);
    }
  }

  for (let i = 0; i < (res.meanings || []).length; i++) {
    const m = res.meanings[i];
    if (!m.definition) { issues.push(`m${i}_no_def`); continue; }
    if (!KOREAN_RE.test(m.definition)) {
      issues.push(`m${i}_def_not_korean`);
    }
  }

  if ((res.meanings || []).length > 3) issues.push('too_many_meanings');

  return issues;
}

(async () => {
  const slugs = ['delf-a1-part-1','delf-a1-part-2','delf-a1-part-3','delf-a2-part-1','delf-a2-part-2','delf-a2-part-3','delf-b1-part-1','delf-b1-part-2','delf-b1-part-3','delf-b1-part-4','delf-b1-part-5'];
  const byType = {};
  const samples = [];
  let total = 0;
  for (const slug of slugs) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    const { data } = await admin.from('curated_words').select('word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const r of data) {
      const iss = audit(r.word, r.results_by_target_lang?.ko);
      if (iss.length) {
        total += iss.length;
        for (const t of iss) byType[t] = (byType[t]||0)+1;
        if (samples.length < 80) samples.push(`${slug}|${r.word}: ${iss.join(';')}`);
      }
    }
  }
  console.log('Total issues:', total);
  console.log('By type:');
  Object.entries(byType).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log('  ' + v.toString().padStart(4) + ' × ' + k));
  console.log('\nSamples:');
  samples.forEach(s => console.log(' ', s));
})();
