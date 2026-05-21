/**
 * JLPT N5 lint follow-up:
 *  A. 草 — drop slang meaning ("온라인상 웃음 표시") + the example using it
 *  B. 電話 / 全部 / ストーブ / ナイフ — strip Korean particles inside ** markers
 *     ("**전화를**" → "**전화**를"). Particles include 을/를/은/는/이/가/도/만/의/와/과/에/에서/으로/로.
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const PARTICLES = ['을', '를', '은', '는', '이', '가', '도', '만', '의', '와', '과', '에서', '에', '으로', '로'];
const PARTICLE_RE = new RegExp(`\\*\\*([^*]+?)(${PARTICLES.join('|')})\\*\\*`, 'g');

async function dropSlangFor草() {
  const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', 'jlpt-n5-part-2').single();
  const { data: row } = await admin.from('curated_words').select('results_by_target_lang').eq('curated_wordlist_id', list.id).eq('word', '草').single();
  const r = JSON.parse(JSON.stringify(row.results_by_target_lang));
  for (const lang of Object.keys(r)) {
    const o = r[lang];
    // Drop meaning index 1 (slang "online laughter")
    if (Array.isArray(o.meanings) && o.meanings.length > 1) {
      o.meanings = [o.meanings[0]];
    }
    // Drop examples whose meaningIndex points to dropped meaning, remap rest to 0
    if (Array.isArray(o.examples)) {
      o.examples = o.examples
        .filter((ex) => (ex.meaningIndex ?? ex.meaning_index ?? 0) === 0)
        .map((ex) => ({ ...ex, meaningIndex: 0 }));
    }
  }
  await admin.from('curated_words').update({ results_by_target_lang: r }).eq('curated_wordlist_id', list.id).eq('word', '草');
  console.log(`✓ 草: meanings ${row.results_by_target_lang.ko.meanings.length}→${r.ko.meanings.length}, examples ${row.results_by_target_lang.ko.examples.length}→${r.ko.examples.length}`);
}

function stripParticleFromMarker(s) {
  if (!s) return s;
  return s.replace(PARTICLE_RE, '**$1**$2');
}

async function fixMarker(slug, word) {
  const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
  const { data: row } = await admin.from('curated_words').select('results_by_target_lang').eq('curated_wordlist_id', list.id).eq('word', word).single();
  const r = JSON.parse(JSON.stringify(row.results_by_target_lang));
  let changed = 0;
  for (const lang of Object.keys(r)) {
    if (!Array.isArray(r[lang].examples)) continue;
    for (const ex of r[lang].examples) {
      const newSentence = stripParticleFromMarker(ex.sentence);
      const newTranslation = stripParticleFromMarker(ex.translation);
      if (newSentence !== ex.sentence) { ex.sentence = newSentence; changed++; }
      if (newTranslation !== ex.translation) { ex.translation = newTranslation; changed++; }
    }
  }
  if (changed === 0) {
    console.log(`  · [${slug}] ${word}: no marker changes`);
    return;
  }
  await admin.from('curated_words').update({ results_by_target_lang: r }).eq('curated_wordlist_id', list.id).eq('word', word);
  console.log(`✓ [${slug}] ${word}: ${changed} marker(s) fixed`);
}

async function main() {
  console.log('=== A. 草 slang removal ===');
  await dropSlangFor草();

  console.log('\n=== B. Marker particle strip ===');
  const targets = [
    ['jlpt-n5-part-1', '電話'],
    ['jlpt-n5-part-2', '全部'],
    ['jlpt-n5-part-2', 'ストーブ'],
    ['jlpt-n5-part-2', 'ナイフ'],
  ];
  for (const [slug, w] of targets) await fixMarker(slug, w);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
