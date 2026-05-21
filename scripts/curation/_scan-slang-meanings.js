// Scan ALL active curated wordlists for slang/vulgar/derogatory keywords
// in any meaning.definition or example sentence. Lists every match for
// user review BEFORE bulk-stripping.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Multilingual slang/vulgar/derogatory keyword patterns (case-insensitive).
// Match in DEFINITION (the dictionary gloss) OR explicit register tags.
const SLANG_RE = new RegExp([
  // English
  '\\bvulgar\\b', '\\bslang\\b', '\\bprofan\\w*', '\\bswear\\w*', '\\bderogat\\w*',
  '\\bpejorat\\w*', '\\boffensive\\b', '\\btaboo\\b', '\\bcrude\\b', '\\bobscen\\w+',
  '\\binsult\\w*', '\\bcurse\\b', '\\bcuss\\b', '\\bdamn\\b', '\\bbitch\\w*',
  '\\bpenis\\b', '\\bdick\\b', '\\bcock\\b', '\\bass(?:hole)?\\b', '\\bshit\\w*',
  '\\bfuck\\w*', '\\bcunt\\b', '\\btit\\w*', '\\bwhore\\b', '\\bslut\\w*',
  // German
  '\\bvulg\\w*', '\\bbeleidig\\w*', '\\bschimpf\\w*', '\\babwert\\w*',
  // French
  '\\bvulgaire\\b', '\\bgrossier\\w*', '\\binjure\\w*', '\\binsulte\\w*',
  // Spanish
  '\\bvulgar\\b', '\\bgroser\\w*', '\\bpalabrota\\w*', '\\binsulto\\w*',
  // Italian
  '\\bvolgare\\b', '\\bvolgarismo\\b', '\\bdispregiat\\w*', '\\binsulto\\w*',
  // Japanese (in defs that contain these markers)
  'ののしり', 'スラング', '俗語', '隠語', '蔑称', '差別語', 'ちんこ', 'まんこ',
  // Chinese
  '粗话', '骂人', '俗语', '脏话', '蔑称', '阴茎',
].join('|'), 'i');

(async () => {
  const { data: lists } = await admin
    .from('curated_wordlists')
    .select('id, slug')
    .eq('is_active', true)
    .gt('word_count', 0);

  const findings = [];
  for (const list of lists ?? []) {
    const { data: rows } = await admin
      .from('curated_words')
      .select('word, results_by_target_lang')
      .eq('curated_wordlist_id', list.id);
    for (const row of rows ?? []) {
      for (const [lang, r] of Object.entries(row.results_by_target_lang || {})) {
        for (let i = 0; i < (r.meanings || []).length; i++) {
          const def = r.meanings[i].definition || '';
          if (SLANG_RE.test(def)) {
            findings.push({
              slug: list.slug,
              word: row.word,
              lang,
              meaningIdx: i,
              isPrimary: i === 0,
              definition: def,
              pos: r.meanings[i].partOfSpeech,
            });
          }
        }
      }
    }
  }

  console.log(`\nTotal flagged: ${findings.length} meaning entries\n`);

  // Group by source-side word for deduped view
  const byWord = {};
  for (const f of findings) {
    const key = `${f.slug} :: ${f.word} :: m[${f.meaningIdx}]${f.isPrimary ? ' [PRIMARY!]' : ''}`;
    if (!byWord[key]) byWord[key] = [];
    byWord[key].push(`${f.lang} (${f.pos}) ${f.definition}`);
  }

  for (const key of Object.keys(byWord).sort()) {
    console.log(`\n${key}`);
    for (const v of byWord[key]) console.log(`  • ${v}`);
  }

  console.log(`\n\nUnique (slug, word, meaningIdx) groups: ${Object.keys(byWord).length}`);
})().catch(e => { console.error(e); process.exit(1); });
