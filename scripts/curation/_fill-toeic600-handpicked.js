// Hand-curated TOEIC 600 candidate pool. LLM generation kept rehashing
// already-excluded words; this targeted list of common TOEIC business
// words ensures we can backfill the 5 remaining slots.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TARGETS = ['ko','ja','zh-CN','es','fr','de','it'];
const norm = (w) => String(w).trim().toLowerCase();

const CANDIDATES = [
  'workplace','workstation','workload','workflow','breakroom','meeting room','conference call','video call',
  'spreadsheet','memo','notepad','attachment','sender','signature line',
  'absence','overtime','expense report','reimbursement','allowance',
  'bid','tender','quote','estimate','launch event','press release',
  'survey','feedback','questionnaire','shareholder','investor','stakeholder',
  'audit','review','assessment','dispatch','carrier','courier',
  'inventory','depot','wholesale','clearance','rebate',
  'user guide','training session','onboarding','orientation',
  'subscription','membership','renewal','upgrade','permit',
  'compliance','regulation','procedure','protocol','punctual',
  'timely','overdue','urgent','prioritize','postpone','reschedule',
  'collaborate','coordinate','consult','negotiate','mediate',
  'forecast','anticipate','productive','efficient','reliable',
  'spacious','convenient','accessible','remote',
];

async function fetchExclude() {
  const set = new Set();
  for (const slug of ['toeic-600-part-1','toeic-600-part-2','toeic-600-part-3','toeic-800','toeic-800-1','toeic-800-2']) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).maybeSingle();
    if (!list) continue;
    const { data } = await admin.from('curated_words').select('word').eq('curated_wordlist_id', list.id);
    for (const r of data) set.add(norm(r.word));
  }
  return set;
}

async function validate(word, hint) {
  const out = {};
  for (let i = 0; i < TARGETS.length; i++) {
    const tl = TARGETS[i];
    for (let att = 1; att <= 2; att++) {
      const r = await admin.functions.invoke('word-lookup-v2', {
        body: { word, sourceLang: 'en', targetLang: tl, mode: 'enrich', forceFresh: i === 0, forceFreshTranslation: i > 0, proficiencyHint: hint },
      });
      if (!r.error && r.data?.result) {
        const res = r.data.result;
        if (res.note || !res.meanings?.length || !res.examples?.length) {
          if (i === 0) return null;
          break;
        }
        out[tl] = res;
        break;
      }
      if (att < 2) await new Promise(rs => setTimeout(rs, 1500));
    }
    if (!out[tl]) return null;
  }
  return out;
}

(async () => {
  const exclude = await fetchExclude();
  console.log('Already-used:', exclude.size);
  const pool = CANDIDATES.filter((w) => !exclude.has(norm(w)));
  console.log('Available candidates:', pool.length);

  const SHORTFALLS = [
    { slug: 'toeic-600-part-2', need: 1 },
    { slug: 'toeic-600-part-3', need: 4 },
  ];

  for (const target of SHORTFALLS) {
    const { data: list } = await admin.from('curated_wordlists').select('id, slug, source_lang, exam_type, level').eq('slug', target.slug).single();
    const hint = deriveProficiencyHint(list);
    const { count: cur } = await admin.from('curated_words').select('*', { count: 'exact', head: true }).eq('curated_wordlist_id', list.id);
    let dispOrder = cur + 1;
    let added = 0;
    while (added < target.need && pool.length > 0) {
      const w = pool.shift();
      if (exclude.has(norm(w))) continue;
      const res = await validate(w, hint);
      if (!res) { console.log(target.slug, 'skip:', w); continue; }
      await admin.from('curated_words').insert({
        curated_wordlist_id: list.id, word: w, reading_key: '',
        display_order: dispOrder++, results_by_target_lang: res,
      });
      exclude.add(norm(w));
      added++;
      console.log(target.slug, 'ADDED:', w);
    }
    await admin.from('curated_wordlists').update({ word_count: cur + added }).eq('id', list.id);
  }

  for (const slug of ['toeic-600-part-1','toeic-600-part-2','toeic-600-part-3']) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    const { count } = await admin.from('curated_words').select('*', { count: 'exact', head: true }).eq('curated_wordlist_id', list.id);
    console.log(slug, '→', count);
  }
})();
