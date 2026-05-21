// Test post-process fixes by simulating production stitch logic on raw
// AI output. Verifies G1/G2 split + J1 year reading correction at the
// user-facing layer.

import {
  splitPolysemyCollapse,
  fixEnglishYearReading,
  translatePos,
} from "../../supabase/functions/_shared/stitch.ts";

// Simulated raw AI output (from previous spot-verify, the bad cases)
const cases = [
  {
    name: "G1 KO 배 → zh-CN (collapse)",
    word: "배",
    src: "ko",
    tgt: "zh-CN",
    canonical: [
      { partOfSpeech: "명사", definition: "배, 배(과일), 배(배)", relevanceScore: 80 },
      { partOfSpeech: "명사", definition: "배(배수), 배(승수)", relevanceScore: 60 },
    ],
    translated: [
      { partOfSpeech: "명사", definition: "肚子,梨,船" },
      { partOfSpeech: "명사", definition: "乘,倍" },
    ],
  },
  {
    name: "G2 KO 배 → de (collapse)",
    word: "배",
    src: "ko",
    tgt: "de",
    canonical: [
      { partOfSpeech: "명사", definition: "배, 배, 배", relevanceScore: 80 },
    ],
    translated: [
      { partOfSpeech: "명사", definition: "Bauch, Birne, Schiff" },
    ],
  },
  {
    name: "J1 ZH 1984 → en (digit-by-digit)",
    word: "1984",
    src: "zh-CN",
    tgt: "en",
    canonical: [
      { partOfSpeech: "数词", definition: "一九八四", relevanceScore: 80 },
      { partOfSpeech: "专有名词", definition: "小说", relevanceScore: 70 },
    ],
    translated: [
      { partOfSpeech: "numeral", definition: "one nine eight four" },
      { partOfSpeech: "proper noun", definition: "novel" },
    ],
  },
  {
    name: "Synonym list NOT collapsed (control)",
    word: "친구",
    src: "ko",
    tgt: "en",
    canonical: [
      { partOfSpeech: "명사", definition: "친구", relevanceScore: 80 },
    ],
    translated: [
      { partOfSpeech: "noun", definition: "friend, companion" },
    ],
  },
];

console.log("Post-process spot test (G1/G2/J1)\n");
for (const c of cases) {
  console.log(`=== ${c.name} ===`);
  console.log(`Input canonical: ${c.canonical.map((m) => `(${m.partOfSpeech}) ${m.definition}`).join(" | ")}`);
  console.log(`Input translated: ${c.translated.map((m) => `(${m.partOfSpeech}) ${m.definition}`).join(" | ")}`);

  const split = splitPolysemyCollapse(c.canonical, c.translated);
  const fixedTrans = fixEnglishYearReading(c.word, c.src, c.tgt, split.translated);

  console.log(`Output canonical: ${split.meanings.map((m) => `(${m.partOfSpeech}) ${m.definition}`).join(" | ")}`);
  console.log(`Output translated: ${fixedTrans.map((m) => `(${m.partOfSpeech}) ${m.definition}`).join(" | ")}`);
  console.log(``);
}
