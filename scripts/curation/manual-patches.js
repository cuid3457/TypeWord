/**
 * Manual patches for the 6 lint-confirmed real violations after the
 * automated re-curation rounds. Run after lint-curated.js + recurate-flagged.js.
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Each patch: locate (slug, word, lang) and apply mutator(result) → patched result.
const patches = [
  {
    slug: 'delf-a1-part-1', word: 'appeler', lang: 'ko',
    desc: 'SOV: marker followed by content violates Korean word order',
    mutate: (r) => {
      r.examples[0].translation = '그들은 고양이를 피에르라고 **부를 거예요**.';
      r.examples[2].translation = '그녀는 오빠를 저녁 식사하러 **불러요**.';
      return r;
    },
  },
  {
    slug: 'delf-a1-part-2', word: 'étoile', lang: 'en',
    desc: 'Elision: "La étoile" → "L\'étoile"',
    mutate: (r) => {
      r.examples[0].sentence = "L'**étoile** brille dans le ciel nocturne.";
      return r;
    },
  },
  {
    slug: 'delf-a1-part-2', word: 'mer', lang: 'ko',
    desc: 'Source typo: "L\'mer" → "La mer"; also tighten Korean word order',
    mutate: (r) => {
      r.examples[0].sentence = 'La **mer** est calme aujourd\'hui.';
      r.examples[0].translation = '오늘 **바다**가 잔잔해요.';
      r.examples[1].translation = '우리는 여름에 **바다**에서 수영하는 것을 좋아해요.';
      r.examples[2].translation = '**바다** 위로 지는 일몰이 아름다워요.';
      return r;
    },
  },
  {
    slug: 'delf-a2-part-1', word: 'amener', lang: 'ko',
    desc: 'Korean word order + missing object',
    mutate: (r) => {
      r.examples[0].translation = '나는 동생을 파티에 **데려갈** 거예요.';
      r.examples[1].translation = '회의에 디저트를 **가져올** 수 있나요?';
      return r;
    },
  },
  {
    slug: 'delf-a2-part-2', word: 'réservation', lang: 'ko',
    desc: 'Remove English loanword "booking" from synonyms',
    mutate: (r) => {
      r.synonyms = (r.synonyms || []).filter((s) => s.toLowerCase() !== 'booking');
      return r;
    },
  },
  {
    slug: 'delf-b1-part-2', word: 'lecture', lang: 'ko',
    desc: 'False friend: 강의 → 읽기/독서 (lecture in fr = reading, not lecture/conférence)',
    mutate: (r) => {
      r.meanings = [
        { definition: '읽기, 독서', partOfSpeech: '명사' },
        { definition: '판독, 해석', partOfSpeech: '명사' },
      ];
      r.examples = [
        {
          sentence: "J'aime la **lecture** avant de dormir.",
          translation: '나는 자기 전에 **독서**를 좋아해요.',
          meaning_index: 0,
        },
        {
          sentence: "La **lecture** de ce roman est captivante.",
          translation: '이 소설의 **읽기**는 매우 흥미로워요.',
          meaning_index: 0,
        },
        {
          sentence: "La **lecture** de la carte est essentielle en randonnée.",
          translation: '등산할 때 지도 **판독**이 필수적입니다.',
          meaning_index: 1,
        },
      ];
      return r;
    },
  },
];

async function main() {
  let ok = 0, fail = 0;
  for (const p of patches) {
    try {
      const { data: list, error: e1 } = await admin
        .from('curated_wordlists').select('id').eq('slug', p.slug).single();
      if (e1) throw new Error(`wordlist ${p.slug}: ${e1.message}`);
      const { data: row, error: e2 } = await admin
        .from('curated_words')
        .select('results_by_target_lang')
        .eq('curated_wordlist_id', list.id).eq('word', p.word).maybeSingle();
      if (e2 || !row) throw new Error(`row ${p.word}: ${e2?.message || 'not found'}`);
      const langResult = row.results_by_target_lang[p.lang];
      if (!langResult) throw new Error(`lang ${p.lang} missing in ${p.word}`);
      const newResult = p.mutate(JSON.parse(JSON.stringify(langResult)));
      const newResults = { ...row.results_by_target_lang, [p.lang]: newResult };
      const { error: e3 } = await admin
        .from('curated_words')
        .update({ results_by_target_lang: newResults })
        .eq('curated_wordlist_id', list.id).eq('word', p.word);
      if (e3) throw new Error(`update: ${e3.message}`);
      console.log(`  ✓ [${p.slug}] ${p.word} (${p.lang}) — ${p.desc}`);
      ok++;
    } catch (e) {
      console.warn(`  ✗ [${p.slug}] ${p.word} (${p.lang}): ${e.message}`);
      fail++;
    }
  }
  console.log(`\n✅ ${ok} patched, ${fail} failed`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
