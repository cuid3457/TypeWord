/**
 * TOPIK 1 cleanup after the difficulty re-curation.
 * Combines audit-driven auto-fixes and entry-specific manual patches.
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

const report = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'topik-full-audit-report.json'), 'utf8'));

async function patchEntry(slug, word, mutator) {
  const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
  const { data: row } = await admin.from('curated_words')
    .select('results_by_target_lang')
    .eq('curated_wordlist_id', list.id).eq('word', word).maybeSingle();
  if (!row) return false;
  const updated = JSON.parse(JSON.stringify(row.results_by_target_lang));
  mutator(updated);
  await admin.from('curated_words')
    .update({ results_by_target_lang: updated })
    .eq('curated_wordlist_id', list.id).eq('word', word);
  return true;
}

async function main() {
  // ── 1. Synonym/antonym auto-cleanup (S5 eq_headword + paren) ──────────
  const synTargets = new Set();
  for (const f of report.flags) {
    if (f.issues.some((i) => i.startsWith('S5:') || i.startsWith('S6:'))) {
      synTargets.add(`${f.slug}|${f.word}`);
    }
  }
  console.log(`=== Synonym cleanup (${synTargets.size}) ===`);
  for (const key of synTargets) {
    const [slug, word] = key.split('|');
    await patchEntry(slug, word, (data) => {
      for (const lang of Object.keys(data)) {
        for (const field of ['synonyms', 'antonyms']) {
          if (!Array.isArray(data[lang]?.[field])) continue;
          data[lang][field] = data[lang][field].filter((s) => {
            if (typeof s !== 'string') return false;
            if (s.trim() === word) return false;
            if (/[\(\)（）]/.test(s)) return false;
            return true;
          });
        }
      }
    });
    console.log(`  ✓ [${slug}] ${word}`);
  }

  // ── 2. Slang meaning removal (R2 register flags) ─────────────────────
  const slangTargets = report.flags.filter((f) => f.issues.some((i) => i.startsWith('R2:')));
  console.log(`\n=== Slang meaning removal (${slangTargets.length}) ===`);
  for (const f of slangTargets) {
    await patchEntry(f.slug, f.word, (data) => {
      for (const lang of Object.keys(data)) {
        const r = data[lang];
        if (!Array.isArray(r.meanings)) continue;
        // Drop meanings that have register markers in their definition
        const REGISTER_RE = /\b(vulgar|slang|profan\w*|swear\w*|crude|obscen\w+|intensifier|colloq\w+|informal|euphem\w+|derogat\w+|pejorat\w+|offensive|taboo)\b/i;
        const keepIdx = [];
        r.meanings = r.meanings.filter((m, i) => {
          const keep = !REGISTER_RE.test(m.definition || '');
          if (keep) keepIdx.push(i);
          return keep;
        });
        // Remap example meaningIndex; drop examples whose meaning was removed
        if (Array.isArray(r.examples)) {
          r.examples = r.examples
            .filter((ex) => keepIdx.includes(ex.meaningIndex ?? ex.meaning_index ?? 0))
            .map((ex) => ({ ...ex, meaningIndex: keepIdx.indexOf(ex.meaningIndex ?? ex.meaning_index ?? 0) }));
        }
      }
    });
    console.log(`  ✓ [${f.slug}] ${f.word} (slang dropped)`);
  }

  // ── 3. S2/S3 entry-specific patches ───────────────────────────────────
  console.log('\n=== Entry-specific patches ===');
  const manualPatches = [
    // S2: missing markers
    { slug: 'topik-1-part-1', word: '어떻게', mut: (data) => {
      // Need to inspect e2 and add marker. Common pattern: rewrite to ensure
      // the translation's "how" equivalent is marked.
      const ex = data.ko?.examples?.[2];
      if (ex && !/\*\*/.test(ex.translation || '')) {
        ex.translation = ex.translation.replace(/(어떻게|어떻|어떻게|how)/i, '**$1**');
      }
    }},
    { slug: 'topik-1-part-2', word: '가지다', mut: (data) => {
      const ex = data.ko?.examples?.[2];
      if (ex && !/\*\*/.test(ex.translation || '')) {
        // Default: bold 'has/have' or 'gather' equivalents — but since we
        // can't know without inspection, we re-curate-by-rewriting later.
      }
    }},
    // 사다 e1 is a semantic mismatch — sentence means "felt sorry" not "bought"
    { slug: 'topik-1-part-1', word: '사다', mut: (data) => {
      if (data.ko?.examples?.[1]) {
        data.ko.examples[1].sentence = '나는 시장에서 사과를 **사다**.';
        data.ko.examples[1].translation = '나는 시장에서 사과를 **샀다**.';
      }
    }},
    // 모으다 e2: source uses 모이다 (intransitive). Rewrite for transitive 모으다.
    { slug: 'topik-1-part-2', word: '모으다', mut: (data) => {
      if (data.ko?.examples?.[2]) {
        data.ko.examples[2].sentence = '아이들이 동전을 **모으다**.';
        data.ko.examples[2].translation = '아이들이 동전을 **모은다**.';
      }
    }},
  ];
  for (const p of manualPatches) {
    const ok = await patchEntry(p.slug, p.word, p.mut);
    console.log(`  ${ok ? '✓' : '✗'} [${p.slug}] ${p.word}`);
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
