/**
 * JLPT N5 final cleanup — phase 6.
 *
 * Manual targeted patches for the residual 10 flags after marker repair.
 * Each entry is a (slug, word, lang, mutator) tuple. Mutators are precise
 * because the residual cases require example-specific decisions that automated
 * marker repair cannot infer (translation re-wording, modifier marker on the
 * right korean word, etc.).
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const patches = [
  // 我々 (en) e1: translation uses "Our" but unmarked. Mark it.
  {
    slug: 'jlpt-n5-part-1', word: '我々', lang: 'en', mut: (r) => {
      r.examples[1].translation = '**Our** team won the game.';
    },
  },
  // する (en) e1: translation drops emphasis; rewrite to keep "do" marked.
  {
    slug: 'jlpt-n5-part-1', word: 'する', lang: 'en', mut: (r) => {
      r.examples[1].translation = 'He will **do** a party.';
    },
  },
  // 押す (ko) e1: translation has 누른다 but unmarked.
  {
    slug: 'jlpt-n5-part-1', word: '押す', lang: 'ko', mut: (r) => {
      r.examples[1].translation = '엘리베이터 버튼을 **누른다**.';
    },
  },
  // 遊ぶ (ko) e1: rewrite translation to use 놀다 (proper equivalent of 遊ぶ).
  {
    slug: 'jlpt-n5-part-1', word: '遊ぶ', lang: 'ko', mut: (r) => {
      r.examples[1].translation = '휴일에는 친구들과 게임으로 **논다**.';
    },
  },
  // もっと (ko) e2: "부드럽게 말씀해" → "더 부드럽게 말씀해"
  {
    slug: 'jlpt-n5-part-1', word: 'もっと', lang: 'ko', mut: (r) => {
      r.examples[2].translation = '**더** 부드럽게 말씀해 주세요.';
    },
  },
  // もう (ko) e1: missing marker — "배가 벌써 불러요"
  {
    slug: 'jlpt-n5-part-1', word: 'もう', lang: 'ko', mut: (r) => {
      r.examples[1].translation = '**이미** 배가 불러요.';
    },
  },
  // もう (ko) e2: marker on 자요 instead of もう equivalent.
  {
    slug: 'jlpt-n5-part-1', word: 'もう', lang: 'ko', mut: (r) => {
      r.examples[2].translation = '**이제** 늦으니까 자요.';
    },
  },
  // 過ぎる (ko) e2: 食べ過ぎる → 너무 많이 먹으면 — mark 너무 많이.
  {
    slug: 'jlpt-n5-part-2', word: '過ぎる', lang: 'ko', mut: (r) => {
      r.examples[2].translation = '달콤한 것을 **너무 많이** 먹으면 몸에 안 좋다.';
    },
  },
  // 取る (ko) e0/e1: the JA source uses 撮る (different verb). Rewrite to use 取る properly.
  {
    slug: 'jlpt-n5-part-1', word: '取る', lang: 'ko', mut: (r) => {
      r.examples[0].sentence = '棚から本を**取る**。';
      r.examples[0].translation = '선반에서 책을 **꺼낸다**.';
      r.examples[1].sentence = 'メモを**取る**ためにペンを持ってきた。';
      r.examples[1].translation = '메모를 **하기** 위해 펜을 가져왔다.';
    },
  },
  // する (ko) e1: marker on 作る (different verb). Rewrite to use する.
  {
    slug: 'jlpt-n5-part-1', word: 'する', lang: 'ko', mut: (r) => {
      r.examples[1].sentence = '彼はパーティーを**する**。';
      r.examples[1].translation = '그는 파티를 **한다**.';
    },
  },
];

async function main() {
  for (const p of patches) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', p.slug).single();
    const { data: row } = await admin.from('curated_words')
      .select('results_by_target_lang')
      .eq('curated_wordlist_id', list.id).eq('word', p.word).maybeSingle();
    if (!row) { console.log(`  ✗ [${p.slug}] ${p.word}: not found`); continue; }
    const updated = JSON.parse(JSON.stringify(row.results_by_target_lang));
    p.mut(updated[p.lang]);
    const { error } = await admin.from('curated_words')
      .update({ results_by_target_lang: updated })
      .eq('curated_wordlist_id', list.id).eq('word', p.word);
    if (error) console.log(`  ✗ [${p.slug}] ${p.word} (${p.lang}): ${error.message}`);
    else console.log(`  ✓ [${p.slug}] ${p.word} (${p.lang})`);
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
