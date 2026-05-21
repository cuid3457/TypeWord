// Sample representative pairs from comprehensive audit JSON for manual
// quality review. Output: scripts/audit/comprehensive-sample-review.md
//
// Selection strategy (deterministic, no randomness):
//   - Each (source, category) → pick the 8 source's first 2-3 words
//   - For each picked (source, word) → all 7 non-self targets
//   - Plus all typo+edge cases across all 7 targets (these matter most)

import * as fs from "node:fs";
import * as path from "node:path";

const dir = path.resolve(import.meta.dirname ?? __dirname);
const data = JSON.parse(fs.readFileSync(path.join(dir, "comprehensive-audit-2026-05-19.json"), "utf8"));

// Group by source+word
const byPair = new Map();
for (const r of data) {
  const k = `${r.source}|${r.word}|${r.category}`;
  if (!byPair.has(k)) byPair.set(k, []);
  byPair.get(k).push(r);
}

// Selection: for each source, sample carefully
const ALL_SOURCES = ["ko", "en", "ja", "zh-CN", "es", "fr", "de", "it"];
const TARGETS = ["en", "ja", "zh-CN", "es", "fr", "de", "it"];

// Per-category sample size — heavier on edge cases / typos
const PER_CAT = {
  common: 2,       // 2 words per source per cat
  polysemy: 2,
  typos: 3,        // CRITICAL — was model designed for typo handling?
  edges: 3,        // CRITICAL — was model designed for sentence-like / loanword / honorific
  numbers: 2,
  propers: 2,
};

const selected = [];
for (const src of ALL_SOURCES) {
  for (const [cat, limit] of Object.entries(PER_CAT)) {
    const wordsInCat = [];
    for (const r of data) {
      if (r.source === src && r.category === cat) {
        if (!wordsInCat.includes(r.word)) wordsInCat.push(r.word);
        if (wordsInCat.length >= limit) break;
      }
    }
    for (const word of wordsInCat) {
      // All 7 non-self targets for this (source, word)
      for (const tgt of TARGETS) {
        if (tgt === src) continue;
        const found = data.find((r) => r.source === src && r.word === word && r.target === tgt);
        if (found) selected.push(found);
      }
    }
  }
}

console.log(`Selected ${selected.length} pairs for review.`);

// Output as readable markdown
const lines = [];
lines.push(`# Comprehensive sample review — 2026-05-19`);
lines.push(``);
lines.push(`Sample size: ${selected.length} pairs (8 sources × 6 categories × 2-3 words × 7 targets)`);
lines.push(`Review dimensions: naturalness / over-padding / accuracy / register matching / edge-case handling`);
lines.push(``);

let curSrc = "", curCat = "";
for (const r of selected) {
  if (r.source !== curSrc) {
    lines.push(`# Source: ${r.source}`);
    lines.push(``);
    curSrc = r.source;
    curCat = "";
  }
  if (r.category !== curCat) {
    lines.push(`## Category: ${r.category}`);
    lines.push(``);
    curCat = r.category;
  }

  const q = r.quick ?? {};
  const ex = r.examples?.examples ?? [];
  const sa = r.synant ?? {};

  lines.push(`### ${r.source} → ${r.target}: \`${r.word}\` (case=${r.case})`);
  lines.push(``);
  if (q.note) lines.push(`note: \`${q.note}\``);
  if (q.headword) {
    const readingStr = Array.isArray(q.reading) && q.reading.length > 0 ? ` [${q.reading.join(", ")}]` : "";
    const ipaStr = q.ipa ? ` /${q.ipa}/` : "";
    lines.push(`headword: \`${q.headword}\`${readingStr}${ipaStr}`);
  }
  for (let i = 0; i < (q.meanings ?? []).length; i++) {
    const m = q.meanings[i];
    const mt = (q.meanings_translated ?? [])[i];
    lines.push(`- [${i}] (${m.partOfSpeech}) ${m.definition}  →  (${mt?.partOfSpeech ?? "—"}) ${mt?.definition ?? "—"}`);
  }
  if (ex.length > 0) {
    lines.push(`examples:`);
    for (const e of ex) lines.push(`  - [m=${e.meaning_index}] ${e.sentence}`);
  }
  if ((sa.synonyms ?? []).length > 0) lines.push(`syn: ${(sa.synonyms ?? []).map((s) => `\`${s}\``).join(", ")}`);
  if ((sa.antonyms ?? []).length > 0) lines.push(`ant: ${(sa.antonyms ?? []).map((s) => `\`${s}\``).join(", ")}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
}

fs.writeFileSync(path.join(dir, "comprehensive-sample-review.md"), lines.join("\n"));
console.log(`Wrote: comprehensive-sample-review.md (${lines.length} lines)`);
