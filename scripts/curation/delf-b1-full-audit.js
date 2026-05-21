/**
 * Comprehensive DELF B1 audit (4 parts) — sentence-level checks lint can't catch.
 *   B1.  headword present + matches input (French)
 *   B2.  IPA present (fr source carries IPA)
 *   B3.  meanings ≥1, definition + POS, no register tags
 *   B4.  examples ≥2, sentence + translation present + markers paired
 *   B5.  Korean translation: no LATIN alphabet leak (외래어 한글 음역은 OK)
 *   B7.  marker grounding (with French inflection awareness)
 *   B8.  translation marker present
 *   B9.  length sanity: ≤10 words target (>10 borderline, >14 long)
 *   B10. synonyms: no self-ref, no parens, no Hangul leak
 *   B11. antonyms: same rules
 *   B14. SOV: Korean translation ends with verb terminal ending
 *   B15. polysemy distinct
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

const HANGUL_RE = /\p{Script=Hangul}/u;
const LATIN_RE = /[A-Za-z]/;
const REGISTER_RE = /\b(vulgar|slang|profan\w*|swear\w*|crude|obscen\w+|colloq\w+|informal|euphem\w+|derogat\w+|pejorat\w+|offensive|taboo)\b/i;

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

// French inflection: relax matching so passé composé / reflexive / plural /
// accord don't count as marker_off. Strategy: strip headword reflexive prefix
// (se/s'/me/m'/te/t') and gender suffixes (e/es/ées etc.), then check whether
// the marker chunk shares a strong stem with the headword.
function frenchStem(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/^(s'|se |me |m'|te |t'|le |la |l'|les |un |une |des |du |de )/i, '')
    .replace(/(é|ée|és|ées|er|ir|re|ant|ait|ais|aient|era|eront|erais|erait|eraient)$/i, '')
    .replace(/[^a-zàâäéèêëïîôöùûüç]/gi, '');
}

function inflectionMatches(headword, mark) {
  const hLower = headword.toLowerCase().trim();
  const mLower = mark.toLowerCase().trim();
  if (mLower === hLower) return true;
  if (mLower.includes(hLower) || hLower.includes(mLower)) return true;
  // Strip articles + reflexive markers, compare stems
  const hStem = frenchStem(hLower);
  const mStem = frenchStem(mLower);
  if (hStem.length >= 3 && mStem.length >= 3) {
    if (mStem.includes(hStem) || hStem.includes(mStem)) return true;
    // Allow shared first 4 letters (covers most conjugation: parler → parlons/parlez/parlait)
    if (hStem.length >= 4 && mStem.length >= 4 && hStem.slice(0, 4) === mStem.slice(0, 4)) return true;
  }
  // Multi-word headword (e.g. "à condition que", "il y a"): require any content word match
  if (hLower.includes(' ')) {
    const contentParts = hLower.split(' ').filter((w) => w.length >= 3);
    if (contentParts.some((w) => mLower.includes(w))) return true;
  }
  return false;
}

function isKoSovValid(s) {
  if (!s) return true;
  const stripped = s.replace(/\*\*/g, '').replace(/[!?.,。、！？]+$/g, '').trim();
  if (stripped.length === 0) return true;
  const VERB_FINAL = /(다|요|까|니|네|군|어|아|지|자|세요|ㅂ니다|습니다|어요|아요|았|었|예요|에요|이다|입니다|이지|이야|군요|네요|어라|아라|이라|이지요|일까|일까요|었어|있어|있다|없다|없어)$/;
  return VERB_FINAL.test(stripped);
}

function audit(headword, r) {
  const issues = [];

  // B1
  if (!r.headword) issues.push('B1:no_headword');
  else if (r.headword.toLowerCase().trim() !== headword.toLowerCase().trim()) issues.push(`B1:mismatch(${r.headword}≠${headword})`);

  // B2 IPA — French source carries IPA (single tokens). Multi-word phrases skip.
  const isPhrase = headword.includes(' ');
  if (!isPhrase) {
    const ipa = typeof r.ipa === 'string' ? r.ipa : (Array.isArray(r.ipa) ? r.ipa[0] : null);
    if (!ipa || !ipa.trim()) issues.push('B2:no_ipa');
  }

  // B3 meanings
  if (!Array.isArray(r.meanings) || r.meanings.length === 0) issues.push('B3:no_meanings');
  else {
    for (let i = 0; i < r.meanings.length; i++) {
      const m = r.meanings[i];
      if (!m.definition?.trim()) issues.push(`B3:m[${i}]:empty_def`);
      if (!m.partOfSpeech) issues.push(`B3:m[${i}]:no_pos`);
      if (REGISTER_RE.test(m.definition || '')) issues.push(`B3:m[${i}]:register("${m.definition}")`);
    }
    // B15 distinct meanings
    const defs = r.meanings.map((m) => m.definition?.trim());
    const uniq = new Set(defs);
    if (uniq.size < defs.length) issues.push('B15:duplicate_meanings');
  }

  // B4 examples
  if (!Array.isArray(r.examples) || r.examples.length < 2) issues.push(`B4:few_examples(${r.examples?.length ?? 0})`);
  else {
    for (let i = 0; i < r.examples.length; i++) {
      const ex = r.examples[i];
      const s = ex.sentence || '';
      const t = ex.translation || '';
      if (!s.trim()) issues.push(`B4:e${i}:empty_sentence`);
      if (!t.trim()) issues.push(`B4:e${i}:empty_translation`);

      const sm = markersIn(s);
      const tm = markersIn(t);
      if (sm.length === 0) issues.push(`B4:e${i}:no_marker_in_sentence`);
      if (tm.length === 0) issues.push(`B8:e${i}:no_marker_in_translation`);
      if (unbalancedMarkers(s)) issues.push(`B4:e${i}:unbalanced_sentence`);
      if (unbalancedMarkers(t)) issues.push(`B4:e${i}:unbalanced_translation`);

      // B5 cross-script: Korean translation should not contain Latin alphabet
      // (Korean borrowed words like 스튜디오 are written in Hangul — Latin
      // chars in the translation are leaks). Allow uppercase acronyms (CEO,
      // NDA) and AM/PM markers.
      const tStripped = strip(t);
      const latinChars = (tStripped.match(/[A-Za-z]/g) || []);
      if (latinChars.length > 0) {
        const allowedRe = /\b([A-Z]{2,}|[ap]\.?[mp]\.?)\b/gi;
        const cleaned = tStripped.replace(allowedRe, '');
        if (LATIN_RE.test(cleaned)) issues.push(`B5:e${i}:latin_in_ko_translation`);
      }

      // B7 marker grounding (with French inflection awareness)
      if (sm.length > 0) {
        const matched = sm.some((mk) => inflectionMatches(headword, mk));
        if (!matched) issues.push(`B7:e${i}:marker_off("${sm.join('|')}"≠${headword})`);
      }

      // B9 length
      const sStripped = strip(s);
      const wordCount = sStripped.trim().split(/\s+/).length;
      if (wordCount > 14) issues.push(`B9:e${i}:long_sentence(${wordCount}w)`);
      else if (wordCount > 10) issues.push(`B9:e${i}:borderline(${wordCount}w)`);

      // B14 SOV
      if (!isKoSovValid(t)) issues.push(`B14:e${i}:ko_sov_violation("${t.slice(-25)}")`);
    }
  }

  // B10/B11 syn/ant
  for (const [field, code] of [['synonyms', 'B10'], ['antonyms', 'B11']]) {
    const arr = r[field];
    if (arr === undefined || arr === null) continue;
    if (!Array.isArray(arr)) {
      issues.push(`${code}:not_array`);
      continue;
    }
    for (const x of arr) {
      if (!x || typeof x !== 'string') { issues.push(`${code}:invalid`); continue; }
      if (x.toLowerCase().trim() === headword.toLowerCase().trim()) issues.push(`${code}:eq_headword("${x}")`);
      if (/[\(\)（）]/.test(x)) issues.push(`${code}:paren("${x}")`);
      if (HANGUL_RE.test(x)) issues.push(`${code}:hangul_in_fr_syn("${x}")`);
    }
  }

  return issues;
}

async function main() {
  const slugs = ['delf-b1-part-1', 'delf-b1-part-2', 'delf-b1-part-3', 'delf-b1-part-4'];
  const allFlags = [];
  let totalScanned = 0, totalEx = 0, totalMeanings = 0;
  const exampleLengths = [];

  for (const slug of slugs) {
    const { data: list } = await admin.from('curated_wordlists').select('id, word_count').eq('slug', slug).single();
    const { data: rows } = await admin.from('curated_words')
      .select('word, results_by_target_lang')
      .eq('curated_wordlist_id', list.id);
    console.log(`\n${slug}: word_count=${list.word_count}, rows=${rows.length}`);

    for (const row of rows || []) {
      totalScanned++;
      const r = row.results_by_target_lang?.ko;
      if (!r) { allFlags.push({ slug, word: row.word, issues: ['NO_KO_RESULT'] }); continue; }
      const iss = audit(row.word, r);
      if (iss.length) allFlags.push({ slug, word: row.word, issues: iss });
      totalMeanings += (r.meanings || []).length;
      for (const ex of r.examples || []) {
        totalEx++;
        exampleLengths.push(strip(ex.sentence || '').trim().split(/\s+/).length);
      }
    }
  }

  console.log(`\n══ Coverage (4 parts) ══`);
  console.log(`  Words scanned: ${totalScanned}`);
  console.log(`  Total examples: ${totalEx} (avg ${(totalEx/totalScanned).toFixed(2)}/word)`);
  console.log(`  Total meanings: ${totalMeanings} (avg ${(totalMeanings/totalScanned).toFixed(2)}/word)`);
  console.log(`  Avg example length: ${(exampleLengths.reduce((a,b)=>a+b,0)/exampleLengths.length).toFixed(1)} words`);

  console.log(`\n══ Issues ══`);
  console.log(`  Flagged: ${allFlags.length}/${totalScanned} (${(100*allFlags.length/totalScanned).toFixed(2)}%)`);

  const buckets = {};
  for (const f of allFlags) for (const i of f.issues) {
    const k = i.split(':')[0];
    buckets[k] = (buckets[k] || 0) + 1;
  }
  console.log('\n  By code:');
  for (const [k, v] of Object.entries(buckets).sort((a,b)=>b[1]-a[1])) {
    console.log(`    ${k}: ${v}`);
  }

  const byCode = {};
  for (const f of allFlags) for (const i of f.issues) {
    const code = i.split(/[(:]/).slice(0, 2).join(':');
    if (!byCode[code]) byCode[code] = [];
    byCode[code].push({ slug: f.slug, word: f.word, full: i });
  }
  console.log(`\n══ Issue samples ══`);
  for (const [code, items] of Object.entries(byCode).sort((a,b)=>b[1].length-a[1].length)) {
    console.log(`\n  ${code} (${items.length})`);
    items.slice(0, 8).forEach((it) => console.log(`    [${it.slug.replace('delf-b1-', '')}] ${it.word}: ${it.full}`));
    if (items.length > 8) console.log(`    ... +${items.length - 8} more`);
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'delf-b1-audit-report.json'),
    JSON.stringify({ totalScanned, totalEx, totalMeanings, buckets, flags: allFlags }, null, 2),
  );
  console.log('\n→ scripts/curation/delf-b1-audit-report.json');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
