// Split /tmp/topik2-words-final.json into 3 JSON specs matching TOPIK 1 shape.
const fs = require('fs');
const path = require('path');

const all = JSON.parse(fs.readFileSync('/tmp/topik2-words-final.json', 'utf8')).words;
if (all.length !== 900) {
  console.error(`Expected 900 words, got ${all.length}`);
  process.exit(1);
}

const PARTS = [
  { part: 1, range: [0, 300], display_order: 21 },
  { part: 2, range: [300, 600], display_order: 22 },
  { part: 3, range: [600, 900], display_order: 23 },
];

function spec(part, words, display_order) {
  return {
    slug: `topik-2-part-${part}`,
    name_i18n: {
      ko: `TOPIK 2급 (${part}/3)`,
      en: `TOPIK Level 2 (Part ${part}/3)`,
      'zh-CN': `TOPIK 2级 (${part}/3)`,
      ja: `TOPIK 2級 (${part}/3)`,
      es: `TOPIK Nivel 2 (${part}/3)`,
      fr: `TOPIK Niveau 2 (${part}/3)`,
      de: `TOPIK Stufe 2 (${part}/3)`,
      it: `TOPIK Livello 2 (${part}/3)`,
      pt: `TOPIK Nível 2 (${part}/3)`,
      ru: `TOPIK Уровень 2 (${part}/3)`,
    },
    description_i18n: {
      ko: `한국어능력시험 2급 핵심 어휘 300선 (${part}부 / 총 900단어)`,
      en: `TOPIK Level 2 core vocabulary, Part ${part} (300 of 900 words)`,
    },
    source_lang: 'ko',
    exam_type: 'TOPIK',
    level: '2',
    category: 'exam',
    display_order,
    target_langs: ['en'],
    words,
  };
}

for (const { part, range, display_order } of PARTS) {
  const slice = all.slice(range[0], range[1]);
  const s = spec(part, slice, display_order);
  const filePath = path.resolve(__dirname, `data/topik-2-part-${part}.json`);
  fs.writeFileSync(filePath, JSON.stringify(s, null, 2));
  console.log(`✓ ${filePath} — ${slice.length} words`);
}

console.log(`\nSamples from each part:`);
for (const { part, range } of PARTS) {
  const slice = all.slice(range[0], range[1]);
  console.log(`\n─ Part ${part} (idx ${range[0]+1}-${range[1]}) ─`);
  console.log(`  first 15: ${slice.slice(0,15).join(', ')}`);
  console.log(`  last 15:  ${slice.slice(-15).join(', ')}`);
}
