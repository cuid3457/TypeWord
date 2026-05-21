// Two-phase fix:
//   Phase 1: strip stray `}` from example sentences (in-place, no LLM call)
//   Phase 2: force-fresh re-generate words where the wrapped marker
//            doesn't plausibly match the headword (wrong word marked)
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function isPlausibleConjugation(headword, wrapped) {
  const h = stripAccents(headword.trim());
  // Strip leading articles from wrapped before comparing
  let w = stripAccents(wrapped.trim()).replace(/^(le |la |les |l'|un |une |des |du |de la |de l'|au |aux )/, '');
  if (h === w) return true;
  if (h.length === 0 || w.length === 0) return false;
  if (h.includes(' ')) {
    const parts = h.split(/\s+/);
    return parts.every(p => w.includes(p));
  }
  // Strict 3-letter prefix match (works for most regular inflection)
  if (h.substring(0, 3) === w.substring(0, 3)) return true;
  // Very short headwords (<3 chars): require exact
  if (h.length < 3) return h === w;
  // Irregular verbs: known stem map
  const IRREGULAR_STEMS = {
    'venir': ['vien', 'ven', 'vin'],
    'aller': ['va', 'vai', 'all'],
    'etre': ['sui', 'es', 'est', 'som', 'ete', 'fu'],
    'avoir': ['ai', 'as', 'a', 'av', 'eu', 'ont'],
    'faire': ['fai', 'fer', 'fis', 'fit', 'fas'],
    'pouvoir': ['peu', 'pou', 'pus'],
    'vouloir': ['veu', 'vou', 'voul', 'vous'],
    'savoir': ['sai', 'sav', 'sus'],
    'devoir': ['doi', 'dev', 'dus'],
    'voir': ['voi', 'vu', 'vis', 'vit'],
    'prendre': ['pren', 'pri', 'prit'],
    'mettre': ['met', 'mit', 'mis'],
    'dire': ['di', 'dit', 'dis'],
    'partir': ['par'],
    'sortir': ['sor'],
    'dormir': ['dor'],
    'tenir': ['tien', 'ten', 'tin'],
    'connaitre': ['conn', 'connu'],
    'naitre': ['nai', 'naqu'],
    'vivre': ['vi', 'viv', 'vec'],
    'boire': ['boi', 'bu', 'buv'],
    'recevoir': ['rec', 'reco', 'recu'],
    'lire': ['li', 'lu'],
    'ecrire': ['ecri', 'ecriv'],
    'craindre': ['crain', 'craig'],
    'rire': ['ri'],
    'ouvrir': ['ouv'],
    'eteindre': ['etein', 'eteig', 'eteint'],
  };
  for (const [stem, prefixes] of Object.entries(IRREGULAR_STEMS)) {
    if (h === stem || h === stem.replace(/r$/, '')) {
      if (prefixes.some(p => w.startsWith(p))) return true;
    }
  }
  return false;
}

(async () => {
  const slugs = ['delf-a1-part-1','delf-a1-part-2','delf-a1-part-3','delf-a2-part-1','delf-a2-part-2','delf-a2-part-3','delf-b1-part-1','delf-b1-part-2','delf-b1-part-3','delf-b1-part-4','delf-b1-part-5'];
  const toRegen = []; // {slug, list, hint, word, rowId}
  let strayFixed = 0;

  for (const slug of slugs) {
    const { data: list } = await admin.from('curated_wordlists').select('id, slug, source_lang, exam_type, level').eq('slug', slug).single();
    const hint = deriveProficiencyHint(list);
    const { data } = await admin.from('curated_words').select('id, word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const r of data) {
      const res = r.results_by_target_lang?.ko;
      if (!res?.examples) continue;
      let changed = false;
      let needsRegen = false;
      for (let i = 0; i < res.examples.length; i++) {
        const ex = res.examples[i];
        if (ex.sentence && /[\{\}\[\]]/.test(ex.sentence.replace(/\*\*/g, ''))) {
          ex.sentence = ex.sentence.replace(/[\{\}\[\]]/g, '');
          changed = true;
          strayFixed++;
        }
        const m = ex.sentence?.match(/\*\*([^*]+)\*\*/);
        if (m && !isPlausibleConjugation(r.word, m[1])) {
          needsRegen = true;
        }
      }
      if (changed) {
        await admin.from('curated_words').update({
          results_by_target_lang: { ...r.results_by_target_lang, ko: res },
        }).eq('id', r.id);
      }
      if (needsRegen) {
        toRegen.push({ slug, listId: list.id, hint, word: r.word, rowId: r.id });
      }
    }
  }
  console.log(`Phase 1: stripped ${strayFixed} stray brackets`);
  console.log(`Phase 2: ${toRegen.length} words to regenerate`);

  const WORKERS = 10;
  const queue = [...toRegen];
  let done = 0;
  let okCount = 0, failCount = 0;
  const start = Date.now();
  const timer = setInterval(() => {
    const pct = ((done / toRegen.length) * 100).toFixed(0);
    const eta = ((toRegen.length - done) / Math.max((done / ((Date.now()-start)/1000)), 0.1)).toFixed(0);
    process.stdout.write(`\r  progress: ${done}/${toRegen.length} (${pct}%), ETA ${eta}s   `);
  }, 2000);

  const workers = Array.from({ length: WORKERS }, async () => {
    while (queue.length > 0) {
      const t = queue.shift();
      if (!t) break;
      let result = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const r = await admin.functions.invoke('word-lookup-v2', {
          body: {
            word: t.word, sourceLang: 'fr', targetLang: 'ko',
            mode: 'enrich', forceFresh: true, proficiencyHint: t.hint,
          },
        });
        if (!r.error && r.data?.result && !r.data.result.note && r.data.result.examples?.length) {
          result = r.data.result; break;
        }
        if (attempt < 3) await new Promise(rs => setTimeout(rs, 2000));
      }
      if (result) {
        const { data: cur } = await admin.from('curated_words').select('results_by_target_lang').eq('id', t.rowId).single();
        const updated = { ...(cur.results_by_target_lang || {}), ko: result };
        await admin.from('curated_words').update({ results_by_target_lang: updated }).eq('id', t.rowId);
        okCount++;
      } else {
        failCount++;
      }
      done++;
    }
  });
  await Promise.all(workers);
  clearInterval(timer);
  console.log(`\n  done: ${okCount} ok, ${failCount} failed in ${((Date.now()-start)/60000).toFixed(1)} min`);
})();
