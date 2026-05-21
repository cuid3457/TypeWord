const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function audit(word, res) {
  const issues = [];
  if (!res?.meanings || !res?.examples) return [];

  // 1. Verb POS but Korean def doesn't end with -다 / -하다
  for (let i = 0; i < res.meanings.length; i++) {
    const m = res.meanings[i];
    if (m.partOfSpeech === '동사' && m.definition) {
      // Definition is comma-separated; check first term ends with -다
      const firstTerm = m.definition.split(/[,，]/)[0].trim();
      if (firstTerm.length > 0 && !/[다]$/.test(firstTerm) && /[가-힣]/.test(firstTerm)) {
        issues.push(`m${i}_verb_def_no_da:${m.definition}`);
      }
    }
    // adj POS but def ends with -다 not -ㄴ/-은/-는 (adj form)
    if (m.partOfSpeech === '형용사' && m.definition) {
      const firstTerm = m.definition.split(/[,，]/)[0].trim();
      // Adj should end with -ㄴ/-은/-는/-이/-한 or be a state. -다 verb-form for adj is OK in Korean (좋다, 크다)
      // Skip this check — too noisy
    }
  }

  // 2. Stray characters in examples (}, {, [ , ])
  for (let i = 0; i < res.examples.length; i++) {
    const sen = res.examples[i].sentence || '';
    const tr = res.examples[i].translation || '';
    if (/[\{\}\[\]]/.test(sen.replace(/\*\*/g, ''))) issues.push(`ex${i}_stray_bracket_sentence:${sen}`);
    if (/[\{\}\[\]]/.test(tr)) issues.push(`ex${i}_stray_bracket_translation:${tr}`);
  }

  // 3. Example doesn't contain the headword (raw or in **...**)
  for (let i = 0; i < res.examples.length; i++) {
    const sen = res.examples[i].sentence || '';
    const marker = sen.match(/\*\*([^*]+)\*\*/);
    if (!marker) continue;
    const wrapped = marker[1].toLowerCase();
    // Word might be conjugated/inflected; check if normalized headword stem matches
    const stem = word.toLowerCase().replace(/(er|ir|re|ant|é|ée|és|ées|s)$/, '').slice(0, 4);
    if (stem.length >= 3 && !wrapped.includes(stem) && !word.toLowerCase().includes(wrapped.slice(0, 4))) {
      // Loose check; only flag if no overlap at all
      issues.push(`ex${i}_headword_mismatch:wrapped='${wrapped}' word='${word}'`);
    }
  }

  // 4. Suspicious meaning patterns (mixed opposites)
  for (let i = 0; i < res.meanings.length; i++) {
    const def = (res.meanings[i].definition || '').toLowerCase();
    if (def.includes('양성') && def.includes('악성')) issues.push(`m${i}_contradictory_def:${def}`);
    if (def.includes('큰') && def.includes('작은')) issues.push(`m${i}_contradictory_def:${def}`);
    if (def.includes('많은') && def.includes('적은')) issues.push(`m${i}_contradictory_def:${def}`);
  }

  return issues;
}

(async () => {
  const slugs = ['delf-a1-part-1','delf-a1-part-2','delf-a1-part-3','delf-a2-part-1','delf-a2-part-2','delf-a2-part-3','delf-b1-part-1','delf-b1-part-2','delf-b1-part-3','delf-b1-part-4','delf-b1-part-5'];
  const byType = {};
  const all = [];
  for (const slug of slugs) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    const { data } = await admin.from('curated_words').select('word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const r of data) {
      const iss = audit(r.word, r.results_by_target_lang?.ko);
      if (iss.length) {
        all.push(`${slug}|${r.word}: ${iss.join(' | ')}`);
        for (const t of iss) {
          const cat = t.split(':')[0];
          byType[cat] = (byType[cat]||0)+1;
        }
      }
    }
  }
  console.log('By type:');
  Object.entries(byType).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${v.toString().padStart(4)} × ${k}`));
  console.log('\nSamples (up to 50):');
  all.slice(0, 50).forEach(s => console.log('  '+s));
  console.log('\nTotal issues:', all.length);
})();
