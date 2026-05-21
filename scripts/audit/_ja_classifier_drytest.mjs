// Dry-run classifier sanity check — no API calls.
// node --experimental-strip-types scripts/audit/_ja_classifier_drytest.mjs
import { classifyJaInput } from "../../supabase/functions/_shared/prompts-v3-ja.ts";

const CASES = [
  ["42", "number_symbol"],
  ["1984", "number_symbol"],
  ["@", "number_symbol"],
  ["NHK", "number_symbol"],

  ["よろしくお願いします", "set_expression"],
  ["いただきます", "set_expression"],
  ["ありがとう", "set_expression"],
  ["お疲れ様です", "set_expression"],

  ["食べる", "verb_adj"],
  ["美しい", "verb_adj"],
  ["する", "verb_adj"],
  ["見る", "verb_adj"],

  ["コーヒー", "katakana_only"],
  ["マンション", "katakana_only"],
  ["クレーム", "katakana_only"],
  ["アメリカ", "katakana_only"],

  ["水", "single_kanji"],
  ["月", "single_kanji"],
  ["人", "single_kanji"],
  ["一", "single_kanji"],

  ["日本語", "simple_word"],
  ["学校", "simple_word"],
  ["元気", "simple_word"],
  ["お茶", "simple_word"],
];

let pass = 0, fail = 0;
for (const [word, expected] of CASES) {
  const actual = classifyJaInput(word);
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "  OK " : "FAIL "} ${word.padEnd(22)} → ${actual.padEnd(15)} (expected ${expected})`);
}
console.log(`\n${pass} pass / ${fail} fail / ${CASES.length} total`);
process.exit(fail === 0 ? 0 : 1);
