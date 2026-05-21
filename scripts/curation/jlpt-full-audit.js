/**
 * Comprehensive JLPT N5 audit. Covers:
 *  S1. Structural — empty fields, missing markers, examples without sentence/translation
 *  S2. Marker integrity — ** balanced pairs in both sentence and translation
 *  S3. Headword grounding (JA) — bolded segment in sentence shares stem with headword
 *  S4. Length sanity — N5-appropriate (sentence ≤ 50, translation ≤ 80)
 *  S5. Synonym sanity — non-empty if listed, headword not duplicated, no parens
 *  S6. Antonym sanity — same rules as synonyms
 *  S7. POS coverage — every meaning has partOfSpeech
 *  S8. Reading present — Japanese kana reading required
 *  R1. Slang patterns (草 as ww/laughter, 激~/神~/やばい etc.)
 *  R2. Register markers in definition (vulgar/slang/etc.)
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

const JLPT_SLUGS = ['jlpt-n5-part-1', 'jlpt-n5-part-2'];

const REGISTER_RE = /\b(vulgar|slang|profan\w*|swear\w*|crude|obscen\w+|intensifier|colloq\w+|informal|euphem\w+|derogat\w+|pejorat\w+|offensive|taboo|俗語|卑俗|スラング|品の悪い|下品)\b/i;

// Japanese internet slang / non-N5 register patterns to flag in example sentences.
const JA_SLANG_RES = [
  { name: '草 as ww/laughter', re: /草を生やし|草生え|それは草/ },
  { name: 'やばい intensifier slang', re: /やばい(けど|から|ね|よ|の)|マジやばい/ },
  { name: '神〜 / 激〜 / 鬼〜 prefix slang', re: /(神|激|鬼)(美味|可愛|やば|うざ|ウザ|エモ|ヤバ)/ },
  { name: 'ガチ/マジ slang', re: /\b(ガチで|マジで)/ },
  { name: 'ww/lol katakana', re: /(ワラ|ワロタ|ワロス)/ },
];

// Korean slang patterns (since target lang is ko, translations could leak slang).
const KO_SLANG_RES = [
  /개(재미|좋|싫|맛|예|괜찮|짜증|쩔|꿀|이득|쩐|존|웃|미친)/,
  /\b존(나|맛|좋|예|잘)/,
  /\b핵(꿀|좋|싫|맛|꿀잼|노잼)/,
  /\b짱(꿀|좋|싫|맛|예)/,
  /빡(세|치|침|쳐)/,
  /\b쩔(다|어|네|었)/,
  /(꿀|노)(잼)/,
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

// Extract the "stem" of a Japanese headword — the kanji block if present, else
// the full string (for kana-only words). Used to verify the bolded marker in
// example sentences contains the headword's stem (covering conjugated forms
// 見る → 見ます/見て/見た all share 見).
function jaStem(headword) {
  // Pull contiguous kanji runs; if any exist, return all of them concatenated.
  const kanji = headword.match(/\p{Script=Han}+/gu);
  if (kanji && kanji.length > 0) return kanji.join('');
  // No kanji — for i-adjectives (XXい), strip trailing い for stem.
  if (/^[\p{Script=Hiragana}\p{Script=Katakana}]+い$/u.test(headword) && headword.length > 2) {
    return headword.slice(0, -1);
  }
  // Pure kana or special — return as-is.
  return headword;
}

function markerContainsHeadwordStem(marker, headword) {
  const stem = jaStem(headword);
  if (!stem) return false;
  // Marker must contain the stem character sequence somewhere.
  if (marker.includes(stem)) return true;
  // For very short stems (1 char), require exact stem char in marker.
  if (stem.length === 1) return marker.includes(stem);
  // Fallback: accept partial match if marker covers ≥70% of stem chars.
  const overlap = [...stem].filter((c) => marker.includes(c)).length;
  return overlap / stem.length >= 0.7;
}

function auditEntry(slug, word, lang, r) {
  const issues = [];

  // S1 — meanings
  if (!Array.isArray(r.meanings) || r.meanings.length === 0) {
    issues.push('S1:no_meanings');
  } else {
    for (let i = 0; i < r.meanings.length; i++) {
      const m = r.meanings[i];
      if (!m.definition || m.definition.trim().length === 0) {
        issues.push(`S1:m[${i}]:empty_def`);
      }
      if (!m.partOfSpeech) issues.push(`S7:m[${i}]:no_pos`);
      if (REGISTER_RE.test(m.definition || '')) {
        issues.push(`R2:m[${i}]:register("${m.definition}")`);
      }
    }
  }

  // S8 — Japanese reading present.
  // Required only when headword contains kanji (Han script). Pure-kana
  // headwords (hiragana/katakana only) ARE their own reading, so the field
  // is optional for them.
  const hasKanji = /\p{Script=Han}/u.test(word);
  if (hasKanji && (!Array.isArray(r.reading) || r.reading.length === 0 || !r.reading[0])) {
    issues.push('S8:no_reading_for_kanji');
  }

  // S1 — examples
  if (!Array.isArray(r.examples) || r.examples.length === 0) {
    issues.push('S1:no_examples');
  } else {
    if (r.examples.length < 2) issues.push(`S1:only_${r.examples.length}_example(s)`);
    for (let i = 0; i < r.examples.length; i++) {
      const ex = r.examples[i];
      const s = ex.sentence || '';
      const t = ex.translation || '';
      if (!s.trim()) issues.push(`S1:e${i}:empty_sentence`);
      if (!t.trim()) issues.push(`S1:e${i}:empty_translation`);

      // S2 markers — must have at least one valid pair AND be balanced
      const sm = markersIn(s);
      const tm = markersIn(t);
      if (sm.length === 0) issues.push(`S2:e${i}:no_marker_in_sentence`);
      if (tm.length === 0) issues.push(`S2:e${i}:no_marker_in_translation`);
      if (unbalancedMarkers(s)) issues.push(`S2:e${i}:unbalanced_sentence`);
      if (unbalancedMarkers(t)) issues.push(`S2:e${i}:unbalanced_translation`);

      // S3 headword grounding — JA source
      if (sm.length > 0) {
        const matched = sm.some((mk) => markerContainsHeadwordStem(mk, word));
        if (!matched) issues.push(`S3:e${i}:marker_off("${sm.join('|')}"≠${word})`);
      }

      // S4 length
      if (s.replace(/\*\*/g, '').length > 50) {
        issues.push(`S4:e${i}:long_sentence(${s.replace(/\*\*/g, '').length})`);
      }
      if (t.replace(/\*\*/g, '').length > 80) {
        issues.push(`S4:e${i}:long_translation(${t.replace(/\*\*/g, '').length})`);
      }

      // R1 slang in JA source sentence
      for (const { name, re } of JA_SLANG_RES) {
        if (re.test(s)) issues.push(`R1:e${i}:ja_slang(${name})`);
      }
      // R1 slang in KO target translation
      if (lang === 'ko') {
        for (const re of KO_SLANG_RES) {
          if (re.test(t)) issues.push(`R1:e${i}:ko_slang_in_translation`);
        }
      }
    }
  }

  // S5 / S6 synonym/antonym sanity
  for (const [field, code] of [['synonyms', 'S5'], ['antonyms', 'S6']]) {
    const arr = Array.isArray(r[field]) ? r[field] : [];
    for (const x of arr) {
      if (!x || typeof x !== 'string') {
        issues.push(`${code}:invalid_entry`);
        continue;
      }
      if (x.trim() === word) issues.push(`${code}:eq_headword("${x}")`);
      if (/[\(\)（）]/.test(x)) issues.push(`${code}:paren("${x}")`);
    }
  }

  return issues;
}

async function main() {
  const allRows = [];
  for (const slug of JLPT_SLUGS) {
    const { data: list } = await admin.from('curated_wordlists')
      .select('id, slug').eq('slug', slug).single();
    const { data: rows } = await admin.from('curated_words')
      .select('word, results_by_target_lang')
      .eq('curated_wordlist_id', list.id);
    for (const row of rows || []) allRows.push({ slug, ...row });
  }
  console.log(`Wordlist entries: ${allRows.length}`);

  const flags = [];
  let scanned = 0;
  for (const row of allRows) {
    const langs = Object.keys(row.results_by_target_lang || {});
    for (const lang of langs) {
      scanned++;
      const r = row.results_by_target_lang[lang];
      const issues = auditEntry(row.slug, row.word, lang, r);
      if (issues.length) flags.push({ slug: row.slug, word: row.word, lang, issues });
    }
  }
  console.log(`Scanned (per-lang): ${scanned}`);
  console.log(`Flagged: ${flags.length} (${(100*flags.length/scanned).toFixed(2)}%)`);

  const byCategory = {};
  for (const f of flags) for (const i of f.issues) {
    const k = i.split(':')[0];
    byCategory[k] = (byCategory[k]||0)+1;
  }
  console.log('\n=== ISSUE COUNTS BY CATEGORY ===');
  console.table(byCategory);

  const byKey = {};
  for (const f of flags) for (const i of f.issues) {
    const key = i.split(/[(:]/).slice(0, 2).join(':');
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({ slug: f.slug, word: f.word, lang: f.lang, full: i });
  }
  console.log('\n=== TOP ISSUE BUCKETS ===');
  const buckets = Object.entries(byKey).sort((a,b)=>b[1].length-a[1].length).slice(0, 16);
  for (const [k, items] of buckets) {
    console.log(`\n  ${k} (${items.length})`);
    items.slice(0, 10).forEach(it => console.log(`    [${it.slug}] ${it.word} (${it.lang}): ${it.full}`));
    if (items.length > 10) console.log(`    ... +${items.length - 10} more`);
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'jlpt-full-audit-report.json'),
    JSON.stringify({ entries: allRows.length, scanned, flagsCount: flags.length, byCategory, flags }, null, 2),
  );
  console.log(`\nFull report → scripts/curation/jlpt-full-audit-report.json`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
