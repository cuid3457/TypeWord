/**
 * Word-Lookup Enrich Mode QA Test
 * 20 language pairs x 50 test cases = 1000 enrich API calls
 * Flow: quick lookup (cached) → extract meanings → enrich lookup (incl. marker fix)
 * Uses 5 anonymous users in parallel to stay within rate limits.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://dvdufzwdtmiuzkivjpxb.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2ZHVmendkdG1pdXpraXZqcHhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjI5ODMsImV4cCI6MjA5MTgzODk4M30.7_ji61PtHbe1eTzZijZbVJJ-f9TYyP6L_lwt356BXdM';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/word-lookup`;

const DELAY_MS = 3400;

// ── 20 Language Pairs (identical to quick test) ──
const PAIRS = [
  ['en','ko'], ['ko','en'], ['en','ja'], ['ja','en'], ['en','zh'],
  ['zh','en'], ['en','es'], ['es','en'], ['en','fr'], ['fr','en'],
  ['en','de'], ['de','en'], ['en','it'], ['en','pt'], ['en','ru'],
  ['ko','ja'], ['ja','ko'], ['ko','zh'], ['zh','ja'], ['ru','en'],
];

// ── 50 Test Words per Source Language (identical to quick test) ──
const WORDS = {
  en: [
    'book','water','time','love','sky',
    'run','believe','understand','create','forgive',
    'beautiful','enormous','subtle',
    'quickly','unfortunately',
    'break a leg','piece of cake','spill the beans',
    'however','although',
    '42','1000000',
    'teh','recieve',
    'defenestration','petrichor','sonder',
    'Shakespeare','Bitcoin',
    'GOAT','salty',
    'bank','spring','light',
    'the quick brown fox','I can\'t believe it happened',
    'wow','oops',
    'algorithm','photosynthesis','entropy',
    'ASAP','FYI',
    'karma','zen',
    'smartphone','bookworm','nevertheless',
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
  return { userId: data.user.id, jwt: data.session.access_token };
}

async function callLookup(jwt, word, sourceLang, targetLang, mode, meanings) {
  const body = { word, sourceLang, targetLang, mode };
  if (meanings && meanings.length > 0) body.meanings = meanings;

  const resp = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json();
  return {
    status: resp.status,
    cached: !!json.cached,
    result: json.result || null,
    error: json.error || null,
  };
}

// ── Quality Checks ──

function checkEnrichResult(word, sourceLang, targetLang, quickResult, enrichResult) {
  const issues = [];

  if (!enrichResult) {
    issues.push('NO_RESULT: enrich returned no result');
    return issues;
  }

  // Check examples
  const examples = enrichResult.examples || [];
  if (examples.length === 0) {
    issues.push('NO_EXAMPLES: no example sentences returned');
  }

  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];

    if (!ex.sentence || ex.sentence.trim().length === 0) {
      issues.push(`EMPTY_SENTENCE: example[${i}] has empty sentence`);
      continue;
    }

    if (!ex.translation || ex.translation.trim().length === 0) {
      issues.push(`EMPTY_TRANSLATION: example[${i}] has empty translation`);
    }

    // Check highlighting markers in sentence
    const markerRegex = /<<(.+?)>>/;
    const hasMarker = markerRegex.test(ex.sentence);
    if (!hasMarker) {
      issues.push(`NO_MARKER: example[${i}] sentence missing <<word>>: "${ex.sentence}"`);
    } else {
      const marked = ex.sentence.match(/<<(.+?)>>/)[1].trim();
      if (marked.length === 0) {
        issues.push(`EMPTY_MARKER: example[${i}] has empty <<>> in sentence`);
      }
    }

    // Check highlighting markers in translation
    const transHasMarker = markerRegex.test(ex.translation || '');
    if (!transHasMarker && ex.translation) {
      issues.push(`NO_TRANS_MARKER: example[${i}] translation missing <<word>>: "${ex.translation}"`);
    }

    // Check meaningIndex validity
    const meanings = quickResult?.meanings || [];
    if (ex.meaningIndex !== undefined && ex.meaningIndex !== null) {
      if (ex.meaningIndex < 0 || ex.meaningIndex >= meanings.length) {
        issues.push(`BAD_MEANING_INDEX: example[${i}] meaningIndex=${ex.meaningIndex} but ${meanings.length} meanings exist`);
      }
    }

    // Check marker content matches word form (loose check for source language)
    if (hasMarker) {
      const markerContent = ex.sentence.match(/<<(.+?)>>/)[1].toLowerCase();
      const wordLower = word.toLowerCase();
      // For CJK languages, exact match is more expected
      const isCJK = ['ja','zh','ko'].includes(sourceLang);
      if (isCJK) {
        if (!markerContent.includes(wordLower) && !wordLower.includes(markerContent)) {
          // Allow if it's a conjugated or varied form
          // Just flag for manual review
          issues.push(`MARKER_MISMATCH_CJK: example[${i}] marker "<<${markerContent}>>" vs word "${word}"`);
        }
      }
    }
  }

  // Check synonyms
  const synonyms = enrichResult.synonyms || [];
  for (let i = 0; i < synonyms.length; i++) {
    if (!synonyms[i] || (typeof synonyms[i] === 'string' && synonyms[i].trim().length === 0)) {
      issues.push(`EMPTY_SYNONYM: synonym[${i}] is empty`);
    }
  }

  // Check antonyms
  const antonyms = enrichResult.antonyms || [];
  for (let i = 0; i < antonyms.length; i++) {
    if (!antonyms[i] || (typeof antonyms[i] === 'string' && antonyms[i].trim().length === 0)) {
      issues.push(`EMPTY_ANTONYM: antonym[${i}] is empty`);
    }
  }

  // Check meaning count consistency
  if (quickResult?.meanings && enrichResult.meanings) {
    if (quickResult.meanings.length !== enrichResult.meanings.length) {
      issues.push(`MEANING_COUNT_MISMATCH: quick=${quickResult.meanings.length} vs enrich=${enrichResult.meanings.length}`);
    }
  }

  return issues;
}

// ── Main Runner ──

async function runBatch(batchId, jwt, pairs) {
  const results = [];
  let callCount = 0;
  const totalCalls = pairs.length * 50;

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
        // Step 1: Quick lookup (should be cached from quick test)
        const quickResp = await callLookup(jwt, word, sourceLang, targetLang, 'quick');
        await sleep(quickResp.cached ? 300 : DELAY_MS);

        if (quickResp.status !== 200 || !quickResp.result) {
          results.push({
            pair: pairLabel, sourceLang, targetLang, word, category,
            quickStatus: quickResp.status, quickCached: quickResp.cached,
            enrichStatus: 0, enrichCached: false,
            quickResult: quickResp.result, enrichResult: null,
            issues: [`QUICK_FAILED: ${quickResp.error || 'no result'}`],
          });
          console.log(`[B${batchId}] ✗ ${callCount}/${totalCalls} ${pairLabel} "${word}" quick failed`);
          continue;
        }

        // Extract meanings
        const meanings = (quickResp.result.meanings || []).map((m) => ({
          definition: m.definition,
          partOfSpeech: m.partOfSpeech || '',
        }));

        // Step 2: Enrich lookup
        const t0 = Date.now();
        const enrichResp = await callLookup(jwt, word, sourceLang, targetLang, 'enrich', meanings);
        const elapsed = Date.now() - t0;

        // Step 3: Quality checks
        const issues = enrichResp.status === 200
          ? checkEnrichResult(word, sourceLang, targetLang, quickResp.result, enrichResp.result)
          : [`ENRICH_FAILED: ${enrichResp.error || `HTTP ${enrichResp.status}`}`];

        results.push({
          pair: pairLabel, sourceLang, targetLang, word, category,
          quickStatus: quickResp.status, quickCached: quickResp.cached,
          enrichStatus: enrichResp.status, enrichCached: enrichResp.cached,
          enrichElapsed: elapsed,
          quickResult: quickResp.result, enrichResult: enrichResp.result,
          issues,
        });

        const icon = issues.length === 0 ? '✓' : `⚠${issues.length}`;
        console.log(
          `[B${batchId}] ${icon} ${callCount}/${totalCalls} ${pairLabel} "${word}" ${elapsed}ms`,
        );

        if (enrichResp.status === 429) {
          console.warn(`[B${batchId}] Rate limited! Pausing 65s...`);
          await sleep(65000);
        } else {
          await sleep(DELAY_MS);
        }
      } catch (err) {
        results.push({
          pair: pairLabel, sourceLang, targetLang, word, category,
          quickStatus: 0, enrichStatus: 0,
          quickResult: null, enrichResult: null,
          issues: [`EXCEPTION: ${err.message}`],
        });
        console.error(`[B${batchId}] ERR ${pairLabel} "${word}": ${err.message}`);
        await sleep(DELAY_MS);
      }
    }
  }
  return results;
}

async function main() {
  console.log('=== Word Lookup ENRICH Mode QA Test ===');
  console.log(`${PAIRS.length} pairs x 50 words = ${PAIRS.length * 50} enrich calls\n`);

  console.log('Creating 5 anonymous test users...');
  const users = [];
  for (let i = 0; i < 5; i++) {
    const user = await createAnonymousUser();
    users.push(user);
    console.log(`  User ${i + 1}: ${user.userId}`);
  }

  // 5 users: 200 calls each (within 200/hour limit)
  const batches = [
    { jwt: users[0].jwt, pairs: PAIRS.slice(0, 4) },    // 4 pairs = 200 calls
    { jwt: users[1].jwt, pairs: PAIRS.slice(4, 8) },     // 4 pairs = 200 calls
    { jwt: users[2].jwt, pairs: PAIRS.slice(8, 12) },    // 4 pairs = 200 calls
    { jwt: users[3].jwt, pairs: PAIRS.slice(12, 16) },   // 4 pairs = 200 calls
    { jwt: users[4].jwt, pairs: PAIRS.slice(16, 20) },   // 4 pairs = 200 calls
  ];

  console.log('\nStarting parallel batches...\n');
  const startTime = Date.now();

  const batchResults = await Promise.all(
    batches.map((b, i) => runBatch(i + 1, b.jwt, b.pairs)),
  );

  const allResults = batchResults.flat();
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // Summary
  const total = allResults.length;
  const ok = allResults.filter((r) => r.issues.length === 0).length;
  const withIssues = allResults.filter((r) => r.issues.length > 0);
  const enrichFailed = allResults.filter((r) => r.enrichStatus !== 200).length;

  const issueCounts = {};
  for (const r of allResults) {
    for (const issue of r.issues) {
      const type = issue.split(':')[0];
      issueCounts[type] = (issueCounts[type] || 0) + 1;
    }
  }

  console.log('\n=== ENRICH Summary ===');
  console.log(`Total: ${total} | Clean: ${ok} | Issues: ${withIssues.length} | Failed: ${enrichFailed} | Time: ${elapsed}min`);

  if (Object.keys(issueCounts).length > 0) {
    console.log('\nIssue breakdown:');
    for (const [type, count] of Object.entries(issueCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
  }

  if (withIssues.length > 0) {
    console.log(`\nDetailed issues (${withIssues.length} words):`);
    for (const r of withIssues) {
      console.log(`  ${r.pair} "${r.word}" [${r.category}]:`);
      for (const issue of r.issues) {
        console.log(`    - ${issue}`);
      }
    }
  }

  // Save results
  const outDir = path.join(__dirname, 'test-results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `enrich-${Date.now()}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify({ summary: { total, ok, withIssues: withIssues.length, enrichFailed, elapsed, issueCounts }, results: allResults }, null, 2),
  );
  console.log(`\nResults saved to: ${outFile}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
