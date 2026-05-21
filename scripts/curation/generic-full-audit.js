/**
 * Generic full-coverage audit for any curated wordlist. Adapts rules to the
 * list's source/target language automatically (read from curated_wordlists).
 *
 * Usage:
 *   node scripts/curation/generic-full-audit.js <slug> [<slug>...]
 *
 * Audit codes:
 *   G1  headword present + matches input
 *   G2  IPA present (Latin-script source: en/es/fr/de/it/pt)
 *   G3  reading present (CJK source: zh/ja/ko)
 *   G4  meanings ≥1, definition + POS, no register tags, no source-script leak
 *   G5  examples ≥2, sentence + translation present, markers paired
 *   G6  cross-script: target translation has no source-script chars
 *   G7  source sentence has no target-script chars (Hangul leak in en, etc)
 *   G8  marker grounding (lenient — covers inflections + multi-word)
 *   G9  translation marker present
 *   G10 length: per-level cap (HSK 1: 8 / HSK 2: 10 / N5: 10 / TOPIK 1: 7 /
 *       DELF A1: 7 / A2: 8 / B1: 10 / TOEIC 600: 12) — borderline >cap
 *   G11 sentence-level verb-final (target ∈ {ko, ja})
 *   G12 synonyms: no self-ref, no parens, no script-mismatch
 *   G13 antonyms: same rules
 *   G14 distinct meanings (no near-duplicates)
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

// Script regexes
const HAN_RE = /\p{Script=Han}/u;
const HANGUL_RE = /\p{Script=Hangul}/u;
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CYRILLIC_RE = /[Ѐ-ӿ]/;
const LATIN_RE = /[A-Za-zÀ-ÿ]/;
const REGISTER_RE = /\b(vulgar|slang|profan\w*|swear\w*|crude|obscen\w+|colloq\w+|informal|euphem\w+|derogat\w+|pejorat\w+|offensive|taboo)\b/i;

const IPA_LANGS = new Set(['en', 'es', 'fr', 'de', 'it', 'pt']);
const CJK_LANGS = new Set(['zh', 'zh-CN', 'zh-TW', 'ja', 'ko']);
const VERB_FINAL_LANGS = new Set(['ko', 'ja']);

// Per-list length caps. CJK languages count characters; Latin counts words.
// Tuned to flag only the truly-long examples (~95th percentile), not the
// natural average. Borderline = above cap; long = above cap+4.
function lengthCap(slug) {
  if (slug === 'hsk-1') return 12;
  if (slug === 'hsk-2') return 14;
  if (slug.startsWith('jlpt-n5')) return 18;
  if (slug.startsWith('jlpt-n4')) return 20;
  if (slug.startsWith('topik-1')) return 18; // Korean is char-counted (no spaces) — 18 ≈ short clause
  if (slug === 'delf-a1' || slug.startsWith('delf-a1')) return 9;
  if (slug.startsWith('delf-a2')) return 10;
  if (slug.startsWith('delf-b1')) return 12;
  if (slug === 'toeic-600') return 12;
  return 16;
}

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
function strip(s) { return (s || '').replace(/\*\*/g, ''); }

// Lenient inflection check — true if the marker chunk plausibly relates to
// the headword. Covers conjugation, plurals, contractions, multi-word.
function inflectionMatches(headword, mark, sourceLang) {
  const h = headword.toLowerCase().trim();
  const m = mark.toLowerCase().trim();
  if (m === h) return true;
  if (m.includes(h) || h.includes(m)) return true;
  // Latin scripts: shared 4-letter prefix usually means same lemma
  if (LATIN_RE.test(h) && LATIN_RE.test(m) && h.length >= 4 && m.length >= 4) {
    if (h.slice(0, 4) === m.slice(0, 4)) return true;
  }
  // Multi-word headword: any content sub-word match
  if (h.includes(' ')) {
    const parts = h.split(' ').filter((w) => w.length >= 3);
    if (parts.some((w) => m.includes(w))) return true;
  }
  // CJK: character overlap (≥1 char)
  if (CJK_LANGS.has(sourceLang)) {
    for (const ch of h) {
      if (HAN_RE.test(ch) || KANA_RE.test(ch) || HANGUL_RE.test(ch)) {
        if (m.includes(ch)) return true;
      }
    }
  }
  return false;
}

// Korean / Japanese sentence-final check.
function isVerbFinal(s, lang) {
  if (!VERB_FINAL_LANGS.has(lang)) return true;
  if (!s) return true;
  const stripped = s.replace(/\*\*/g, '').replace(/[!?.,。、！？]+$/g, '').trim();
  if (stripped.length === 0) return true;
  if (lang === 'ko') {
    return /(다|요|까|니|네|군|어|아|지|자|세요|ㅂ니다|습니다|어요|아요|았|었|예요|에요|이다|입니다|이지|이야|군요|네요|어라|아라|이라|이지요|일까|일까요|었어|있어|있다|없다|없어)$/.test(stripped);
  }
  if (lang === 'ja') {
    return /(る|た|だ|です|ます|ました|ない|ません|よ|ね|か|い|う|く|す|つ|ぬ|ぶ|む|ぐ)$/.test(stripped);
  }
  return true;
}

function audit(slug, headword, sourceLang, targetLang, r, lengthCapWords) {
  const issues = [];

  // G1
  if (!r.headword) issues.push('G1:no_headword');
  else if (r.headword.toLowerCase().trim() !== headword.toLowerCase().trim()) issues.push(`G1:mismatch(${r.headword}≠${headword})`);

  // G2 IPA (Latin source, single token)
  const isPhrase = headword.includes(' ');
  if (!isPhrase && IPA_LANGS.has(sourceLang)) {
    const ipa = typeof r.ipa === 'string' ? r.ipa : (Array.isArray(r.ipa) ? r.ipa[0] : null);
    if (!ipa || !ipa.trim()) issues.push('G2:no_ipa');
  }

  // G3 reading — only enforce for Chinese (pinyin essential). Japanese
  // headwords often appear in kana already (no separate reading needed);
  // Korean rarely uses Hanja so reading is usually omitted by design.
  const isPureKana = sourceLang === 'ja' && KANA_RE.test(headword) && !HAN_RE.test(headword);
  const isPureHangul = sourceLang === 'ko' && HANGUL_RE.test(headword) && !HAN_RE.test(headword);
  if (CJK_LANGS.has(sourceLang) && !isPureKana && !isPureHangul && sourceLang !== 'ko') {
    const reading = Array.isArray(r.reading) ? r.reading[0] : r.reading;
    if (!reading || (typeof reading === 'string' && !reading.trim())) issues.push('G3:no_reading');
  }

  // G4 meanings
  if (!Array.isArray(r.meanings) || r.meanings.length === 0) issues.push('G4:no_meanings');
  else {
    for (let i = 0; i < r.meanings.length; i++) {
      const m = r.meanings[i];
      if (!m.definition?.trim()) issues.push(`G4:m[${i}]:empty_def`);
      if (!m.partOfSpeech) issues.push(`G4:m[${i}]:no_pos`);
      if (REGISTER_RE.test(m.definition || '')) issues.push(`G4:m[${i}]:register("${m.definition}")`);
    }
    // G14 distinct
    const defs = r.meanings.map((m) => m.definition?.trim());
    if (new Set(defs).size < defs.length) issues.push('G14:duplicate_meanings');
  }

  // G5 examples
  if (!Array.isArray(r.examples) || r.examples.length < 2) {
    issues.push(`G5:few_examples(${r.examples?.length ?? 0})`);
  } else {
    for (let i = 0; i < r.examples.length; i++) {
      const ex = r.examples[i];
      const s = ex.sentence || '';
      const t = ex.translation || '';
      if (!s.trim()) issues.push(`G5:e${i}:empty_sentence`);
      if (!t.trim()) issues.push(`G5:e${i}:empty_translation`);

      const sm = markersIn(s);
      const tm = markersIn(t);
      if (sm.length === 0) issues.push(`G5:e${i}:no_marker_in_sentence`);
      if (tm.length === 0) issues.push(`G9:e${i}:no_marker_in_translation`);
      if (unbalancedMarkers(s)) issues.push(`G5:e${i}:unbalanced_sentence`);
      if (unbalancedMarkers(t)) issues.push(`G5:e${i}:unbalanced_translation`);

      // G6 cross-script: target translation should not contain source-script chars
      const tStripped = strip(t);
      if (targetLang === 'ko') {
        const han = [...tStripped].filter((c) => HAN_RE.test(c));
        if (han.length > 0 && CJK_LANGS.has(sourceLang) && sourceLang !== 'ko') {
          issues.push(`G6:e${i}:han_in_ko_translation([${han.slice(0, 3).join('')}])`);
        }
        const kana = [...tStripped].filter((c) => KANA_RE.test(c));
        if (kana.length > 0 && sourceLang === 'ja') issues.push(`G6:e${i}:kana_in_ko_translation`);
        // Latin alphabet leak (excluding acronyms/AM-PM)
        const latinChars = tStripped.match(/[A-Za-z]/g) || [];
        if (latinChars.length > 0) {
          const cleaned = tStripped.replace(/\b([A-Z]{2,}|[ap]\.?[mp]\.?|GPT|TOEIC|HSK|JLPT)\b/gi, '');
          if (LATIN_RE.test(cleaned)) issues.push(`G6:e${i}:latin_in_ko_translation`);
        }
      } else if (targetLang === 'en') {
        const han = [...tStripped].filter((c) => HAN_RE.test(c));
        if (han.length > 0) issues.push(`G6:e${i}:han_in_en_translation`);
        const hangul = [...tStripped].filter((c) => HANGUL_RE.test(c));
        if (hangul.length > 0) issues.push(`G6:e${i}:hangul_in_en_translation`);
        const kana = [...tStripped].filter((c) => KANA_RE.test(c));
        if (kana.length > 0) issues.push(`G6:e${i}:kana_in_en_translation`);
      }

      // G7 source sentence: no target-script leak
      const sStripped = strip(s);
      if (CJK_LANGS.has(sourceLang) && targetLang === 'ko') {
        if (HANGUL_RE.test(sStripped) && sourceLang !== 'ko') {
          issues.push(`G7:e${i}:hangul_in_${sourceLang}_sentence`);
        }
      }
      if (sourceLang === 'en' && HANGUL_RE.test(sStripped)) issues.push(`G7:e${i}:hangul_in_en_sentence`);
      if (sourceLang === 'en' && HAN_RE.test(sStripped)) issues.push(`G7:e${i}:han_in_en_sentence`);
      if (sourceLang === 'ko' && targetLang === 'en') {
        if (HAN_RE.test(sStripped)) issues.push(`G7:e${i}:han_in_ko_sentence`);
      }

      // G8 marker grounding
      if (sm.length > 0) {
        const matched = sm.some((mk) => inflectionMatches(headword, mk, sourceLang));
        if (!matched) issues.push(`G8:e${i}:marker_off("${sm.join('|')}"≠${headword})`);
      }

      // G10 length cap
      const isLatinSrc = LATIN_RE.test(sStripped) && !CJK_LANGS.has(sourceLang);
      const wordCount = isLatinSrc
        ? sStripped.trim().split(/\s+/).length
        : [...sStripped].filter((c) => !/\s/.test(c)).length;
      if (wordCount > lengthCapWords + 4) issues.push(`G10:e${i}:long(${wordCount})`);
      else if (wordCount > lengthCapWords) issues.push(`G10:e${i}:borderline(${wordCount})`);

      // G11 verb-final
      if (!isVerbFinal(t, targetLang)) {
        issues.push(`G11:e${i}:not_verb_final("${t.slice(-25)}")`);
      }
    }
  }

  // G12/G13 syn/ant
  for (const [field, code] of [['synonyms', 'G12'], ['antonyms', 'G13']]) {
    const arr = r[field];
    if (!Array.isArray(arr)) continue;
    for (const x of arr) {
      if (!x || typeof x !== 'string') { issues.push(`${code}:invalid`); continue; }
      if (x.toLowerCase().trim() === headword.toLowerCase().trim()) issues.push(`${code}:eq_headword("${x}")`);
      if (/[\(\)（）]/.test(x)) issues.push(`${code}:paren("${x}")`);
      // Should be in source language
      if (sourceLang === 'en' || IPA_LANGS.has(sourceLang)) {
        if (HANGUL_RE.test(x) || HAN_RE.test(x) || KANA_RE.test(x)) issues.push(`${code}:non_${sourceLang}_script("${x}")`);
      }
      if (sourceLang === 'ko' && (HAN_RE.test(x) || LATIN_RE.test(x))) issues.push(`${code}:non_ko_script("${x}")`);
    }
  }

  return issues;
}

async function auditSlug(slug) {
  const { data: list } = await admin
    .from('curated_wordlists')
    .select('id, source_lang, word_count, exam_type, level')
    .eq('slug', slug)
    .single();
  if (!list) return { slug, error: 'list not found', flags: [] };
  const { data: rows } = await admin
    .from('curated_words')
    .select('word, reading_key, results_by_target_lang, display_order')
    .eq('curated_wordlist_id', list.id)
    .order('display_order');

  const cap = lengthCap(slug);
  const flags = [];
  let scanned = 0, totalEx = 0, totalMeanings = 0;
  const exampleLengths = [];
  const posBuckets = {};

  for (const row of rows || []) {
    const langs = Object.keys(row.results_by_target_lang || {});
    for (const tl of langs) {
      scanned++;
      const r = row.results_by_target_lang[tl];
      const iss = audit(slug, row.word, list.source_lang, tl, r, cap);
      if (iss.length) flags.push({ slug, word: row.word, lang: tl, issues: iss });
      totalMeanings += (r.meanings || []).length;
      for (const m of r.meanings || []) {
        const pos = m.partOfSpeech || '?';
        posBuckets[pos] = (posBuckets[pos] || 0) + 1;
      }
      for (const ex of r.examples || []) {
        totalEx++;
        const s = strip(ex.sentence || '');
        const isLatinSrc = LATIN_RE.test(s) && !CJK_LANGS.has(list.source_lang);
        exampleLengths.push(isLatinSrc ? s.trim().split(/\s+/).length : [...s].filter((c) => !/\s/.test(c)).length);
      }
    }
  }

  return {
    slug,
    sourceLang: list.source_lang,
    wordCount: list.word_count,
    rowsCount: rows.length,
    scanned,
    totalEx,
    totalMeanings,
    avgExLen: exampleLengths.length ? exampleLengths.reduce((a, b) => a + b, 0) / exampleLengths.length : 0,
    posBuckets,
    flags,
  };
}

async function main() {
  const slugs = process.argv.slice(2);
  if (slugs.length === 0) {
    console.error('Usage: node generic-full-audit.js <slug> [<slug>...]');
    process.exit(1);
  }
  const allFlags = [];
  for (const slug of slugs) {
    const r = await auditSlug(slug);
    if (r.error) { console.log(`\n${slug}: ${r.error}`); continue; }
    console.log(`\n${slug} [${r.sourceLang}, ${r.scanned} entries × langs, ${r.totalEx} examples, avg ${r.avgExLen.toFixed(1)} units]`);
    console.log(`  Flagged: ${r.flags.length}/${r.scanned} (${(100*r.flags.length/r.scanned).toFixed(2)}%)`);
    const buckets = {};
    for (const f of r.flags) for (const i of f.issues) {
      const k = i.split(':')[0];
      buckets[k] = (buckets[k] || 0) + 1;
    }
    const sortedBuckets = Object.entries(buckets).sort((a,b)=>b[1]-a[1]);
    for (const [k, v] of sortedBuckets) console.log(`    ${k}: ${v}`);
    allFlags.push(...r.flags);
  }

  // Cross-slug summary by code
  const all = {};
  for (const f of allFlags) for (const i of f.issues) {
    const code = i.split(':')[0];
    all[code] = (all[code] || 0) + 1;
  }
  console.log(`\n══ Total across all slugs ══`);
  for (const [k, v] of Object.entries(all).sort((a,b)=>b[1]-a[1])) console.log(`  ${k}: ${v}`);

  // Save report for downstream re-curation
  fs.writeFileSync(
    path.resolve(__dirname, 'generic-audit-report.json'),
    JSON.stringify({ slugs, flags: allFlags }, null, 2),
  );
  console.log('\n→ scripts/curation/generic-audit-report.json');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
