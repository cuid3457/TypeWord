/**
 * TOPIK Level 1 audit + manual patch.
 *  1. Patches 개: drop meaning[1] (vulgar intensifier) + example using it
 *  2. Scans all TOPIK 1 entries for slang/colloquial/vulgar markers in meanings
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TOPIK_SLUGS = ['topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3'];

// Trigger keywords in meaning definitions that suggest non-A1 register.
// All anchored to word boundaries to avoid substring false positives like
// "sport[s]wear" matching "swear".
const SUSPECT_RE = /\b(vulgar|slang|profan\w*|swear\w*|crude|obscen\w+|intensifier|colloq\w+|informal|euphem\w+|derogat\w+|pejorat\w+|offensive|taboo)\b/i;

// Korean slang patterns commonly seen in casual usage but inappropriate for
// TOPIK 1 vocabulary examples. The 개 prefix is intensifier slang (≠ "dog");
// others are profanity intensifiers, gen-Z neologisms, etc.
const KO_SLANG_RES = [
  { name: '개~ intensifier',   re: /개(재미|좋|싫|맛|예|괜찮|짜증|쩔|꿀|이득|쩐|존|웃|미친)/ },
  { name: '존나/존~',          re: /\b존(나|맛|좋|예|잘)/ },
  { name: '핵~ intensifier',   re: /\b핵(꿀|좋|싫|맛|꿀잼|노잼|존)/ },
  { name: '짱~ intensifier',   re: /\b짱(꿀|좋|싫|맛|예)/ },
  { name: '빡세다/빡친',       re: /빡(세|치|침|쳐)/ },
  { name: '쩔다/쩐다',         re: /\b쩔(다|어|네|었)/ },
  { name: '꿀잼/노잼',         re: /(꿀|노)(잼)/ },
  { name: '갑분싸/JMT/TMI',    re: /\b(갑분싸|JMT|TMI|ㄹㅇ|ㅇㅈ)\b/ },
];

async function patch개() {
  const { data: list } = await admin.from('curated_wordlists')
    .select('id').eq('slug', 'topik-1-part-1').single();
  const { data: row } = await admin.from('curated_words')
    .select('results_by_target_lang')
    .eq('curated_wordlist_id', list.id).eq('word', '개').maybeSingle();
  if (!row) { console.log('  ✗ 개 row not found'); return; }

  const r = JSON.parse(JSON.stringify(row.results_by_target_lang.en));
  const before = {
    meanings: r.meanings.length,
    examples: r.examples.length,
  };
  // Drop meaning index 1 (vulgar intensifier). Keep only examples that
  // referenced index 0 (the original "dog" sense). Remap indices to 0.
  r.meanings = r.meanings.filter((_, i) => i === 0);
  r.examples = r.examples
    .filter((ex) => (ex.meaningIndex ?? ex.meaning_index ?? 0) === 0)
    .map((ex) => ({ ...ex, meaningIndex: 0 }));

  const newResults = { ...row.results_by_target_lang, en: r };
  const { error } = await admin.from('curated_words')
    .update({ results_by_target_lang: newResults })
    .eq('curated_wordlist_id', list.id).eq('word', '개');
  if (error) { console.log('  ✗ update:', error.message); return; }
  console.log(`  ✓ 개 patched: meanings ${before.meanings}→${r.meanings.length}, examples ${before.examples}→${r.examples.length}`);
}

async function auditTopik() {
  const findings = [];
  for (const slug of TOPIK_SLUGS) {
    const { data: list } = await admin.from('curated_wordlists')
      .select('id').eq('slug', slug).single();
    const { data: rows } = await admin.from('curated_words')
      .select('word, results_by_target_lang')
      .eq('curated_wordlist_id', list.id);
    for (const row of rows || []) {
      const r = row.results_by_target_lang?.en;
      if (!r) continue;
      // Check meanings
      for (let i = 0; i < (r.meanings || []).length; i++) {
        const m = r.meanings[i];
        const def = m.definition || '';
        if (SUSPECT_RE.test(def)) {
          findings.push({ slug, word: row.word, kind: 'meaning', idx: i, text: def });
        }
      }
      // Check example sentences for Korean slang patterns
      for (let i = 0; i < (r.examples || []).length; i++) {
        const ex = r.examples[i];
        const sentence = ex.sentence || '';
        for (const { name, re } of KO_SLANG_RES) {
          if (re.test(sentence)) {
            findings.push({ slug, word: row.word, kind: `ex_slang(${name})`, idx: i, text: sentence });
          }
        }
      }
    }
  }
  return findings;
}

async function main() {
  if (!process.argv.includes('--audit-only')) {
    console.log('=== Patching 개 ===');
    await patch개();
  }

  console.log('\n=== Auditing TOPIK 1 for slang/colloquial markers ===');
  const findings = await auditTopik();
  if (findings.length === 0) {
    console.log('  ✓ No suspect entries found');
    return;
  }
  console.log(`  Found ${findings.length} suspect:`);
  for (const f of findings) {
    console.log(`    [${f.slug}] ${f.word} m[${f.idx}]: "${f.text}"`);
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
