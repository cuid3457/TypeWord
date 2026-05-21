// Dry-run ZH classifier sanity check — no API calls.
// node --experimental-strip-types scripts/audit/_zh_classifier_drytest.mjs
import { classifyZhInput } from "../../supabase/functions/_shared/prompts-v3-zh.ts";

const CASES = [
  ["42", "number_symbol"],
  ["1984", "number_symbol"],
  ["@", "number_symbol"],
  ["3.14", "number_symbol"],

  ["你好", "set_expression"],
  ["谢谢", "set_expression"],
  ["对不起", "set_expression"],
  ["再见", "set_expression"],

  ["一帆风顺", "chengyu_4char"],
  ["马马虎虎", "chengyu_4char"],
  ["中华民族", "chengyu_4char"],
  ["人民日报", "chengyu_4char"],

  ["水", "single_char"],
  ["月", "single_char"],
  ["人", "single_char"],
  ["一", "single_char"],

  ["CCTV", "latin_acronym"],
  ["NBA", "latin_acronym"],
  ["WTO", "latin_acronym"],
  ["BTS", "latin_acronym"],

  ["北京", "simple_word"],
  ["中国", "simple_word"],
  ["学校", "simple_word"],
  ["朋友", "simple_word"],
];

let pass = 0, fail = 0;
for (const [word, expected] of CASES) {
  const actual = classifyZhInput(word);
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "  OK " : "FAIL "} ${word.padEnd(22)} → ${actual.padEnd(15)} (expected ${expected})`);
}
console.log(`\n${pass} pass / ${fail} fail / ${CASES.length} total`);
process.exit(fail === 0 ? 0 : 1);
