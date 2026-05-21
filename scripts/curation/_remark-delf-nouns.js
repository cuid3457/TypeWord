// For DELF noun-headword examples where the marker wraps the wrong word
// (typically a verb), re-locate and re-wrap the marker around the noun.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

// Try to locate the headword (or plural form) in the sentence and re-wrap.
// Returns the corrected sentence or null if we can't locate it cleanly.
function rewrapNoun(sentence, headword) {
  // Strip existing markers
  const clean = sentence.replace(/\*\*/g, '');
  const cleanNorm = stripAccents(clean);
  const hwNorm = stripAccents(headword);

  // Candidates: headword exact, plural (+s), with elided 'l' (l'X), composite
  const candidates = new Set();
  candidates.add(headword);
  candidates.add(headword + 's');
  candidates.add(headword.replace(/au$/, 'aux'));   // manteau → manteaux
  candidates.add(headword.replace(/eu$/, 'eux'));   // jeu → jeux
  candidates.add(headword.replace(/al$/, 'aux'));   // cheval → chevaux
  candidates.add(headword.replace(/^(le |la |les |l'|un |une )/, ''));  // headword sometimes has article in DB

  // Find first matching candidate in sentence (longest-first to avoid partial)
  const cands = [...candidates].filter(Boolean).sort((a,b) => b.length - a.length);
  for (const cand of cands) {
    const candNorm = stripAccents(cand);
    // Word-boundary regex (account for French accents/apostrophes around)
    const idx = cleanNorm.indexOf(candNorm);
    if (idx < 0) continue;
    // Boundary check: preceded by non-letter, followed by non-letter
    const before = cleanNorm[idx - 1] || ' ';
    const after = cleanNorm[idx + candNorm.length] || ' ';
    if (/[a-z]/.test(before)) continue;
    if (/[a-z]/.test(after)) continue;
    // Found — re-wrap using original casing/accents from clean string
    const original = clean.substring(idx, idx + candNorm.length);
    return clean.substring(0, idx) + '**' + original + '**' + clean.substring(idx + candNorm.length);
  }
  return null;
}

(async () => {
  const slugs = ['delf-a1-part-1','delf-a1-part-2','delf-a1-part-3','delf-a2-part-1','delf-a2-part-2','delf-a2-part-3','delf-b1-part-1','delf-b1-part-2','delf-b1-part-3','delf-b1-part-4','delf-b1-part-5'];

  function isNounMismatch(headword, wrapped) {
    let h = stripAccents(headword.trim());
    let w = stripAccents(wrapped.trim()).replace(/^(le |la |les |l'|un |une |des |du |de la |de l'|au |aux )/, '').trim();
    if (h === w) return false;
    if (h.length < 3) return h !== w;
    if (h.includes(' ')) { const p = h.split(/\s+/); return !p.every(x => w.includes(x)); }
    return h.substring(0,3) !== w.substring(0,3);
  }

  let fixed = 0, unfixable = 0;
  const unfixables = [];

  for (const slug of slugs) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    const { data } = await admin.from('curated_words').select('id, word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const r of data) {
      const res = r.results_by_target_lang?.ko;
      if (!res?.examples || !res?.meanings) continue;
      let changed = false;
      for (let i = 0; i < res.examples.length; i++) {
        const ex = res.examples[i];
        const mi = typeof ex.meaningIndex === 'number' ? ex.meaningIndex : 0;
        const pos = res.meanings[mi]?.partOfSpeech;
        if (pos !== '명사' && pos !== '고유명사') continue;
        const m = ex.sentence?.match(/\*\*([^*]+)\*\*/);
        if (!m) continue;
        if (!isNounMismatch(r.word, m[1])) continue;
        // Try to re-wrap
        const fixedSen = rewrapNoun(ex.sentence, r.word);
        if (fixedSen) {
          ex.sentence = fixedSen;
          changed = true;
          fixed++;
        } else {
          unfixable++;
          unfixables.push(`${slug}|${r.word}: ${ex.sentence}`);
        }
      }
      if (changed) {
        await admin.from('curated_words').update({
          results_by_target_lang: { ...r.results_by_target_lang, ko: res },
        }).eq('id', r.id);
      }
    }
  }
  console.log(`Fixed: ${fixed}, Unfixable: ${unfixable}`);
  unfixables.forEach(u => console.log('  ', u));
})();
