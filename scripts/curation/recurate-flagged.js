/**
 * Re-curate words flagged by lint-curated.js, using forceFresh to bypass cache.
 *
 * Pipeline:
 *   node scripts/curation/lint-curated.js  →  produces lint-curated-report.json
 *   node scripts/curation/recurate-flagged.js [options]
 *
 * Options:
 *   --slug=<slug>          Only re-curate words from this wordlist slug
 *   --types=A,B,C          Only re-curate entries flagged with these issue types
 *                          (e.g. TARGET_LANG_LEAK_FR,ELISION_VIOLATION,FALSE_FRIEND)
 *   --types-exclude=A,B    Skip entries flagged ONLY with these types (avoid noisy ones)
 *   --concurrency=N        Parallelism (default 4)
 *   --dry-run              List what would be processed; don't call edge function
 *
 * Example: re-curate just the high-confidence categories
 *   node scripts/curation/recurate-flagged.js --types=TARGET_LANG_LEAK_FR,TARGET_LANG_LEAK_ES,ELISION_VIOLATION,FALSE_FRIEND,SYN_OPPOSITE,SYN_LANG_MIX,SELF_SYN_PAREN,HEADWORD_OFF
 *
 * Example: re-curate ALL flagged entries except the noisier categories
 *   node scripts/curation/recurate-flagged.js --types-exclude=KO_SOV,MARKER_HAS_PARTICLE
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function parseArg(name, def) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return def;
  return arg.split('=')[1];
}
const SLUG_FILTER = parseArg('slug', null);
const TYPES_FILTER = parseArg('types', null)?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const TYPES_EXCLUDE = parseArg('types-exclude', null)?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const CONCURRENCY = parseInt(parseArg('concurrency', '4'), 10);
const DRY_RUN = process.argv.includes('--dry-run');

function getIssueType(issue) { return issue.split(':')[0]; }

async function lookupWord(word, sourceLang, targetLang, proficiencyHint) {
  // v4 dict-first enrich: dict lookup + ai-judge + canonical example reuse
  // in one call. forceFresh skips cache and any prior canonical examples.
  const r = await admin.functions.invoke('word-lookup-v4', {
    body: {
      word, sourceLang, targetLang, mode: 'enrich',
      forceFresh: true, proficiencyHint,
    },
  });
  if (r.error) throw new Error(`lookup: ${r.error.message}`);
  const result = r.data?.result;
  if (!result || !Array.isArray(result.meanings) || result.meanings.length === 0) {
    return null;
  }
  return result;
}

async function main() {
  const reportPath = path.resolve(__dirname, 'lint-curated-report.json');
  if (!fs.existsSync(reportPath)) {
    console.error('lint-curated-report.json not found. Run lint-curated.js first.');
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  // Filter flags
  let flags = report.flags;
  if (SLUG_FILTER) flags = flags.filter((f) => f.slug === SLUG_FILTER);
  if (TYPES_FILTER) {
    flags = flags.filter((f) => f.issues.some((i) => TYPES_FILTER.includes(getIssueType(i))));
  }
  if (TYPES_EXCLUDE) {
    flags = flags.filter((f) => f.issues.some((i) => !TYPES_EXCLUDE.includes(getIssueType(i))));
  }

  console.log(`Selected ${flags.length} flagged entries to re-curate`);
  if (SLUG_FILTER) console.log(`  slug filter: ${SLUG_FILTER}`);
  if (TYPES_FILTER) console.log(`  types include: ${TYPES_FILTER.join(',')}`);
  if (TYPES_EXCLUDE) console.log(`  types exclude: ${TYPES_EXCLUDE.join(',')}`);

  // Group by (slug, word) so we re-curate ALL target_langs of that word in one shot
  // (any single flag means the whole row is suspect; cheaper to redo all langs).
  const wordsBySlug = new Map();
  for (const f of flags) {
    if (!wordsBySlug.has(f.slug)) wordsBySlug.set(f.slug, new Set());
    wordsBySlug.get(f.slug).add(f.word);
  }

  // Resolve wordlist meta — exam_type/level feed deriveProficiencyHint() so
  // beginner-tier (HSK 1-3 / JLPT N5-N4 / TOPIK 1 / DELF A1-A2) re-curations
  // get the same length cap and supporting-vocab tier the original curation used.
  const { data: lists, error: e1 } = await admin
    .from('curated_wordlists')
    .select('id, slug, source_lang, exam_type, level')
    .in('slug', [...wordsBySlug.keys()]);
  if (e1) throw e1;
  const listMeta = new Map(lists.map((l) => [l.slug, l]));

  let totalUnits = 0;
  for (const set of wordsBySlug.values()) totalUnits += set.size;
  console.log(`Total unique (slug,word) units: ${totalUnits}`);
  if (DRY_RUN) {
    for (const [slug, words] of wordsBySlug) {
      console.log(`  [${slug}] ${words.size} words: ${[...words].slice(0, 10).join(', ')}${words.size > 10 ? '…' : ''}`);
    }
    return;
  }

  // Build flat work list: { slug, sourceLang, listId, word, readingKey, targetLangs }
  const work = [];
  for (const [slug, words] of wordsBySlug) {
    const meta = listMeta.get(slug);
    if (!meta) { console.warn(`  meta not found for ${slug}, skipping`); continue; }
    const { data: rows, error: e2 } = await admin
      .from('curated_words')
      .select('word, reading_key, results_by_target_lang, display_order')
      .eq('curated_wordlist_id', meta.id)
      .in('word', [...words]);
    if (e2) throw e2;
    const proficiencyHint = deriveProficiencyHint(meta);
    for (const r of rows) {
      const targetLangs = Object.keys(r.results_by_target_lang || {});
      work.push({
        slug, listId: meta.id, sourceLang: meta.source_lang,
        word: r.word, readingKey: r.reading_key ?? '',
        displayOrder: r.display_order, targetLangs,
        existingResults: r.results_by_target_lang,
        proficiencyHint,
      });
    }
  }
  console.log(`Concrete DB rows to re-curate: ${work.length}`);

  let done = 0, ok = 0, fail = 0;
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= work.length) return;
      const item = work[i];
      const label = item.readingKey ? `${item.word}[${item.readingKey}]` : item.word;
      try {
        const newResults = { ...item.existingResults };
        // Re-curate each target lang sequentially within a word (quick+enrich = 2 calls per lang)
        for (const tl of item.targetLangs) {
          const r = await lookupWord(item.word, item.sourceLang, tl, item.proficiencyHint);
          if (r) newResults[tl] = r;
        }
        const { error } = await admin
          .from('curated_words')
          .upsert({
            curated_wordlist_id: item.listId,
            word: item.word,
            reading_key: item.readingKey,
            display_order: item.displayOrder,
            results_by_target_lang: newResults,
          }, { onConflict: 'curated_wordlist_id,word,reading_key' });
        if (error) throw error;
        ok++;
        console.log(`  ✓ [${item.slug}] ${label} → ${item.targetLangs.join(',')}`);
      } catch (e) {
        fail++;
        console.warn(`  ✗ [${item.slug}] ${label}: ${e.message}`);
      } finally {
        done++;
        if (done % 10 === 0 || done === work.length) {
          console.log(`  [${done}/${work.length}] ok=${ok} fail=${fail}`);
        }
      }
    }
  });
  await Promise.all(workers);

  console.log(`\n✅ Done: ${ok} re-curated, ${fail} failed`);
  console.log(`Now re-run: node scripts/curation/lint-curated.js`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
