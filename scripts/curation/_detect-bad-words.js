// Detect words with truncation / wrong-form issues in TOPIK curated lists.
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUGS = [
  'topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3',
  'topik-2-part-1', 'topik-2-part-2', 'topik-2-part-3',
];

// Common verb/adj stems that should always be -다 form
// (these are the substrings — words missing the 다 are truncated)
const VERB_STEMS_WITHOUT_DA = [
  '먹', '가', '오', '보', '하', '쓰', '살', '사', '앉', '서',
  '읽', '듣', '말', '주', '받', '만들', '쉽', '재미있', '예쁘',
  '좋', '나쁘', '크', '작', '많', '적', '깨끗', '더럽', '뜨겁',
  '차갑', '비싸', '싸', '맛있', '맛없', '있', '없', '알', '모르',
  '배우', '가르치', '시작', '끝나', '시키', '되', '운동하', '공부하',
];

(async () => {
  const allWords = [];
  for (const slug of SLUGS) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    if (!list) continue;
    const { data: rows } = await admin.from('curated_words')
      .select('word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const r of rows ?? []) {
      allWords.push({ slug, word: r.word, en: r.results_by_target_lang?.en });
    }
  }
  console.log(`Total: ${allWords.length}`);

  // Detect truncated verb stems
  const truncated = [];
  for (const w of allWords) {
    if (VERB_STEMS_WITHOUT_DA.includes(w.word)) {
      truncated.push(w);
    }
  }
  console.log(`\n=== Truncated verb stems (missing -다) ===`);
  for (const w of truncated) {
    const meanings = (w.en?.meanings || []).map(m => m.definition).slice(0, 2).join(' / ');
    console.log(`  ${w.slug} / ${w.word.padEnd(8)} → ${meanings}`);
  }

  // Detect words with proper-noun translations (suspicious for common adverbs/nouns)
  console.log(`\n=== Common words flagged as proper noun by translation ===`);
  for (const w of allWords) {
    if (!w.en?.meanings) continue;
    for (const m of w.en.meanings) {
      const def = m.definition || '';
      // Check if definition looks like a country/place (capitalized rare)
      if (/^(Austria|Albania|Algeria|Andorra|Angola|Armenia|Azerbaijan|Bahamas|Belarus|Belgium|Brunei|Bulgaria|Cambodia|Cyprus|Estonia|Finland|Georgia|Guyana|Iceland|Iraq|Israel|Jamaica|Jordan|Kenya|Kuwait|Latvia|Lebanon|Libya|Lithuania|Luxembourg|Macedonia|Malta|Moldova|Monaco|Montenegro|Morocco|Namibia|Nepal|Niger|Nigeria|Oman|Pakistan|Panama|Paraguay|Peru|Poland|Portugal|Qatar|Romania|Rwanda|Senegal|Serbia|Slovakia|Slovenia|Somalia|Sudan|Syria|Taiwan|Tajikistan|Tanzania|Thailand|Tunisia|Uganda|Ukraine|Uruguay|Vanuatu|Venezuela|Yemen|Zimbabwe)\b/.test(def)) {
        console.log(`  ${w.slug} / ${w.word.padEnd(8)} → ${def} (${m.partOfSpeech})`);
      }
    }
  }

  // Detect 1-char headwords that aren't on the legitimate-1-syllable list
  // (numeric / counter / common-noun whitelist would be too long; just flag unusual 1-char for review)
  const ONE_CHAR_OK = new Set([
    '일','이','삼','사','오','육','칠','팔','구','십','백','천','만',  // numerals
    '시','분','초','월','년','주','일','회','호','장','채','권','잔','명','대','살',  // counters
    '나','너','저','우리',  // pronouns
    '눈','귀','입','발','손','코','목','팔','배',  // body
    '책','옷','신','길','집','방','문','차','꽃','잎','강','산','들','풀','빵','떡','콩','쌀','밥','국','면','죽','김',  // objects/food
    '새','말','소','개','닭','곰','양',  // animals
    '별','달','해','비','불','물','흙','돌','바람',  // nature
    '형','동','북','남','서','후','전','앞','뒤','옆','위',  // direction/relative
    '안','밖','중','공','국','과','선','역','호','대','장','회','채','급',  // sino-borderline
    '값','참','자','한','무','만','약','약',  // sino-misc
    '팀','탑','잼','컵','펜','폰','캠',  // loanwords
    '입','구','곰',  // misc body/animal
  ]);
  console.log(`\n=== 1-char headwords (review) ===`);
  for (const w of allWords) {
    if ([...w.word].length === 1 && !ONE_CHAR_OK.has(w.word)) {
      const meanings = (w.en?.meanings || []).map(m => m.definition).slice(0, 2).join(' / ');
      console.log(`  ${w.slug} / ${w.word.padEnd(8)} → ${meanings}`);
    }
  }
})();
