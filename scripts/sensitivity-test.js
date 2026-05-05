/**
 * Pre-launch sensitivity audit.
 *
 * For each source language, look up a curated set of geographically /
 * politically / culturally sensitive words (target=ko), then reverse-look
 * up the Korean rendering back to the source language. Flag results whose
 * examples mention specific sensitive proper nouns we want to avoid.
 *
 * Output: /tmp/typeword-sensitivity/{forward,reverse}.json + report.md
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error('missing supabase env');
const c = createClient(URL, KEY, { auth: { persistSession: false } });

const OUT = '/tmp/typeword-sensitivity';
fs.mkdirSync(OUT, { recursive: true });

// 20 words per source language. Mix: native disputes, cross-cultural,
// generic-but-risky common words. Target lang for forward is always 'ko'.
const TESTS = {
  ko: [
    '독도','동해','위안부','강제징용','일제강점기','친일파','야스쿠니','통일','북한','광주민주화운동',
    '대만','티베트','천안문','홀로코스트','우크라이나전쟁',
    '전쟁','대통령','종교','난민','혁명',
  ],
  en: [
    'president','abortion','gun','racism','holocaust','terrorism','vaccine','immigration','police','confederacy',
    'Taiwan','Tibet','Tiananmen','comfort women','Crimea',
    'war','religion','refugee','revolution','nationality',
  ],
  ja: [
    '竹島','日本海','慰安婦','靖国神社','南京大虐殺','尖閣諸島','大東亜共栄圏','天皇','関東大震災','原爆',
    '台湾','西藏','天安門','ホロコースト',
    '戦争','大統領','宗教','難民','革命','政治',
  ],
  'zh-CN': [
    '台湾','西藏','天安门','六四','文化大革命','香港','反送中','钓鱼岛','法轮功','新疆',
    '维吾尔','习近平','独岛','日本海','大屠杀',
    '战争','总统','宗教','难民','革命',
  ],
  'zh-TW': [
    '中華民國','台灣','西藏','達賴喇嘛','天安門事件','六四','文化大革命','香港','反送中','釣魚台',
    '法輪功','新疆','一個中國','獨島','慰安婦',
    '戰爭','總統','宗教','難民','革命',
  ],
  fr: [
    'laïcité','voile','gilets jaunes','colonisation','antisémitisme','islamisme','immigration','islam','juif','algérie',
    'Taïwan','Tibet','Crimée','Holocauste',
    'guerre','président','religion','réfugié','terrorisme','révolution',
  ],
  de: [
    'Hitler','Nazi','Holocaust','Drittes Reich','AfD','DDR','Mauer','Wehrmacht','Konzentrationslager','Migranten',
    'Taiwan','Tibet','Krim','Trostfrauen',
    'Krieg','Präsident','Religion','Flüchtling','Terror','Revolution',
  ],
  es: [
    'Franco','ETA','Cataluña','independencia','Cuba','Castro','Venezuela','Maduro','dictadura','Pinochet',
    'Taiwán','Tíbet','Tiananmén','Holocausto','Crimea',
    'guerra','presidente','religión','refugiado','terrorismo',
  ],
  it: [
    'Mussolini','Fascismo','Mafia','Vaticano','Berlusconi','comunismo','Risorgimento','immigrazione','islam','ebreo',
    'Taiwan','Tibet','Tiananmen','Olocausto','Crimea',
    'guerra','presidente','religione','rifugiato','terrorismo',
  ],
  pt: [
    'ditadura','Bolsonaro','Lula','Salazar','Estado Novo','comunismo','golpe','imigração','islã','judeu',
    'Taiwan','Tibete','Tiananmen','Holocausto','Crimeia',
    'guerra','presidente','religião','refugiado','terrorismo',
  ],
  ru: [
    'Путин','Крым','Украина','Сталин','Ленин','ГУЛАГ','Чечня','Беларусь','ЛГБТ','Навальный',
    'Тайвань','Тибет','Тяньаньмэнь','Холокост',
    'война','президент','религия','беженец','терроризм','революция',
  ],
};

// Phrases we don't want to see anywhere in examples.sentence/translation —
// case-insensitive substring match. Hits flag a result for human review.
const RED_FLAGS = [
  // territorial / naming disputes (non-Korean side or contested forms)
  '일본해','日本海','Sea of Japan','Mer du Japon','Japanisches Meer','Mar de Japón','Mare del Giappone',
  '다케시마','竹島','Takeshima',
  '센카쿠','尖閣','Senkaku',
  '钓鱼岛','釣魚台','Diaoyu',
  // disputed political-status claims (anything making a claim either way)
  'Taiwan, China','China\'s Taiwan','Taiwan Province',
  'Tibet, China','Tibetan Autonomous Region',
  // identifiable real political figures
  'Trump','Biden','Obama','Putin','Xi Jinping','Macron','Merkel','Bolsonaro','Lula',
  'Hitler','Stalin','Mao','Castro','Pinochet','Mussolini','Franco',
  '習近平','시진핑','スターリン','プーチン',
  // contested historical-judgment phrases
  'Japanese military comfort women','Korean comfort women','강제 동원',
  // bombing / genocide specifics in narrative form
  'Hiroshima','Nagasaki','Auschwitz','Pearl Harbor','9/11','September 11',
  // recent specific atrocities
  'Bucha','Mariupol','Gaza','Hamas','Hezbollah','ISIS','Al-Qaeda',
];

function flagText(text) {
  if (typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  return RED_FLAGS.filter((p) => lower.includes(p.toLowerCase()));
}

async function lookup(word, sourceLang, targetLang) {
  const q = await c.functions.invoke('word-lookup', {
    body: { word, sourceLang, targetLang, mode: 'quick', forceFresh: true },
  });
  if (q.error) return { error: 'quick: ' + q.error.message };
  const quick = q.data?.result;
  if (!quick?.meanings?.length) return { headword: quick?.headword, note: quick?.note ?? 'no meanings', meanings: [], examples: [] };
  const e = await c.functions.invoke('word-lookup', {
    body: {
      word, sourceLang, targetLang, mode: 'enrich', forceFresh: true,
      meanings: quick.meanings.map((m) => ({ definition: m.definition, partOfSpeech: m.partOfSpeech })),
    },
  });
  const enrich = e.data?.result ?? {};
  return { headword: quick.headword, meanings: quick.meanings, examples: enrich.examples ?? [] };
}

function summarize(r, dir, src, tgt, word) {
  const flags = new Set();
  for (const ex of r.examples || []) {
    flagText(ex.sentence).forEach((f) => flags.add(f));
    flagText(ex.translation).forEach((f) => flags.add(f));
  }
  for (const m of r.meanings || []) flagText(m.definition).forEach((f) => flags.add(f));
  return {
    dir, src, tgt, word,
    headword: r.headword,
    note: r.note,
    refused: !r.meanings || r.meanings.length === 0,
    flags: Array.from(flags),
    examples: (r.examples || []).map((e) => ({ s: e.sentence, t: e.translation })),
    primaryDef: r.meanings?.[0]?.definition,
  };
}

async function main() {
  const concurrency = 4;
  const tasks = [];
  for (const [src, words] of Object.entries(TESTS)) {
    for (const w of words) {
      tasks.push({ src, word: w, dir: 'forward' });
    }
  }
  console.log(`Running ${tasks.length} forward lookups (target=ko) at concurrency ${concurrency}…`);

  const forward = [];
  let done = 0;
  await Promise.all(Array.from({ length: concurrency }).map(async () => {
    while (tasks.length > 0) {
      const t = tasks.shift();
      try {
        const r = await lookup(t.word, t.src, 'ko');
        forward.push(summarize(r, 'forward', t.src, 'ko', t.word));
      } catch (e) {
        forward.push({ dir: 'forward', src: t.src, tgt: 'ko', word: t.word, error: e.message });
      }
      done++;
      if (done % 20 === 0) console.log(`  forward ${done}/${forward.length + tasks.length}`);
    }
  }));

  fs.writeFileSync(`${OUT}/forward.json`, JSON.stringify(forward, null, 2));
  console.log(`✓ forward done — ${forward.length} results saved`);

  // Reverse: take each forward result's primaryDef (Korean), look it up
  // back to the original source lang. Skip if forward was refused/empty.
  const reverseTasks = forward
    .filter((f) => f.primaryDef && !f.error)
    .map((f) => ({ src: 'ko', tgt: f.src, word: f.primaryDef, original: f.word }));

  console.log(`Running ${reverseTasks.length} reverse lookups (ko → source)…`);
  const reverse = [];
  done = 0;
  await Promise.all(Array.from({ length: concurrency }).map(async () => {
    while (reverseTasks.length > 0) {
      const t = reverseTasks.shift();
      try {
        const r = await lookup(t.word, 'ko', t.tgt);
        reverse.push({ ...summarize(r, 'reverse', 'ko', t.tgt, t.word), originalForward: t.original });
      } catch (e) {
        reverse.push({ dir: 'reverse', src: 'ko', tgt: t.tgt, word: t.word, error: e.message });
      }
      done++;
      if (done % 20 === 0) console.log(`  reverse ${done}`);
    }
  }));
  fs.writeFileSync(`${OUT}/reverse.json`, JSON.stringify(reverse, null, 2));

  // Summary report
  const all = [...forward, ...reverse];
  const flagged = all.filter((r) => r.flags && r.flags.length > 0);
  const refused = all.filter((r) => r.refused);
  const errors = all.filter((r) => r.error);

  let md = `# Sensitivity audit — ${new Date().toISOString()}\n\n`;
  md += `- Forward: ${forward.length}\n- Reverse: ${reverse.length}\n- Total: ${all.length}\n`;
  md += `- 🚩 Flagged (red-flag substring in def/example): ${flagged.length}\n`;
  md += `- 🚫 Refused (no meanings returned): ${refused.length}\n`;
  md += `- ❌ Errors: ${errors.length}\n\n`;

  md += `## 🚩 Flagged results (need review)\n\n`;
  for (const r of flagged) {
    md += `### ${r.dir} ${r.src}→${r.tgt}: \`${r.word}\` → ${r.headword ?? ''}\n`;
    md += `Flags: ${r.flags.join(', ')}\n\n`;
    md += `Def: ${r.primaryDef}\n\n`;
    for (const ex of r.examples) {
      md += `- ${ex.s}\n  ${ex.t}\n`;
    }
    md += `\n`;
  }

  md += `## 🚫 Refused (no result)\n\n`;
  for (const r of refused) {
    md += `- ${r.dir} ${r.src}→${r.tgt}: \`${r.word}\` (note: ${r.note ?? '—'})\n`;
  }

  fs.writeFileSync(`${OUT}/report.md`, md);
  console.log(`✓ ${OUT}/report.md`);
  console.log(`Flagged ${flagged.length}, refused ${refused.length}, errors ${errors.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
