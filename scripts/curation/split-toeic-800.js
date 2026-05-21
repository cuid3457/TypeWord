/**
 * Split toeic-800 (600 words) into two 300-word lists by TOEIC frequency.
 *
 *   toeic-800 (1)  — 300 high-frequency 800-level words (more often tested)
 *   toeic-800 (2)  — 300 lower-frequency 800-level words (still 800-level, less common)
 *
 * Uses OpenAI to score each word's TOEIC frequency in one batch, then sorts
 * and bisects. Original toeic-800.json is kept untouched; outputs are written
 * to data/toeic-800-1.json and data/toeic-800-2.json. Run curate-wordlist.js
 * on each output and deactivate the legacy toeic-800 row in Supabase.
 *
 * Usage:
 *   node scripts/curation/split-toeic-800.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing in .env.local');

const SRC = path.join(__dirname, 'data/toeic-800.json');
const OUT_1 = path.join(__dirname, 'data/toeic-800-1.json');
const OUT_2 = path.join(__dirname, 'data/toeic-800-2.json');

async function classifyByFrequency(words) {
  const prompt = `You are a TOEIC test prep expert.

Below are ${words.length} advanced English words for TOEIC 800-level prep. Score each by how frequently it appears in actual TOEIC tests (Listening + Reading) on a scale of 1-10:
- 10 = appears in nearly every TOEIC test
- 7-9 = common, students must know
- 4-6 = moderate frequency
- 1-3 = rare in TOEIC but still 800-level vocabulary

Return ONLY a JSON object mapping each word (lowercase) to its score. Example: {"accrual": 7, "acquisition": 9}

Words:
${words.join('\n')}`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}

const NAME_I18N_1 = {
  ko: 'TOEIC 800 (1)',
  en: 'TOEIC 800 (1)',
  ja: 'TOEIC 800 (1)',
  'zh-CN': '托业 800 (1)',
  'zh-TW': '多益 800 (1)',
  es: 'TOEIC 800 (1)',
  fr: 'TOEIC 800 (1)',
  de: 'TOEIC 800 (1)',
  it: 'TOEIC 800 (1)',
  pt: 'TOEIC 800 (1)',
  ru: 'TOEIC 800 (1)',
};
const NAME_I18N_2 = Object.fromEntries(
  Object.entries(NAME_I18N_1).map(([k, v]) => [k, v.replace('(1)', '(2)')]),
);

const DESC_I18N_1 = {
  ko: 'TOEIC 800점 핵심 빈출 어휘 (1단계). 자주 출제되는 중상급 비즈니스 어휘 300개 — 재무·법률·인사·전략·마케팅 핵심.',
  en: 'TOEIC 800 essentials Part 1 — 300 high-frequency upper-intermediate business words.',
  ja: 'TOEIC 800点コア頻出語彙（1）。よく出題される中上級ビジネス語彙300語。',
  'zh-CN': '托业 800 高频核心词（1）。常考的中高级商务词汇 300 个。',
};
const DESC_I18N_2 = {
  ko: 'TOEIC 800점 응용 어휘 (2단계). 가끔 출제되는 심화 비즈니스 어휘 300개 — 800점대 응용 단어 마무리.',
  en: 'TOEIC 800 advanced Part 2 — 300 lower-frequency 800-level business words.',
  ja: 'TOEIC 800点応用語彙（2）。時々出題される応用ビジネス語彙300語。',
  'zh-CN': '托业 800 应用进阶词（2）。偶尔出现的进阶商务词汇 300 个。',
};

async function main() {
  const t800 = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const words = t800.words.slice();
  console.log(`Source: ${words.length} words from ${SRC}`);

  console.log('Classifying by TOEIC frequency via OpenAI gpt-4o…');
  const scores = await classifyByFrequency(words);

  const missing = words.filter((w) => !(w.toLowerCase() in scores));
  if (missing.length > 0) {
    console.warn(`Warning: ${missing.length} words missing from response, defaulting to 5: ${missing.slice(0, 5).join(', ')}…`);
  }

  // Sort high → low frequency. Stable tiebreak by alphabetical to keep output
  // deterministic across re-runs.
  const sorted = words
    .map((w) => ({ w, s: scores[w.toLowerCase()] ?? 5 }))
    .sort((a, b) => (b.s - a.s) || a.w.localeCompare(b.w))
    .map(({ w }) => w);

  const part1 = sorted.slice(0, 300);
  const part2 = sorted.slice(300);

  if (part1.length !== 300 || part2.length !== 300) {
    throw new Error(`Unexpected split sizes: ${part1.length} / ${part2.length}`);
  }

  // Re-sort each half alphabetically so the in-app order isn't a "frequency
  // leak" that gives away which words are in part 1 vs part 2 by position.
  part1.sort((a, b) => a.localeCompare(b));
  part2.sort((a, b) => a.localeCompare(b));

  const base = {
    source_lang: t800.source_lang,
    exam_type: t800.exam_type,
    level: t800.level,
    category: t800.category,
    target_langs: t800.target_langs,
  };

  const spec1 = {
    ...base,
    slug: 'toeic-800-1',
    name_i18n: NAME_I18N_1,
    description_i18n: DESC_I18N_1,
    display_order: 31,
    words: part1,
  };
  const spec2 = {
    ...base,
    slug: 'toeic-800-2',
    name_i18n: NAME_I18N_2,
    description_i18n: DESC_I18N_2,
    display_order: 32,
    words: part2,
  };

  fs.writeFileSync(OUT_1, JSON.stringify(spec1, null, 2) + '\n');
  fs.writeFileSync(OUT_2, JSON.stringify(spec2, null, 2) + '\n');

  console.log(`✓ Wrote ${OUT_1} (300 high-frequency)`);
  console.log(`✓ Wrote ${OUT_2} (300 lower-frequency)`);

  // Show score distribution sample for sanity
  const top5 = sorted.slice(0, 5).map((w) => `${w}(${scores[w.toLowerCase()] ?? '-'})`);
  const bot5 = sorted.slice(-5).map((w) => `${w}(${scores[w.toLowerCase()] ?? '-'})`);
  console.log(`\nTop 5 by frequency: ${top5.join(', ')}`);
  console.log(`Bottom 5 by frequency: ${bot5.join(', ')}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
