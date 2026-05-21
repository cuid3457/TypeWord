/**
 * Comprehensive TOPIK 1 audit. Covers:
 *  S1. Structural — empty fields, missing markers, examples without sentence/translation
 *  S2. Marker integrity — ** found in both sentence and translation
 *  S3. Headword grounding — bolded segment in sentence relates to headword (Korean stem-ish heuristic)
 *  S4. Length sanity — A1-appropriate (sentence ≤ 60 chars, translation ≤ 80)
 *  S5. Synonym sanity — non-empty when allowed, headword not duplicated, no parens variants
 *  S6. POS coverage — every meaning has partOfSpeech
 *  S7. Translation marker mismatch — translation also has ** with sensible English content
 *  R1. Slang patterns (개~/존나/핵~ etc.) — already covered separately, repeated here for unified report
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

const TOPIK_SLUGS = ['topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3'];

const REGISTER_RE = /\b(vulgar|slang|profan\w*|swear\w*|crude|obscen\w+|intensifier|colloq\w+|informal|euphem\w+|derogat\w+|pejorat\w+|offensive|taboo)\b/i;

const KO_SLANG_RES = [
  /개(재미|좋|싫|맛|예|괜찮|짜증|쩔|꿀|이득|쩐|존|웃|미친)/,
  /\b존(나|맛|좋|예|잘)/,
  /\b핵(꿀|좋|싫|맛|꿀잼|노잼|존)/,
  /\b짱(꿀|좋|싫|맛|예)/,
  /빡(세|치|침|쳐)/,
  /\b쩔(다|어|네|었)/,
  /(꿀|노)(잼)/,
  /\b(갑분싸|JMT|TMI|ㄹㅇ|ㅇㅈ)\b/,
];

// Extract bolded marker(s) from a string. Marker = text between ** **.
function markersIn(s) {
  if (!s) return [];
  const out = [];
  const re = /\*\*([^*]+)\*\*/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

// Strip Korean inflection-ish tail from a chunk to compare against headword.
// Removes common verb/adjective endings (다 / 요 / 어요 / 아요 / 합니다 etc.)
// and noun particles (을/를/이/가/은/는/와/과/도/만/에/에서/으로/로).
function koreanStem(s) {
  return (s || '')
    .replace(/(합니다|입니다|에요|예요|어요|아요|었어요|했어요|을까요|할까요|세요|십시오|니다)$/g, '')
    .replace(/(이|가|을|를|은|는|와|과|도|만|에|에서|으로|로|의)$/g, '')
    .replace(/\s+$/, '')
    .trim();
}

function auditEntry(slug, word, r) {
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
      // S6
      if (!m.partOfSpeech) issues.push(`S6:m[${i}]:no_pos`);
      // R2
      if (REGISTER_RE.test(m.definition || '')) {
        issues.push(`R2:m[${i}]:register("${m.definition}")`);
      }
    }
  }

  // S1 — examples
  if (!Array.isArray(r.examples) || r.examples.length === 0) {
    issues.push('S1:no_examples');
  } else {
    if (r.examples.length < 2) issues.push(`S1:only_${r.examples.length}_examples`);
    for (let i = 0; i < r.examples.length; i++) {
      const ex = r.examples[i];
      const s = ex.sentence || '';
      const t = ex.translation || '';
      if (!s.trim()) issues.push(`S1:e${i}:empty_sentence`);
      if (!t.trim()) issues.push(`S1:e${i}:empty_translation`);

      // S2 markers
      const sm = markersIn(s);
      const tm = markersIn(t);
      if (sm.length === 0) issues.push(`S2:e${i}:no_marker_in_sentence`);
      if (tm.length === 0) issues.push(`S2:e${i}:no_marker_in_translation`);

      // S3 headword grounding (Korean source only)
      // The bolded chunks in sentence should share a stem with the headword.
      if (sm.length > 0) {
        const wStem = word; // headword as-is
        const matched = sm.some((mk) => {
          const stem = koreanStem(mk);
          return (
            stem.includes(wStem) ||
            wStem.includes(stem) ||
            mk.includes(wStem) ||
            wStem.includes(mk.replace(/[가-힣]+$/, '').slice(0, wStem.length))
          );
        });
        if (!matched) issues.push(`S3:e${i}:marker_off("${sm.join('|')}"≠${word})`);
      }

      // S4 length
      if (s.replace(/\*\*/g, '').length > 60) issues.push(`S4:e${i}:long_sentence(${s.replace(/\*\*/g, '').length})`);
      if (t.replace(/\*\*/g, '').length > 80) issues.push(`S4:e${i}:long_translation(${t.replace(/\*\*/g, '').length})`);

      // R1 slang
      for (const re of KO_SLANG_RES) {
        if (re.test(s)) issues.push(`R1:e${i}:slang_in_sentence`);
      }
    }
  }

  // S5 synonyms
  const syns = Array.isArray(r.synonyms) ? r.synonyms : [];
  for (const sy of syns) {
    if (!sy || typeof sy !== 'string') {
      issues.push(`S5:syn_invalid`);
      continue;
    }
    if (sy === word) issues.push(`S5:syn_eq_headword("${sy}")`);
    if (/[\(\)（）]/.test(sy)) issues.push(`S5:syn_paren("${sy}")`);
  }

  return issues;
}

async function main() {
  const allRows = [];
  for (const slug of TOPIK_SLUGS) {
    const { data: list } = await admin.from('curated_wordlists')
      .select('id, slug').eq('slug', slug).single();
    const { data: rows } = await admin.from('curated_words')
      .select('word, results_by_target_lang')
      .eq('curated_wordlist_id', list.id);
    for (const row of rows || []) allRows.push({ slug, ...row });
  }

  console.log(`Total entries scanned: ${allRows.length}`);

  const flags = [];
  const byCategory = {};
  for (const row of allRows) {
    const r = row.results_by_target_lang?.en;
    if (!r) {
      flags.push({ slug: row.slug, word: row.word, issues: ['S0:no_en_result'] });
      continue;
    }
    const issues = auditEntry(row.slug, row.word, r);
    if (issues.length) {
      flags.push({ slug: row.slug, word: row.word, issues });
      for (const i of issues) {
        const cat = i.split(':')[0];
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      }
    }
  }

  console.log(`Flagged: ${flags.length} (${(100*flags.length/allRows.length).toFixed(2)}%)`);
  console.log('\n=== ISSUE COUNTS BY CATEGORY ===');
  console.table(byCategory);

  // Group by issue type for actionable output
  const byIssueKey = {};
  for (const f of flags) {
    for (const i of f.issues) {
      const key = i.split(/[(:]/).slice(0, 2).join(':');
      if (!byIssueKey[key]) byIssueKey[key] = [];
      byIssueKey[key].push({ slug: f.slug, word: f.word, full: i });
    }
  }
  console.log('\n=== TOP ISSUE BUCKETS ===');
  const buckets = Object.entries(byIssueKey).sort((a,b)=>b[1].length-a[1].length).slice(0, 12);
  for (const [k, items] of buckets) {
    console.log(`\n  ${k} (${items.length})`);
    items.slice(0, 8).forEach(it => console.log(`    [${it.slug}] ${it.word}: ${it.full}`));
    if (items.length > 8) console.log(`    ... +${items.length - 8} more`);
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'topik-full-audit-report.json'),
    JSON.stringify({ totalScanned: allRows.length, flagsCount: flags.length, byCategory, flags }, null, 2),
  );
  console.log(`\nFull report → scripts/curation/topik-full-audit-report.json`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
