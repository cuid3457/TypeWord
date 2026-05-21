/**
 * HSK 2 quality patches — beyond what the difficulty re-curation could fix.
 * The model's meaning selection was wrong for these polysemic items.
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
  // ── 别: replace with negative imperative (HSK 2 canonical sense) ────────
  {
    slug: 'hsk-2', word: '别',
    mut: (data) => {
      const koTpl = {
        meanings: [
          { definition: '~하지 마라 (부정 명령)', partOfSpeech: '부사', relevanceScore: 100 },
        ],
        examples: [
          { sentence: '**别**走！', translation: '**가지 마**!', meaningIndex: 0 },
          { sentence: '请**别**说话。', translation: '**말하지 마세요**.', meaningIndex: 0 },
          { sentence: '**别**忘了带钥匙。', translation: '열쇠 가져오는 거 **잊지 마**.', meaningIndex: 0 },
        ],
        synonyms: ['不要'],
        antonyms: [],
      };
      const enTpl = {
        meanings: [
          { definition: "don't (negative imperative)", partOfSpeech: 'adverb', relevanceScore: 100 },
        ],
        examples: [
          { sentence: '**别**走！', translation: "**Don't** go!", meaningIndex: 0 },
          { sentence: '请**别**说话。', translation: "Please **don't** talk.", meaningIndex: 0 },
          { sentence: '**别**忘了带钥匙。', translation: "**Don't** forget to bring the keys.", meaningIndex: 0 },
        ],
        synonyms: ['不要'],
        antonyms: [],
      };
      if (data.ko) Object.assign(data.ko, koTpl);
      if (data.en) Object.assign(data.en, enTpl);
    },
  },

  // ── 唱歌: fix e1 verb-as-noun error ───────────────────────────────────
  {
    slug: 'hsk-2', word: '唱歌',
    mut: (data) => {
      if (data.ko?.examples?.[1]) {
        data.ko.examples[1].sentence = '他在房间里**唱歌**。';
        data.ko.examples[1].translation = '그는 방에서 **노래해요**.';
      }
      if (data.en?.examples?.[1]) {
        data.en.examples[1].sentence = '他在房间里**唱歌**。';
        data.en.examples[1].translation = 'He **sings** in the room.';
      }
    },
  },

  // ── 便宜: drop secondary "이익" meaning + e2 (off-level for HSK 2) ────
  {
    slug: 'hsk-2', word: '便宜',
    mut: (data) => {
      for (const lang of Object.keys(data)) {
        if (Array.isArray(data[lang].meanings)) {
          data[lang].meanings = [data[lang].meanings[0]]; // keep only "cheap"
        }
        if (Array.isArray(data[lang].examples)) {
          data[lang].examples = data[lang].examples
            .filter((ex) => (ex.meaningIndex ?? ex.meaning_index ?? 0) === 0)
            .map((ex) => ({ ...ex, meaningIndex: 0 }));
        }
      }
    },
  },
];

async function main() {
  for (const p of patches) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', p.slug).single();
    const { data: rows } = await admin.from('curated_words')
      .select('reading_key, results_by_target_lang')
      .eq('curated_wordlist_id', list.id).eq('word', p.word);
    if (!rows || rows.length === 0) { console.log(`  ✗ [${p.slug}] ${p.word}: not found`); continue; }
    for (const row of rows) {
      const updated = JSON.parse(JSON.stringify(row.results_by_target_lang));
      p.mut(updated);
      const { error } = await admin.from('curated_words')
        .update({ results_by_target_lang: updated })
        .eq('curated_wordlist_id', list.id).eq('word', p.word).eq('reading_key', row.reading_key);
      if (error) console.log(`  ✗ [${p.slug}] ${p.word}: ${error.message}`);
      else console.log(`  ✓ [${p.slug}] ${p.word} (rk='${row.reading_key}')`);
    }
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
