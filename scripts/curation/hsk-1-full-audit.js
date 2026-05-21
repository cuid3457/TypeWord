/**
 * Comprehensive HSK 1 audit covering every field of every entry:
 *  H1. headword present and matches input
 *  H2. reading (pinyin) present, format consistent
 *  H3. meanings: ≥1, has definition+POS, no register markers (slang/vulgar)
 *  H4. examples: ≥1, sentence + translation present + markers paired
 *  H5. cross-script leakage: zh-CN sentence ok, but ko translation MUST be
 *      entirely Hangul + ASCII punct (no Han residue from source)
 *  H6. en translation: no Han residue, no Hangul leakage
 *  H7. marker grounding: bolded segment in sentence contains the headword
 *  H8. translation marker present
 *  H9. length sanity (CJK ≤14)
 *  H10. synonyms array, no headword self-ref, no parens
 *  H11. antonyms same rules
 *  H12. example sentence does not over-rely on advanced vocab — flag if
 *      sentence > 12 chars (heuristic)
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
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const REGISTER_RE = /\b(vulgar|slang|profan\w*|swear\w*|crude|obscen\w+|intensifier|colloq\w+|informal|euphem\w+|derogat\w+|pejorat\w+|offensive|taboo)\b/i;

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

function audit(headword, lang, r) {
  const issues = [];
  if (!r.headword) issues.push('H1:no_headword');
  if (r.headword && r.headword !== headword) issues.push(`H1:headword_mismatch(${r.headword}≠${headword})`);

  // H2 reading
  if (!Array.isArray(r.reading) || r.reading.length === 0 || !r.reading[0]) {
    issues.push('H2:no_reading');
  }

  // H3 meanings
  if (!Array.isArray(r.meanings) || r.meanings.length === 0) issues.push('H3:no_meanings');
  else {
    for (let i = 0; i < r.meanings.length; i++) {
      const m = r.meanings[i];
      if (!m.definition?.trim()) issues.push(`H3:m[${i}]:empty_def`);
      if (!m.partOfSpeech) issues.push(`H3:m[${i}]:no_pos`);
      if (REGISTER_RE.test(m.definition || '')) {
        issues.push(`H3:m[${i}]:register("${m.definition}")`);
      }
    }
  }

  // H4 examples
  if (!Array.isArray(r.examples) || r.examples.length === 0) issues.push('H4:no_examples');
  else {
    for (let i = 0; i < r.examples.length; i++) {
      const ex = r.examples[i];
      const s = ex.sentence || '';
      const t = ex.translation || '';
      if (!s.trim()) issues.push(`H4:e${i}:empty_sentence`);
      if (!t.trim()) issues.push(`H4:e${i}:empty_translation`);

      // Markers
      const sm = markersIn(s);
      const tm = markersIn(t);
      if (sm.length === 0) issues.push(`H4:e${i}:no_marker_in_sentence`);
      if (tm.length === 0) issues.push(`H8:e${i}:no_marker_in_translation`);
      if (unbalancedMarkers(s)) issues.push(`H4:e${i}:unbalanced_sentence`);
      if (unbalancedMarkers(t)) issues.push(`H4:e${i}:unbalanced_translation`);

      // Cross-script leakage
      const tStripped = strip(t);
      if (lang === 'ko') {
        const han = [...tStripped].filter((c) => HAN_RE.test(c));
        if (han.length > 0) issues.push(`H5:e${i}:han_in_ko_translation([${han.join('')}])`);
        const kana = [...tStripped].filter((c) => KANA_RE.test(c));
        if (kana.length > 0) issues.push(`H5:e${i}:kana_in_ko_translation`);
      }
      if (lang === 'en') {
        const han = [...tStripped].filter((c) => HAN_RE.test(c));
        if (han.length > 0) issues.push(`H6:e${i}:han_in_en_translation`);
        const hangul = [...tStripped].filter((c) => HANGUL_RE.test(c));
        if (hangul.length > 0) issues.push(`H6:e${i}:hangul_in_en_translation`);
      }

      // H7 marker grounding (zh-CN: bolded chunk contains the headword
      // OR an inflected/composite form. For HSK 1 most words are
      // single-character or 2-char compounds — exact substring is fine.)
      if (sm.length > 0) {
        const matched = sm.some((mk) => mk.includes(headword) || headword.includes(mk));
        if (!matched) issues.push(`H7:e${i}:marker_off("${sm.join('|')}"≠${headword})`);
      }

      // H9 length
      const sLen = strip(s).length;
      if (sLen > 14) issues.push(`H9:e${i}:long_sentence(${sLen})`);

      // H12 difficult-vocab heuristic: HSK 1 sentences should ideally be ≤12
      if (sLen > 12 && sLen <= 14) issues.push(`H12:e${i}:borderline_long(${sLen})`);
    }
  }

  // H10/H11 syn/ant
  for (const [field, code] of [['synonyms', 'H10'], ['antonyms', 'H11']]) {
    const arr = r[field];
    if (arr === undefined || arr === null) continue;
    if (!Array.isArray(arr)) {
      issues.push(`${code}:not_array(${typeof arr})`);
      continue;
    }
    for (const x of arr) {
      if (!x || typeof x !== 'string') { issues.push(`${code}:invalid_entry`); continue; }
      if (x.trim() === headword) issues.push(`${code}:eq_headword("${x}")`);
      if (/[\(\)（）]/.test(x)) issues.push(`${code}:paren("${x}")`);
    }
  }

  return issues;
}

async function main() {
  const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', 'hsk-1').single();
  const { data: rows } = await admin.from('curated_words')
    .select('word, reading_key, results_by_target_lang')
    .eq('curated_wordlist_id', list.id);

  const flags = [];
  let scanned = 0;
  for (const row of rows || []) {
    const langs = Object.keys(row.results_by_target_lang || {});
    for (const lang of langs) {
      scanned++;
      const r = row.results_by_target_lang[lang];
      const iss = audit(row.word, lang, r);
      if (iss.length) flags.push({ word: row.word, rk: row.reading_key, lang, issues: iss });
    }
  }
  console.log(`Scanned: ${scanned}`);
  console.log(`Flagged: ${flags.length} (${(100*flags.length/scanned).toFixed(2)}%)`);

  const buckets = {};
  for (const f of flags) for (const i of f.issues) {
    const k = i.split(':')[0];
    buckets[k] = (buckets[k] || 0) + 1;
  }
  console.log('\nBy code:');
  console.table(buckets);

  // Show samples grouped by code
  const byCode = {};
  for (const f of flags) for (const i of f.issues) {
    const code = i.split(/[(:]/).slice(0, 2).join(':');
    if (!byCode[code]) byCode[code] = [];
    byCode[code].push({ word: f.word, lang: f.lang, full: i });
  }
  console.log('\nSamples:');
  for (const [code, items] of Object.entries(byCode).sort((a,b)=>b[1].length-a[1].length)) {
    console.log(`\n  ${code} (${items.length})`);
    items.slice(0, 6).forEach(it => console.log(`    [${it.lang}] ${it.word}: ${it.full}`));
    if (items.length > 6) console.log(`    ... +${items.length - 6} more`);
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'hsk-1-full-audit-report.json'),
    JSON.stringify({ scanned, flagsCount: flags.length, buckets, flags }, null, 2),
  );
  console.log('\nReport → scripts/curation/hsk-1-full-audit-report.json');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
