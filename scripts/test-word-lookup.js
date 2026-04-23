/**
 * Word-Lookup Edge Function QA Test
 * 20 language pairs x 50 test cases = 1,000 API calls
 * Uses 5 anonymous users in parallel to stay within rate limits.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://dvdufzwdtmiuzkivjpxb.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2ZHVmendkdG1pdXpraXZqcHhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjI5ODMsImV4cCI6MjA5MTgzODk4M30.7_ji61PtHbe1eTzZijZbVJJ-f9TYyP6L_lwt356BXdM';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/word-lookup`;

const DELAY_MS = 3400; // ~17.6 req/min per user, under 20/min limit

// ── 20 Language Pairs ──
const PAIRS = [
  ['en','ko'], ['ko','en'], ['en','ja'], ['ja','en'], ['en','zh'],
  ['zh','en'], ['en','es'], ['es','en'], ['en','fr'], ['fr','en'],
  ['en','de'], ['de','en'], ['en','it'], ['en','pt'], ['en','ru'],
  ['ko','ja'], ['ja','ko'], ['ko','zh'], ['zh','ja'], ['ru','en'],
];

// ── 50 Test Words per Source Language ──
const WORDS = {
  en: [
    // common nouns
    'book','water','time','love','sky',
    // verbs
    'run','believe','understand','create','forgive',
    // adjectives
    'beautiful','enormous','subtle',
    // adverbs
    'quickly','unfortunately',
    // idioms
    'break a leg','piece of cake','spill the beans',
    // function words
    'however','although',
    // numbers
    '42','1000000',
    // typos
    'teh','recieve',
    // rare words
    'defenestration','petrichor','sonder',
    // proper nouns
    'Shakespeare','Bitcoin',
    // slang
    'GOAT','salty',
    // polysemous
    'bank','spring','light',
    // sentences
    'the quick brown fox','I can\'t believe it happened',
    // interjections
    'wow','oops',
    // technical
    'algorithm','photosynthesis','entropy',
    // abbreviations
    'ASAP','FYI',
    // cultural
    'karma','zen',
    // compounds
    'smartphone','bookworm','nevertheless',
    // edge cases
    'a','%',
  ],
  ko: [
    '사과','하늘','사랑','시간','꿈',
    '달리다','믿다','이해하다','만들다','용서하다',
    '아름답다','거대하다','미묘하다',
    '빠르게','불행히도',
    '식은 죽 먹기','눈코 뜰 새 없다','발 없는 말이 천 리 간다',
    '그러나','그런데',
    '42','백만',
    '안녕하세욧','감사합미다',
    '미쁘다','갈무리','아득바득',
    '세종대왕','비트코인',
    '갓생','존맛탱',
    '배','눈','밤',
    '오늘 날씨가 좋다','내일 뭐 할 거야?',
    '아이고','헐',
    '알고리즘','광합성','엔트로피',
    'ㅋㅋ','ㅎㅇ',
    '정','한',
    '손전화','책벌레','그럼에도불구하고',
    'ㅁ','?',
  ],
  ja: [
    '本','空','愛','時間','夢',
    '走る','信じる','理解する','作る','許す',
    '美しい','巨大な','微妙な',
    '速く','残念ながら',
    '猫の手も借りたい','一石二鳥','花より団子',
    'しかし','けれども',
    '42','百万',
    'ありがとうごさいます','おはようございまs',
    '木漏れ日','侘び寂び','積ん読',
    '夏目漱石','ビットコイン',
    'ヤバい','エモい',
    '橋','雲','気',
    '今日は天気がいい','明日何をする？',
    'おっと','あら',
    'アルゴリズム','光合成','エントロピー',
    'w','草',
    '武士道','禅',
    'スマートフォン','本の虫','それにもかかわらず',
    'あ','！',
  ],
  zh: [
    '书','天空','爱','时间','梦',
    '跑','相信','理解','创造','原谅',
    '美丽','巨大','微妙',
    '迅速地','不幸地',
    '画蛇添足','一石二鸟','塞翁失马',
    '然而','虽然',
    '42','一百万',
    '你好吗吗','谢谢你你',
    '饕餮','翊','嫠',
    '孔子','比特币',
    '内卷','躺平',
    '花','打','长',
    '今天天气很好','你明天做什么？',
    '哎呀','嗯',
    '算法','光合作用','熵',
    'lol','gg',
    '风水','气功',
    '智能手机','书虫','尽管如此',
    '一','？',
  ],
  es: [
    'libro','cielo','amor','tiempo','sueño',
    'correr','creer','entender','crear','perdonar',
    'hermoso','enorme','sutil',
    'rápidamente','desafortunadamente',
    'estar en las nubes','meter la pata','costar un ojo de la cara',
    'sin embargo','aunque',
    '42','1000000',
    'hazer','recivir',
    'petricor','saudade','duende',
    'Cervantes','Bitcoin',
    'mola','flipar',
    'banco','muñeca','cola',
    'el gato está en la mesa','no puedo creerlo',
    '¡ole!','¡ay!',
    'algoritmo','fotosíntesis','entropía',
    'ASAP','etc',
    'siesta','flamenco',
    'rascacielos','sacapuntas','paraguas',
    'a','¿?',
  ],
  fr: [
    'livre','ciel','amour','temps','rêve',
    'courir','croire','comprendre','créer','pardonner',
    'beau','énorme','subtil',
    'rapidement','malheureusement',
    'avoir le cafard','poser un lapin','coûter les yeux de la tête',
    'cependant','bien que',
    '42','1000000',
    'je suis contant','merçi',
    'pétrichor','trouvaille','dépaysement',
    'Molière','Bitcoin',
    'kiffer','meuf',
    'avocat','glace','pièce',
    'le chat est sur la table','je ne peux pas y croire',
    'oh là là','zut',
    'algorithme','photosynthèse','entropie',
    'ASAP','svp',
    'terroir','savoir-faire',
    'gratte-ciel','porte-monnaie','parapluie',
    'à','?',
  ],
  de: [
    'Buch','Himmel','Liebe','Zeit','Traum',
    'laufen','glauben','verstehen','erschaffen','vergeben',
    'schön','riesig','subtil',
    'schnell','leider',
    'den Nagel auf den Kopf treffen','Schwein haben','ins Gras beißen',
    'jedoch','obwohl',
    '42','1000000',
    'Algorhitmus','Rytmus',
    'Weltschmerz','Fernweh','Torschlusspanik',
    'Goethe','Bitcoin',
    'geil','krass',
    'Bank','Schloss','Zug',
    'die Katze sitzt auf dem Tisch','ich kann es nicht glauben',
    'ach','hoppla',
    'Algorithmus','Photosynthese','Entropie',
    'z.B.','usw',
    'Gemütlichkeit','Wanderlust',
    'Handschuh','Kühlschrank','Staubsauger',
    'a','?',
  ],
  ru: [
    'книга','небо','любовь','время','мечта',
    'бегать','верить','понимать','создавать','прощать',
    'красивый','огромный','тонкий',
    'быстро','к сожалению',
    'ни рыба ни мясо','вешать лапшу на уши','когда рак на горе свистнет',
    'однако','хотя',
    '42','1000000',
    'превет','спосибо',
    'тоска','авось','хандра',
    'Пушкин','Биткоин',
    'кайф','зашквар',
    'ключ','лук','коса',
    'кошка сидит на столе','я не могу в это поверить',
    'ого','ой',
    'алгоритм','фотосинтез','энтропия',
    'и т.д.','т.е.',
    'тройка','самовар',
    'пылесос','подсолнух','водопад',
    'а','?',
  ],
};

// Categories for each word index (for result labeling)
const CATEGORIES = [
  'noun','noun','noun','noun','noun',
  'verb','verb','verb','verb','verb',
  'adj','adj','adj',
  'adv','adv',
  'idiom','idiom','idiom',
  'function','function',
  'number','number',
  'typo','typo',
  'rare','rare','rare',
  'proper_noun','proper_noun',
  'slang','slang',
  'polysemous','polysemous','polysemous',
  'sentence','sentence',
  'interjection','interjection',
  'technical','technical','technical',
  'abbreviation','abbreviation',
  'cultural','cultural',
  'compound','compound','compound',
  'edge_case','edge_case',
];

// ── Helpers ──

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createAnonymousUser() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw new Error(`Anonymous sign-in failed: ${error.message}`);
  return {
    userId: data.user.id,
    jwt: data.session.access_token,
  };
}

async function callWordLookup(jwt, word, sourceLang, targetLang) {
  const resp = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ word, sourceLang, targetLang, mode: 'quick' }),
  });

  const body = await resp.json();
  return {
    status: resp.status,
    cached: !!body.cached,
    result: body.result || null,
    error: body.error || null,
  };
}

// ── Main Runner ──

async function runBatch(batchId, jwt, pairs) {
  const results = [];
  let callCount = 0;

  for (const [sourceLang, targetLang] of pairs) {
    const words = WORDS[sourceLang];
    if (!words) {
      console.error(`No words for source language: ${sourceLang}`);
      continue;
    }

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const category = CATEGORIES[i] || 'unknown';
      const pairLabel = `${sourceLang}→${targetLang}`;
      callCount++;

      try {
        const start = Date.now();
        const resp = await callWordLookup(jwt, word, sourceLang, targetLang);
        const elapsed = Date.now() - start;

        results.push({
          pair: pairLabel,
          sourceLang,
          targetLang,
          word,
          category,
          status: resp.status,
          cached: resp.cached,
          elapsed,
          result: resp.result,
          error: resp.error,
        });

        const statusIcon = resp.status === 200 ? '✓' : '✗';
        const cacheIcon = resp.cached ? '(cached)' : '';
        console.log(
          `[B${batchId}] ${statusIcon} ${callCount}/200 ${pairLabel} "${word}" ${elapsed}ms ${cacheIcon}`,
        );

        if (resp.status === 429) {
          console.warn(`[B${batchId}] Rate limited! Pausing 65s...`);
          await sleep(65000);
        }
      } catch (err) {
        results.push({
          pair: pairLabel,
          sourceLang,
          targetLang,
          word,
          category,
          status: 0,
          cached: false,
          elapsed: 0,
          result: null,
          error: err.message,
        });
        console.error(`[B${batchId}] ERROR ${pairLabel} "${word}": ${err.message}`);
      }

      await sleep(DELAY_MS);
    }
  }
  return results;
}

async function main() {
  console.log('=== Word Lookup QA Test ===');
  console.log(`${PAIRS.length} pairs x 50 words = ${PAIRS.length * 50} calls\n`);

  // Create 5 anonymous users
  console.log('Creating 5 anonymous test users...');
  const users = [];
  for (let i = 0; i < 5; i++) {
    const user = await createAnonymousUser();
    users.push(user);
    console.log(`  User ${i + 1}: ${user.userId}`);
  }

  // Distribute pairs across users (4 pairs each = 200 calls each)
  const batches = [];
  for (let i = 0; i < 5; i++) {
    const pairsSlice = PAIRS.slice(i * 4, (i + 1) * 4);
    batches.push({ userId: users[i], pairs: pairsSlice });
  }

  console.log('\nStarting parallel batches...\n');
  const startTime = Date.now();

  // Run all 5 batches in parallel
  const batchResults = await Promise.all(
    batches.map((b, i) => runBatch(i + 1, b.userId.jwt, b.pairs)),
  );

  const allResults = batchResults.flat();
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // Summary
  const total = allResults.length;
  const ok = allResults.filter((r) => r.status === 200).length;
  const cached = allResults.filter((r) => r.cached).length;
  const failed = allResults.filter((r) => r.status !== 200).length;
  const errors = allResults.filter((r) => r.error);

  console.log('\n=== Summary ===');
  console.log(`Total: ${total} | OK: ${ok} | Cached: ${cached} | Failed: ${failed} | Time: ${elapsed}min`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) {
      console.log(`  ${e.pair} "${e.word}" → ${e.error}`);
    }
  }

  // Save results
  const outDir = path.join(__dirname, 'test-results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `word-lookup-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ summary: { total, ok, cached, failed, elapsed }, results: allResults }, null, 2));
  console.log(`\nResults saved to: ${outFile}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
