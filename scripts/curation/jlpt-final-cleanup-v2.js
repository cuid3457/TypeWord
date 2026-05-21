/**
 * JLPT N5 final cleanup v2 — after the difficulty-rule re-curation.
 * Targets the 17 residual flags that mechanical repair couldn't handle.
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
  // ── S2 translation marker missing ──────────────────────────────────────
  { slug:'jlpt-n5-part-1', word:'ありがとう', lang:'en', mut:(r)=>{
    r.examples[2].translation = 'I have feelings of **gratitude** toward the teacher.';
  }},
  { slug:'jlpt-n5-part-1', word:'取る', lang:'ko', mut:(r)=>{
    r.examples[2].translation = '사진을 **찍는** 것을 좋아합니다.';
  }},
  { slug:'jlpt-n5-part-1', word:'悪い', lang:'ko', mut:(r)=>{
    r.examples[2].translation = '**미안**하지만, 도와줄 수 있나요?';
  }},
  { slug:'jlpt-n5-part-2', word:'雷', lang:'en', mut:(r)=>{
    r.examples[2].translation = '**Lightning** flashed and brightened the sky.';
  }},
  { slug:'jlpt-n5-part-2', word:'鏡', lang:'en', mut:(r)=>{
    r.examples[2].sentence = '朝、**鏡**を見て顔を洗った。';
    r.examples[2].translation = 'In the morning, I looked at the **mirror** and washed my face.';
  }},
  { slug:'jlpt-n5-part-1', word:'知る', lang:'ko', mut:(r)=>{
    r.examples[1].translation = '나는 그 문제를 **모릅니다**.';
  }},
  { slug:'jlpt-n5-part-1', word:'昼ご飯', lang:'ko', mut:(r)=>{
    r.examples[1].translation = '**점심**시간이에요.';
  }},
  { slug:'jlpt-n5-part-1', word:'誰', lang:'en', mut:(r)=>{
    r.examples[1].translation = '**Someone** please help.';
  }},
  { slug:'jlpt-n5-part-2', word:'集める', lang:'ko', mut:(r)=>{
    // Source used 集まる (intransitive). Rewrite to use 集める (transitive).
    r.examples[1].sentence = '子供たちは石を**集める**。';
    r.examples[1].translation = '아이들이 돌을 **모아요**.';
  }},
  { slug:'jlpt-n5-part-1', word:'年', lang:'ko', mut:(r)=>{
    r.examples[0].translation = '그는 **나이**를 먹고 있습니다.';
  }},

  // ── S3 wrong-content markers (rewrite sentence) ────────────────────────
  { slug:'jlpt-n5-part-1', word:'ある', lang:'ko', mut:(r)=>{
    // Source used いる (animate). Rewrite for ある (inanimate).
    r.examples[1].sentence = '公園にベンチが**ある**。';
    r.examples[1].translation = '공원에 벤치가 **있다**.';
  }},
  { slug:'jlpt-n5-part-1', word:'する', lang:'en', mut:(r)=>{
    // Source marked 作る. Rewrite to use する.
    r.examples[1].sentence = '私は宿題を**する**。';
    r.examples[1].translation = 'I **do** my homework.';
  }},
  { slug:'jlpt-n5-part-1', word:'する', lang:'ko', mut:(r)=>{
    r.examples[1].sentence = '私は宿題を**する**。';
    r.examples[1].translation = '나는 숙제를 **한다**.';
  }},
  { slug:'jlpt-n5-part-2', word:'嬉しい', lang:'en', mut:(r)=>{
    // e0 marker on 日, e1 marker on hiragana うれしい (inconsistent with kanji headword)
    r.examples[0].sentence = '今日はとても**嬉しい**日です。';
    r.examples[0].translation = 'Today is a very **happy** day.';
    r.examples[1].sentence = 'あなたの話を聞いて**嬉しい**です。';
    r.examples[1].translation = 'I am **pleased** to hear your story.';
  }},
  { slug:'jlpt-n5-part-1', word:'脱ぐ', lang:'en', mut:(r)=>{
    // Source used 着替える instead of 脱ぐ. Rewrite.
    r.examples[2].sentence = '暑いので服を**脱ぐ**。';
    r.examples[2].translation = "It's hot so I **take off** my clothes.";
  }},

  // ── S8 reading missing for 時々 (両 langs) ────────────────────────────
  { slug:'jlpt-n5-part-2', word:'時々', lang:'__all__', mut:(_data, full)=>{
    for (const lang of Object.keys(full)) {
      if (!Array.isArray(full[lang].reading) || full[lang].reading.length === 0) {
        full[lang].reading = ['ときどき'];
      }
    }
  }},
];

async function main() {
  for (const p of patches) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', p.slug).single();
    const { data: row } = await admin.from('curated_words')
      .select('results_by_target_lang')
      .eq('curated_wordlist_id', list.id).eq('word', p.word).maybeSingle();
    if (!row) { console.log(`  ✗ [${p.slug}] ${p.word}: not found`); continue; }
    const updated = JSON.parse(JSON.stringify(row.results_by_target_lang));
    if (p.lang === '__all__') {
      p.mut(null, updated);
    } else {
      if (!updated[p.lang]) { console.log(`  ✗ [${p.slug}] ${p.word} (${p.lang}): lang missing`); continue; }
      p.mut(updated[p.lang]);
    }
    const { error } = await admin.from('curated_words')
      .update({ results_by_target_lang: updated })
      .eq('curated_wordlist_id', list.id).eq('word', p.word);
    if (error) console.log(`  ✗ [${p.slug}] ${p.word}: ${error.message}`);
    else console.log(`  ✓ [${p.slug}] ${p.word} (${p.lang})`);
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
