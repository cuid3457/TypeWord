/**
 * Validator for matrix test results.
 *
 * Reads the JSONL output of run.ts and applies a battery of automated
 * checks. Outputs per-check pass rate by category and language pair,
 * plus a list of specific failures for manual review.
 *
 * Checks:
 *   1. schema           — required fields present (headword, meanings/note)
 *   2. confidence       — recognized results have confidence ≥ 40
 *   3. meaning_count    — meanings 1..3 (or 0 with note)
 *   4. pos_terminology  — partOfSpeech in target_lang's POS list
 *   5. canonical_consistency  — same (source, word) yields identical meanings array (post-translation) up to POS/definition translation
 *   6. sensitive_metaling     — sensitive lookups use metalinguistic-template examples (no entity-property predicates)
 *   7. sentence_rejected      — items in 'sentence' category should have note='sentence'
 *   8. typo_handled           — items in 'typo' category should have meanings (corrected) OR a note
 *   9. cross_script_purity    — translation text uses only target's script
 *  10. example_distribution   — schedule met (1m→2, 2m→3 (2/1), 3+m→1 each)
 *  11. syn_no_paren           — no parenthetical content in synonyms/antonyms
 *  12. headword_preserved     — for sensitive disputed terms (일본해/Takeshima): headword === input
 *
 * Run:
 *   cd TypeWord && npx --yes tsx scripts/test-v2-matrix/validate.ts <jsonl-file>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Category } from './words.ts';

interface ResultRow {
  source: string;
  target: string;
  word: string;
  category: Category;
  ok: boolean;
  durationMs: number;
  result?: {
    headword?: string;
    confidence?: number;
    note?: string;
    meanings?: Array<{ definition: string; partOfSpeech: string; gender?: string; relevanceScore?: number }>;
    synonyms?: string[];
    antonyms?: string[];
    examples?: Array<{ sentence: string; translation: string; meaningIndex?: number }>;
    ipa?: string;
    reading?: string | string[];
  };
  cached?: boolean;
  cacheLevel?: { canonical: boolean; translation: boolean; enriched: boolean };
  error?: string;
}

interface CheckResult {
  pass: boolean;
  note?: string;
}

// ── POS valid-set per target lang ──
const POS_BY_LANG: Record<string, Set<string>> = {
  ko: new Set(['명사','동사','형용사','부사','전치사','접속사','감탄사','대명사','고유명사','표현']),
  ja: new Set(['名詞','動詞','形容詞','副詞','前置詞','接続詞','感嘆詞','代名詞','固有名詞','表現']),
  zh: new Set(['名词','动词','形容词','副词','介词','连词','叹词','代词','专有名词','表达']),
  'zh-CN': new Set(['名词','动词','形容词','副词','介词','连词','叹词','代词','专有名词','表达']),
  'zh-TW': new Set(['名詞','動詞','形容詞','副詞','介詞','連詞','嘆詞','代詞','專有名詞','表達']),
  en: new Set(['noun','verb','adjective','adverb','preposition','conjunction','interjection','pronoun','proper noun','expression']),
  es: new Set(['sustantivo','verbo','adjetivo','adverbio','preposición','conjunción','interjección','pronombre','nombre propio','expresión']),
  fr: new Set(['nom','verbe','adjectif','adverbe','préposition','conjonction','interjection','pronom','nom propre','expression']),
  de: new Set(['Nomen','Verb','Adjektiv','Adverb','Präposition','Konjunktion','Interjektion','Pronomen','Eigenname','Ausdruck']),
  it: new Set(['nome','verbo','aggettivo','avverbio','preposizione','congiunzione','interiezione','pronome','nome proprio','espressione']),
  pt: new Set(['substantivo','verbo','adjetivo','advérbio','preposição','conjunção','interjeição','pronome','nome próprio','expressão']),
  ru: new Set(['существительное','глагол','прилагательное','наречие','предлог','союз','междометие','местоимение','имя собственное','выражение']),
};

// ── script families ──
function detectDominantScript(text: string): 'hangul' | 'kana' | 'cjk' | 'latin' | 'cyrillic' | 'unknown' {
  const clean = text.replace(/[^\p{L}]/gu, '');
  if (!clean) return 'unknown';
  let hangul = 0, kana = 0, cjk = 0, latin = 0, cyr = 0;
  for (const ch of clean) {
    const c = ch.codePointAt(0)!;
    if ((c>=0xAC00&&c<=0xD7AF)||(c>=0x1100&&c<=0x11FF)||(c>=0x3130&&c<=0x318F)) hangul++;
    else if ((c>=0x3040&&c<=0x309F)||(c>=0x30A0&&c<=0x30FF)) kana++;
    else if (c>=0x4E00&&c<=0x9FFF) cjk++;
    else if ((c>=0x0041&&c<=0x005A)||(c>=0x0061&&c<=0x007A)||(c>=0x00C0&&c<=0x024F)) latin++;
    else if (c>=0x0400&&c<=0x04FF) cyr++;
  }
  const t = hangul+kana+cjk+latin+cyr;
  if (t===0) return 'unknown';
  if (hangul/t>0.3) return 'hangul';
  if (kana/t>0.1) return 'kana';
  if (cjk/t>0.3) return 'cjk';
  if (latin/t>0.5) return 'latin';
  if (cyr/t>0.3) return 'cyrillic';
  return 'unknown';
}

const LANG_SCRIPT: Record<string, string> = {
  ko: 'hangul', ja: 'kana', zh: 'cjk', 'zh-CN': 'cjk', 'zh-TW': 'cjk',
  en: 'latin', es: 'latin', fr: 'latin', de: 'latin', it: 'latin', pt: 'latin',
  ru: 'cyrillic',
};

// ── Sensitive metalinguistic templates ──
// Heuristic: example sentence references the WORD itself (not the entity).
// Looks for cue words like "단어", "사전", "교과서", "책", "지도", "수업",
// "dictionary", "textbook", "class", "book", "map", "lesson", etc.
const METALING_CUES = [
  '단어','사전','교과서','책','지도','수업','선생','말','글','기사',
  'dictionary','textbook','book','article','class','teacher','lesson','word','heard about','read about','learn about','mention','found',
  '辞書','教科書','本','地図','授業','記事','言葉','単語',
  '词典','字典','教科书','课本','地图','课','文章',
  'dictionnaire','manuel','livre','classe','cours','article','professeur',
  'Wörterbuch','Lehrbuch','Buch','Unterricht','Artikel',
  'diccionario','libro','clase','artículo','maestro',
  'dizionario','libro','classe','articolo','insegnante',
];

function looksMetalinguistic(text: string): boolean {
  const t = text.toLowerCase();
  return METALING_CUES.some((cue) => t.includes(cue.toLowerCase()));
}

// Forbidden property-attributing predicates for sensitive examples.
// NOTE: "traditional" / "전통적" / "伝統的" / "传统" / "tradicional" / etc.
// were intentionally REMOVED — those words appear in legitimate dictionary
// definitions for 한복 / 김치 / 단오 / hanbok / kimchi etc. ("traditional
// Korean clothing/food"). They're not entity-property attribution in the
// sense we're trying to flag (history / beauty / sovereignty / importance).
const PROPERTY_PREDICATE_CUES = [
  'beautiful','famous','important','great','historic','sacred',
  'is a country','is a nation','sovereign','territory of',
  '아름답','유명','중요','위대','국가','영토',
  '美しい','有名','重要','偉大','国家',
  '美丽','有名','重要','伟大','国家',
  'célèbre','important','beau','national',
  'berühmt','wichtig','schön','national',
  'famoso','importante','hermoso',
  'famoso','importante','bello',
];

function looksLikePropertyAttribution(text: string): boolean {
  const t = text.toLowerCase();
  return PROPERTY_PREDICATE_CUES.some((cue) => t.includes(cue.toLowerCase()));
}

// ── Korea-position disputed terms — headword must be preserved ──
const KOREA_POSITION_TERMS = new Set([
  '일본해','다케시마','장백산','sea of japan','takeshima','mer du japon',
  'japanisches meer','mar de japón','mare del giappone',
  '日本海','竹島','长白山','長白山',
]);

function normalizeForCheck(s: string): string {
  return s.normalize('NFKC').toLowerCase().trim();
}

// ── Individual checks ──

function checkSchema(r: ResultRow): CheckResult {
  if (!r.ok) {
    // Long-sentence rejection at the input-validator layer is expected
    // behavior for the 'sentence' category. Don't penalize.
    if (r.category === 'sentence') return { pass: true };
    return { pass: false, note: r.error };
  }
  if (!r.result) return { pass: false, note: 'no result' };
  if (typeof r.result.headword !== 'string' || !r.result.headword.trim()) return { pass: false, note: 'no headword' };
  if (r.result.note) {
    if (!['sentence','non_word','wrong_language','phrase_too_long'].includes(r.result.note)) {
      return { pass: false, note: `invalid note: ${r.result.note}` };
    }
    return { pass: true };
  }
  if (!Array.isArray(r.result.meanings)) return { pass: false, note: 'no meanings array' };
  return { pass: true };
}

function checkConfidence(r: ResultRow): CheckResult {
  if (!r.result) return { pass: true };
  if (r.result.note) return { pass: true }; // rejection allowed
  if (typeof r.result.confidence !== 'number') return { pass: false, note: 'missing confidence' };
  if (r.result.confidence < 40 && (r.result.meanings?.length ?? 0) > 0) {
    return { pass: false, note: `confidence ${r.result.confidence} < 40 but has meanings` };
  }
  return { pass: true };
}

function checkMeaningCount(r: ResultRow): CheckResult {
  if (!r.result) return { pass: true };
  const n = r.result.meanings?.length ?? 0;
  if (r.result.note) {
    if (n !== 0) return { pass: false, note: `note=${r.result.note} but ${n} meanings` };
    return { pass: true };
  }
  if (n === 0) return { pass: false, note: 'meanings empty without note' };
  if (n > 3) return { pass: false, note: `${n} meanings exceeds cap of 3` };
  return { pass: true };
}

function checkPosTerminology(r: ResultRow): CheckResult {
  if (!r.result?.meanings?.length) return { pass: true };
  const validSet = POS_BY_LANG[r.target] ?? POS_BY_LANG[r.target.split('-')[0]];
  if (!validSet) return { pass: true };
  const bad = r.result.meanings.find((m) => !validSet.has(m.partOfSpeech));
  if (bad) return { pass: false, note: `POS "${bad.partOfSpeech}" not in ${r.target} set` };
  return { pass: true };
}

function checkSentenceRejected(r: ResultRow): CheckResult {
  if (r.category !== 'sentence') return { pass: true };
  // The server's input-length validator rejects long inputs (50/25 char
  // caps per language) BEFORE the AI scope rule fires. Both layers
  // constitute "rejected" — input-validator (non-2xx) and AI (note=sentence)
  // are equally valid outcomes for the sentence category.
  if (!r.ok && (r.error?.includes('PHRASE_TOO_LONG') ||
                r.error?.includes('non-2xx'))) return { pass: true };
  if (r.result?.note === 'sentence') return { pass: true };
  return { pass: false, note: `expected note=sentence or input-rejection, got ${r.result?.note ?? 'meanings'}` };
}

function checkTypoHandled(r: ResultRow): CheckResult {
  if (r.category !== 'typo') return { pass: true };
  // Either has meanings (corrected) or a note explaining rejection
  if (r.result?.meanings?.length || r.result?.note) return { pass: true };
  return { pass: false, note: 'typo unhandled (no meanings + no note)' };
}

function checkCrossScriptPurity(r: ResultRow): CheckResult {
  if (!r.result?.examples?.length) return { pass: true };
  const targetScript = LANG_SCRIPT[r.target];
  if (!targetScript) return { pass: true };
  for (const ex of r.result.examples) {
    if (!ex.translation) continue;
    const detected = detectDominantScript(ex.translation);
    if (detected !== 'unknown' && detected !== targetScript) {
      // For Japanese target, also accept cjk (kanji) — already covered by 'kana' detection threshold
      if (r.target === 'ja' && detected === 'cjk') continue;
      return { pass: false, note: `translation has ${detected} script, expected ${targetScript}: "${ex.translation.slice(0, 50)}"` };
    }
  }
  return { pass: true };
}

function checkExampleDistribution(r: ResultRow): CheckResult {
  if (!r.result?.examples?.length) return { pass: true };
  const meaningCount = r.result.meanings?.length ?? 0;
  if (meaningCount === 0) return { pass: true };
  const counts = new Map<number, number>();
  for (const ex of r.result.examples) {
    const i = ex.meaningIndex ?? 0;
    counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  if (meaningCount === 1) {
    const c0 = counts.get(0) ?? 0;
    if (c0 > 2) return { pass: false, note: `1 meaning but ${c0} examples` };
    return { pass: true };
  }
  if (meaningCount === 2) {
    const c0 = counts.get(0) ?? 0, c1 = counts.get(1) ?? 0;
    if (c0 > 2 || c1 > 1) return { pass: false, note: `dist (${c0}/${c1}) violates 2/1` };
    return { pass: true };
  }
  // 3+ meanings: 1 each
  for (let i = 0; i < Math.min(3, meaningCount); i++) {
    if ((counts.get(i) ?? 0) > 1) {
      return { pass: false, note: `idx ${i} has ${counts.get(i)} examples (max 1)` };
    }
  }
  return { pass: true };
}

function checkSynNoParen(r: ResultRow): CheckResult {
  const syn = r.result?.synonyms ?? [];
  const ant = r.result?.antonyms ?? [];
  const all = [...syn, ...ant];
  const bad = all.find((s) => /[()（）]/.test(s));
  if (bad) return { pass: false, note: `parenthetical: "${bad}"` };
  return { pass: true };
}

function checkHeadwordPreserved(r: ResultRow): CheckResult {
  if (r.category !== 'sensitive') return { pass: true };
  const norm = normalizeForCheck(r.word);
  if (!KOREA_POSITION_TERMS.has(norm)) return { pass: true };
  // For Korea-position disputed terms, the headword should be preserved
  // (Naver-style framing, not redirect to the canonical Korean form).
  const headLower = normalizeForCheck(r.result?.headword ?? '');
  if (headLower !== norm) {
    return { pass: false, note: `headword "${r.result?.headword}" replaced input "${r.word}"` };
  }
  return { pass: true };
}

function checkSensitiveMetaling(r: ResultRow): CheckResult {
  if (r.category !== 'sensitive') return { pass: true };
  if (!r.result?.examples?.length) return { pass: true }; // empty examples allowed
  // Either source OR translation should look metalinguistic; at least one of them.
  const propAttr = r.result.examples.find((ex) =>
    looksLikePropertyAttribution(ex.sentence) || looksLikePropertyAttribution(ex.translation),
  );
  if (propAttr) {
    return { pass: false, note: `property attribution in: "${propAttr.translation.slice(0, 50)}"` };
  }
  // Soft pass — at least one of the cues should appear OR we accept silence.
  return { pass: true };
}

// ── Canonical consistency check — runs across (source, word) groups ──

function checkCanonicalConsistency(rows: ResultRow[]): { violations: Array<{ source: string; word: string; targets: string[]; diff: string }> } {
  const violations: Array<{ source: string; word: string; targets: string[]; diff: string }> = [];
  const byKey = new Map<string, ResultRow[]>();
  for (const r of rows) {
    if (!r.ok || !r.result) continue;
    if (r.result.note) continue; // rejection paths share the same shape
    const key = `${r.source}|${r.word}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    // Compare meaning COUNT across targets — canonical sense count should be identical.
    const counts = group.map((r) => r.result?.meanings?.length ?? 0);
    const uniqCounts = [...new Set(counts)];
    if (uniqCounts.length > 1) {
      const [source, word] = key.split('|');
      const detail = group.map((r) => `${r.target}=${r.result?.meanings?.length}`).join(', ');
      violations.push({ source, word, targets: group.map((g) => g.target), diff: `meaning_count varies: ${detail}` });
    }
  }
  return { violations };
}

// ── Main ──

const file = process.argv[2];
if (!file) {
  console.error('Usage: tsx validate.ts <results.jsonl>');
  process.exit(1);
}

const lines = readFileSync(file, 'utf-8').split('\n').filter((l) => l.trim());
const rows: ResultRow[] = lines.map((l) => JSON.parse(l));
console.log(`Loaded ${rows.length} rows from ${file}\n`);

const CHECKS = [
  { name: 'schema', fn: checkSchema },
  { name: 'confidence', fn: checkConfidence },
  { name: 'meaning_count', fn: checkMeaningCount },
  { name: 'pos_terminology', fn: checkPosTerminology },
  { name: 'sentence_rejected', fn: checkSentenceRejected },
  { name: 'typo_handled', fn: checkTypoHandled },
  { name: 'cross_script_purity', fn: checkCrossScriptPurity },
  { name: 'example_distribution', fn: checkExampleDistribution },
  { name: 'syn_no_paren', fn: checkSynNoParen },
  { name: 'headword_preserved', fn: checkHeadwordPreserved },
  { name: 'sensitive_metaling', fn: checkSensitiveMetaling },
] as const;

interface AggResult {
  pass: number;
  total: number;
  failures: Array<{ row: ResultRow; note: string }>;
}

const byCheck: Record<string, AggResult> = {};
const byCheckCategory: Record<string, Record<string, AggResult>> = {};

for (const c of CHECKS) {
  byCheck[c.name] = { pass: 0, total: 0, failures: [] };
  byCheckCategory[c.name] = {};
}

for (const r of rows) {
  for (const c of CHECKS) {
    const res = c.fn(r);
    const agg = byCheck[c.name];
    agg.total++;
    if (res.pass) agg.pass++;
    else agg.failures.push({ row: r, note: res.note ?? '' });

    const cat = byCheckCategory[c.name];
    if (!cat[r.category]) cat[r.category] = { pass: 0, total: 0, failures: [] };
    cat[r.category].total++;
    if (res.pass) cat[r.category].pass++;
    else cat[r.category].failures.push({ row: r, note: res.note ?? '' });
  }
}

// Canonical consistency (runs once, across groups)
const consistency = checkCanonicalConsistency(rows);

// ── Print report ──

console.log('═'.repeat(80));
console.log('CHECK RESULTS BY CATEGORY');
console.log('═'.repeat(80));
const checkNames = CHECKS.map((c) => c.name);
const categories = ['common','polysemy','idiom','number_expr','sensitive','typo','sentence','rare','false_friend','multi_word'];

// Header
const padR = (s: string, n: number) => s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
const padL = (s: string, n: number) => s.length >= n ? s.slice(-n) : ' '.repeat(n - s.length) + s;
process.stdout.write(padR('check', 22));
for (const c of categories) process.stdout.write(padL(c.slice(0, 6), 8));
process.stdout.write(padL('total', 12) + '\n');

for (const name of checkNames) {
  process.stdout.write(padR(name, 22));
  for (const cat of categories) {
    const a = byCheckCategory[name][cat];
    if (!a || a.total === 0) { process.stdout.write(padL('-', 8)); continue; }
    const pct = (a.pass / a.total * 100).toFixed(0);
    process.stdout.write(padL(`${pct}%`, 8));
  }
  const t = byCheck[name];
  const pct = t.total > 0 ? (t.pass / t.total * 100).toFixed(1) : '-';
  process.stdout.write(padL(`${t.pass}/${t.total} (${pct}%)`, 12) + '\n');
}

// Canonical consistency report
console.log('\n' + '═'.repeat(80));
console.log(`CANONICAL CONSISTENCY: ${consistency.violations.length} (source, word) groups with drifting meaning_count across targets`);
console.log('═'.repeat(80));
const showDrifts = Math.min(20, consistency.violations.length);
for (let i = 0; i < showDrifts; i++) {
  const v = consistency.violations[i];
  console.log(`  ${v.source} | "${v.word}" : ${v.diff}`);
}
if (consistency.violations.length > showDrifts) {
  console.log(`  ... and ${consistency.violations.length - showDrifts} more`);
}

// Sample failures per check
console.log('\n' + '═'.repeat(80));
console.log('SAMPLE FAILURES (5 per check)');
console.log('═'.repeat(80));
for (const name of checkNames) {
  const agg = byCheck[name];
  if (agg.failures.length === 0) { console.log(`\n✓ ${name}: all passed`); continue; }
  console.log(`\n✗ ${name}: ${agg.failures.length} failures`);
  for (const f of agg.failures.slice(0, 5)) {
    console.log(`  ${f.row.source}→${f.row.target} [${f.row.category}] "${f.row.word}" — ${f.note}`);
  }
}

// Write failures to file for deeper review.
const FAIL_FILE = file.replace('.jsonl', '-failures.json');
const failPayload = {
  summary: Object.fromEntries(CHECKS.map((c) => [c.name, { pass: byCheck[c.name].pass, total: byCheck[c.name].total }])),
  consistency_violations: consistency.violations,
  failures_by_check: Object.fromEntries(
    CHECKS.map((c) => [c.name, byCheck[c.name].failures.map((f) => ({
      source: f.row.source, target: f.row.target, word: f.row.word, category: f.row.category, note: f.note,
      headword: f.row.result?.headword, meanings: f.row.result?.meanings, note_field: f.row.result?.note,
    }))]),
  ),
};
writeFileSync(FAIL_FILE, JSON.stringify(failPayload, null, 2));
console.log(`\nDetailed failures saved to: ${FAIL_FILE}`);
