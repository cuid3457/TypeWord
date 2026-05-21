// Reprocess existing cross-target audit JSON to measure user-facing
// POS accuracy AFTER stitch.translatePos normalization (including the
// newly-added POS_ALIASES for Substantiv / sostantivo / nombre / etc.).
//
// No new API calls — reads cross-target-audit-2026-05-19.json from
// disk and re-derives the post-stitch metrics with the latest aliases.

import * as fs from "node:fs";
import * as path from "node:path";
import { POS_BY_LANG } from "../../supabase/functions/_shared/prompts-v3.ts";
import { translatePos } from "../../supabase/functions/_shared/stitch.ts";

const jsonPath = path.resolve(
  import.meta.dirname ?? __dirname,
  "cross-target-audit-2026-05-19.json",
);
const rows = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

function parseTargetPosSet(target) {
  const posStr = POS_BY_LANG[target] ?? POS_BY_LANG[target.split("-")[0]] ?? "";
  return new Set(posStr.split("/").map((s) => s.trim()).filter(Boolean));
}

let rawCount = 0, stitchCount = 0, total = 0, errors = 0;
const remainingFailures = [];

for (const r of rows) {
  if (r.error) { errors++; continue; }
  const tSet = parseTargetPosSet(r.target);
  for (let i = 0; i < (r.translatedPOS ?? []).length; i++) {
    total++;
    const raw = r.translatedPOS[i] ?? "";
    const stitch = translatePos(raw, r.target);
    const rawOk = tSet.has(raw.trim());
    const stitchOk = tSet.has(stitch.trim());
    if (rawOk) rawCount++;
    if (stitchOk) stitchCount++;
    if (!stitchOk) {
      remainingFailures.push({
        source: r.source, target: r.target, word: r.word,
        index: i, raw, stitch,
        def: (r.translatedDef ?? [])[i],
      });
    }
  }
}

console.log(`Cross-target audit reprocess with updated POS_ALIASES:\n`);
console.log(`Total POS slots: ${total} (across ${rows.length - errors} pairs)`);
console.log(`Raw AI output in target POS list: ${rawCount}/${total} = ${(rawCount / total * 100).toFixed(1)}%`);
console.log(`Post-stitch (user-facing) in target list: ${stitchCount}/${total} = ${(stitchCount / total * 100).toFixed(1)}%`);
console.log(`Errors: ${errors}`);
console.log(``);

if (remainingFailures.length > 0) {
  console.log(`Remaining failures after stitch (user-facing issues):\n`);
  for (const f of remainingFailures) {
    console.log(`  [${f.source} → ${f.target}] "${f.word}"[${f.index}]: raw="${f.raw}" → stitch="${f.stitch}" | def="${f.def}"`);
  }
} else {
  console.log(`No remaining user-facing failures — stitch normalization handles all variants.`);
}
