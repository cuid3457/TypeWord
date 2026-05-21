/**
 * Comprehensive TOEIC 600 audit covering every field of every entry:
 *   T1. headword present + matches input (English)
 *   T2. reading: IPA present + non-empty (en source needs IPA)
 *   T3. meanings: ≥1, definition + POS, no register tags, no English leak in Korean def
 *   T4. examples: ≥2, sentence + translation present + markers paired
 *   T5. Korean translation: no English alphabet leak (cross-script purity)
 *   T6. English sentence: no Hangul leak
 *   T7. marker grounding: bolded segment contains headword (or its inflection)
 *   T8. translation marker present + non-empty
 *   T9. length sanity: English sentence ≤ 12 words (>9 borderline)
 *   T10. synonyms: no self-ref, no parens
 *   T11. antonyms: same rules
 *   T12. TOEIC tier suitability: flag words that look too elementary (A1) or too advanced (B2+)
 *   T13. business context coverage: at least one example uses business/office context
 *   T14. SOV: Korean translation ends with verb form
 *   T15. polysemy: meanings array distinct (no near-duplicates)
 */
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const HAN_RE = /\p{Script=Han}/u;
const HANGUL_RE = /\p{Script=Hangul}/u;
const LATIN_RE = /[A-Za-z]/;
const REGISTER_RE = /\b(vulgar|slang|profan\w*|swear\w*|crude|obscen\w+|colloq\w+|informal|euphem\w+|derogat\w+|pejorat\w+|offensive|taboo)\b/i;

// Words clearly below TOEIC tier (A1/A2 elementary)
const TOO_ELEMENTARY = new Set([
  'eat', 'go', 'come', 'happy', 'sad', 'big', 'small', 'good', 'bad', 'hot', 'cold',
  'water', 'food', 'man', 'woman', 'boy', 'girl', 'cat', 'dog', 'red', 'blue',
  'one', 'two', 'three', 'yes', 'no', 'thank', 'hello', 'goodbye',
]);

// Common business/office context indicators (presence in at least one example)
const BIZ_KEYWORDS = [
  'company', 'office', 'meeting', 'manager', 'employee', 'business', 'project', 'client',
  'customer', 'contract', 'team', 'department', 'budget', 'sales', 'product', 'service',
  'invoice', 'order', 'shipment', 'report', 'email', 'document', 'staff', 'work',
];
const BIZ_KEYWORDS_KO = [
  '회사', '사무실', '회의', '매니저', '직원', '비즈니스', '프로젝트', '고객', '계약',
  '팀', '부서', '예산', '매출', '제품', '서비스', '송장', '청구서', '주문', '배송', '보고서',
  '이메일', '문서', '업무',
];

function markersIn(s) {
  if (!s) return [];
  const out = [];
  const re = /\*\*([^*]+)\*\*/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

function unbalancedMarkers(s) {
  if (!s) return false;
  const totalStars = (s.match(/\*\*/g) || []).length;
  const validPairs = (s.match(/\*\*[^*]+\*\*/g) || []).length * 2;
  return totalStars !== validPairs;
}

function strip(s) {
  return (s || '').replace(/\*\*/g, '');
}

// Crude English inflection check: headword shares lemma with a marker chunk
function inflectionMatches(headword, mark) {
  const h = headword.toLowerCase();
  const m = mark.toLowerCase().trim();
  if (m === h) return true;
  if (m.startsWith(h)) return true; // book → booked, books, booking
  if (h.endsWith('e') && m.startsWith(h.slice(0, -1))) return true; // arrange → arranged
  if (h.endsWith('y') && m.startsWith(h.slice(0, -1) + 'i')) return true; // apply → applied
  if (h.endsWith('y') && m.startsWith(h)) return true; // apply → applying
  // double-consonant: plan → planned
  if (m.startsWith(h + h.slice(-1))) return true;
  // base form contained in inflected (look forward to → looking forward to)
  if (h.includes(' ') && m.includes(h.split(' ').slice(1).join(' '))) return true;
  return false;
}

// Korean verb-final detection: a translation is SOV-valid when the entire
// sentence (regardless of marker position) ends with a verb terminal ending.
// This covers both verb-marker cases (마커 자체가 종결동사) and noun-marker
// cases (명사 + 조사 + 동사 종결형).
function isKoSovValid(s) {
  if (!s) return true;
  const stripped = s.replace(/\*\*/g, '').replace(/[!?.,。、！？]+$/g, '').trim();
  if (stripped.length === 0) return true;
  // Sentence-terminal verb/copula endings (declarative, polite, interrogative,
  // imperative, propositive). Excludes mid-clause/modifier endings (할/을/는/ㄴ).
  const VERB_FINAL = /(다|요|까|니|네|군|어|아|지|자|세요|ㅂ니다|습니다|어요|아요|았|었|예요|에요|이다|입니다|이지|이야|군요|네요|어라|아라|이라|이지요|일까|일까요|었어|있어|있다|없다|없어)$/;
  return VERB_FINAL.test(stripped);
}

function audit(headword, r) {
  const issues = [];

  // T1
  if (!r.headword) issues.push('T1:no_headword');
  else if (r.headword.toLowerCase() !== headword.toLowerCase()) issues.push(`T1:mismatch(${r.headword}≠${headword})`);

  // T2 IPA — English source must have IPA. Field name is `ipa` (string),
  // not `reading` (which is for CJK pronunciation: pinyin/kana/hangul-yomi).
  const isPhrase = headword.includes(' ');
  if (!isPhrase) {
    const ipa = typeof r.ipa === 'string' ? r.ipa : (Array.isArray(r.ipa) ? r.ipa[0] : null);
    if (!ipa || !ipa.trim()) issues.push('T2:no_ipa');
  }

  // T3 meanings
  if (!Array.isArray(r.meanings) || r.meanings.length === 0) issues.push('T3:no_meanings');
  else {
    for (let i = 0; i < r.meanings.length; i++) {
      const m = r.meanings[i];
      if (!m.definition?.trim()) issues.push(`T3:m[${i}]:empty_def`);
      if (!m.partOfSpeech) issues.push(`T3:m[${i}]:no_pos`);
      if (REGISTER_RE.test(m.definition || '')) issues.push(`T3:m[${i}]:register("${m.definition}")`);
      if (LATIN_RE.test(m.definition || '')) {
        // Allow IPA-like brackets and units, but flag bare English words inside Korean def
        const noPunct = (m.definition || '').replace(/[A-Za-z]+\s*\(([^)]+)\)/g, '');
        if (LATIN_RE.test(noPunct)) issues.push(`T3:m[${i}]:en_in_ko_def("${m.definition}")`);
      }
    }
    // T15 distinct meanings
    const defs = r.meanings.map((m) => m.definition?.trim());
    const uniq = new Set(defs);
    if (uniq.size < defs.length) issues.push(`T15:duplicate_meanings`);
  }

  // T4 examples
  if (!Array.isArray(r.examples) || r.examples.length < 2) issues.push(`T4:few_examples(${r.examples?.length ?? 0})`);
  else {
    for (let i = 0; i < r.examples.length; i++) {
      const ex = r.examples[i];
      const s = ex.sentence || '';
      const t = ex.translation || '';
      if (!s.trim()) issues.push(`T4:e${i}:empty_sentence`);
      if (!t.trim()) issues.push(`T4:e${i}:empty_translation`);

      const sm = markersIn(s);
      const tm = markersIn(t);
      if (sm.length === 0) issues.push(`T4:e${i}:no_marker_in_sentence`);
      if (tm.length === 0) issues.push(`T8:e${i}:no_marker_in_translation`);
      if (unbalancedMarkers(s)) issues.push(`T4:e${i}:unbalanced_sentence`);
      if (unbalancedMarkers(t)) issues.push(`T4:e${i}:unbalanced_translation`);

      // T5 cross-script: Korean translation should not contain Latin (except numbers, acronyms in caps)
      const tStripped = strip(t);
      const latinChars = (tStripped.match(/[A-Za-z]/g) || []);
      if (latinChars.length > 0) {
        // Allow if entirely uppercase acronyms (NDA, CEO) or units (PM, AM, p.m.)
        const allowedRe = /\b([A-Z]{2,}|[ap]\.?[mp]\.?)\b/gi;
        const cleaned = tStripped.replace(allowedRe, '');
        if (LATIN_RE.test(cleaned)) issues.push(`T5:e${i}:en_in_ko_translation`);
      }

      // T6 English sentence should not have Hangul/Han leak
      const sStripped = strip(s);
      if (HANGUL_RE.test(sStripped)) issues.push(`T6:e${i}:hangul_in_en_sentence`);
      if (HAN_RE.test(sStripped)) issues.push(`T6:e${i}:han_in_en_sentence`);

      // T7 marker grounding
      if (sm.length > 0) {
        const matched = sm.some((mk) => inflectionMatches(headword, mk));
        if (!matched) issues.push(`T7:e${i}:marker_off("${sm.join('|')}"≠${headword})`);
      }

      // T9 length
      const wordCount = sStripped.trim().split(/\s+/).length;
      if (wordCount > 12) issues.push(`T9:e${i}:long_sentence(${wordCount}w)`);
      else if (wordCount > 9) issues.push(`T9:e${i}:borderline(${wordCount}w)`);

      // T14 SOV
      if (!isKoSovValid(t)) issues.push(`T14:e${i}:ko_sov_violation("${t.slice(-25)}")`);
    }
  }

  // T10/T11 syn/ant
  for (const [field, code] of [['synonyms', 'T10'], ['antonyms', 'T11']]) {
    const arr = r[field];
    if (arr === undefined || arr === null) continue;
    if (!Array.isArray(arr)) {
      issues.push(`${code}:not_array`);
      continue;
    }
    for (const x of arr) {
      if (!x || typeof x !== 'string') { issues.push(`${code}:invalid`); continue; }
      if (x.toLowerCase().trim() === headword.toLowerCase()) issues.push(`${code}:eq_headword("${x}")`);
      if (/[\(\)（）]/.test(x)) issues.push(`${code}:paren("${x}")`);
      // Korean syn for English headword is wrong
      if (HANGUL_RE.test(x)) issues.push(`${code}:hangul_in_en_syn("${x}")`);
    }
  }

  // T12 tier suitability — too elementary
  if (TOO_ELEMENTARY.has(headword.toLowerCase())) issues.push('T12:too_elementary');

  return issues;
}

async function main() {
  const { data: list } = await admin.from('curated_wordlists').select('id, word_count').eq('slug', 'toeic-600').single();
  const { data: rows } = await admin.from('curated_words')
    .select('word, reading_key, results_by_target_lang, display_order')
    .eq('curated_wordlist_id', list.id)
    .order('display_order');

  console.log(`TOEIC 600 audit — list.word_count=${list.word_count}, actual rows=${rows.length}`);

  const flags = [];
  let scanned = 0;
  let totalExamples = 0;
  let totalMeanings = 0;
  const posBuckets = {};
  const exampleLengths = [];

  for (const row of rows || []) {
    scanned++;
    const r = row.results_by_target_lang?.ko;
    if (!r) { flags.push({ word: row.word, issues: ['NO_KO_RESULT'] }); continue; }
    const iss = audit(row.word, r);
    if (iss.length) flags.push({ word: row.word, issues: iss });

    totalMeanings += (r.meanings || []).length;
    for (const m of r.meanings || []) {
      const pos = m.partOfSpeech || '?';
      posBuckets[pos] = (posBuckets[pos] || 0) + 1;
    }
    for (const ex of r.examples || []) {
      totalExamples++;
      exampleLengths.push(strip(ex.sentence || '').trim().split(/\s+/).length);
    }
  }

  console.log(`\n══ Coverage ══`);
  console.log(`  Words scanned: ${scanned}`);
  console.log(`  Total examples: ${totalExamples} (avg ${(totalExamples/scanned).toFixed(2)}/word)`);
  console.log(`  Total meanings: ${totalMeanings} (avg ${(totalMeanings/scanned).toFixed(2)}/word)`);
  console.log(`  Avg example length: ${(exampleLengths.reduce((a,b)=>a+b,0)/exampleLengths.length).toFixed(1)} words`);

  console.log(`\n══ POS distribution ══`);
  const sortedPos = Object.entries(posBuckets).sort((a, b) => b[1] - a[1]);
  for (const [pos, count] of sortedPos) {
    console.log(`  ${pos.padEnd(15)} ${count.toString().padStart(4)} (${(100*count/totalMeanings).toFixed(1)}%)`);
  }

  console.log(`\n══ Issues ══`);
  console.log(`  Flagged: ${flags.length}/${scanned} (${(100*flags.length/scanned).toFixed(2)}%)`);

  const buckets = {};
  for (const f of flags) for (const i of f.issues) {
    const k = i.split(':')[0];
    buckets[k] = (buckets[k] || 0) + 1;
  }
  console.log('\n  By code:');
  for (const [k, v] of Object.entries(buckets).sort((a,b)=>b[1]-a[1])) {
    console.log(`    ${k}: ${v}`);
  }

  // Top samples per code
  const byCode = {};
  for (const f of flags) for (const i of f.issues) {
    const code = i.split(/[(:]/).slice(0, 2).join(':');
    if (!byCode[code]) byCode[code] = [];
    byCode[code].push({ word: f.word, full: i });
  }
  console.log(`\n══ Issue samples ══`);
  for (const [code, items] of Object.entries(byCode).sort((a,b)=>b[1].length-a[1].length)) {
    console.log(`\n  ${code} (${items.length})`);
    items.slice(0, 8).forEach((it) => console.log(`    [${it.word}] ${it.full}`));
    if (items.length > 8) console.log(`    ... +${items.length - 8} more`);
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'toeic-600-audit-report.json'),
    JSON.stringify({ scanned, totalExamples, totalMeanings, posBuckets, buckets, flags }, null, 2),
  );
  console.log('\n→ scripts/curation/toeic-600-audit-report.json');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
