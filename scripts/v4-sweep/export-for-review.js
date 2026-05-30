// Export the sweep NDJSON + full DB-side data into review-friendly markdown
// chunks. Output: one file per (sourceLang, category-group) so each chunk
// stays under ~4K lines and fits in Read's window.
//
// Usage:
//   node scripts/v4-sweep/export-for-review.js <ndjson_path>

const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ndjsonPath = process.argv[2];
if (!ndjsonPath) { console.error('usage: export-for-review.js <ndjson_path>'); process.exit(1); }

const outDir = path.join(path.dirname(ndjsonPath), 'review');
fs.mkdirSync(outDir, { recursive: true });

async function fetchFull(word, sourceLang, targetLang) {
  const { data } = await admin
    .from('word_entries')
    .select('headword, reading, word_translations!inner(meanings_translated, examples_translated, target_lang)')
    .eq('word', word)
    .eq('word_lang', sourceLang)
    .eq('word_translations.target_lang', targetLang)
    .maybeSingle();
  const trans = data?.word_translations?.[0];
  return {
    headword: data?.headword || word,
    reading: data?.reading || null,
    meanings: trans?.meanings_translated || [],
    examples: trans?.examples_translated || [],
  };
}

(async () => {
  const recs = fs.readFileSync(ndjsonPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const forwards = recs.filter((r) => r.type === 'forward' && r.quick?.ok && (r.quick?.meaningsCount ?? 0) > 0);
  const noteRecs = recs.filter((r) => r.type === 'forward' && r.quick?.ok && r.quick?.note);
  const reverses = recs.filter((r) => r.type === 'reverse' && r.ok);
  console.log(`Forwards: ${forwards.length}, note-rejected: ${noteRecs.length}, reverses: ${reverses.length}`);

  // Bucket forwards by sourceLang, then category-group.
  const CAT_GROUPS = {
    A_core: ['common', 'rare'],
    B_polysemy: ['polysemy', 'polyphone'],
    C_phrasal: ['idiom'],
    D_sensitive: ['profanity', 'disputed'],
    E_special: ['edge', 'number'],
    F_typo_wronglang: ['typo', 'wrong_lang'],
  };

  const SOURCE_LANGS = ['ko', 'ja', 'zh-CN', 'en', 'es', 'fr', 'de', 'it'];

  // Pre-fetch full data once per unique (word, source, target).
  const cache = new Map();
  let fetched = 0;
  const start = Date.now();
  async function getFull(word, sl, tl) {
    const k = `${word}|${sl}|${tl}`;
    if (cache.has(k)) return cache.get(k);
    const f = await fetchFull(word, sl, tl);
    cache.set(k, f);
    fetched++;
    if (fetched % 100 === 0) console.log(`  fetched ${fetched}…`);
    return f;
  }

  for (const sl of SOURCE_LANGS) {
    for (const [groupKey, cats] of Object.entries(CAT_GROUPS)) {
      const subset = forwards.filter((r) => r.sourceLang === sl && cats.includes(r.category));
      if (subset.length === 0) continue;

      const lines = [];
      lines.push(`# ${sl} — ${groupKey} (${cats.join(', ')})`);
      lines.push('');
      lines.push(`Total: ${subset.length} entries`);
      lines.push('');

      // Group by (word, then list all targets)
      const byWord = new Map();
      for (const r of subset) {
        if (!byWord.has(r.word)) byWord.set(r.word, []);
        byWord.get(r.word).push(r);
      }

      for (const [word, rows] of byWord) {
        // Fetch source-lang canonical (any target — same canonical content)
        const cat = rows[0].category;
        const note = rows[0].note ? ` _(${rows[0].note})_` : '';
        lines.push(`## \`${word}\` — ${cat}${note}`);
        const reading = rows[0].quick?.reading;
        if (reading && reading !== word) lines.push(`Reading/IPA: \`${reading}\``);
        lines.push('');
        for (const r of rows.sort((a, b) => a.targetLang.localeCompare(b.targetLang))) {
          const full = await getFull(word, sl, r.targetLang);
          lines.push(`### → ${r.targetLang}`);
          if (full.meanings.length === 0) {
            lines.push('_(no meanings in DB — possibly cached note)_');
            lines.push('');
            continue;
          }
          for (let i = 0; i < full.meanings.length; i++) {
            const m = full.meanings[i];
            lines.push(`${i + 1}. **${m.definition}** _(${m.partOfSpeech || '-'}${m.gender ? ', '+m.gender : ''}${m.register ? ', '+m.register : ''})_`);
          }
          if (full.examples.length > 0) {
            for (const ex of full.examples) {
              const mi = (ex.meaningIndex ?? 0) + 1;
              lines.push(`   - [m${mi}] ${ex.sentence}`);
              lines.push(`     → ${ex.translation}`);
            }
          } else {
            lines.push('   _(no examples)_');
          }
          lines.push('');
        }
        lines.push('---');
        lines.push('');
      }

      const outPath = path.join(outDir, `${sl}__${groupKey}.md`);
      fs.writeFileSync(outPath, lines.join('\n'));
      console.log(`  wrote ${outPath} (${subset.length} entries, ${byWord.size} unique words)`);
    }
  }

  // Reverse lookups: one file
  if (reverses.length > 0) {
    const lines = [];
    lines.push('# Reverse lookups');
    lines.push('');
    for (const r of reverses) {
      lines.push(`- **${r.studyLang}** ← \`${r.word}\` (${r.inputLang}) → ${(r.candidates || []).join(' / ') || '(none)'} _(${r.candidateCount || 0})_`);
    }
    fs.writeFileSync(path.join(outDir, 'reverse.md'), lines.join('\n'));
    console.log(`  wrote reverse.md (${reverses.length} entries)`);
  }

  // Note-rejected (system intentionally refused). Just a count summary.
  if (noteRecs.length > 0) {
    const lines = [];
    lines.push('# Note-rejected entries (system refused, by design)');
    lines.push('');
    const byNote = new Map();
    for (const r of noteRecs) {
      const k = `${r.quick?.note || '?'}`;
      if (!byNote.has(k)) byNote.set(k, []);
      byNote.get(k).push(r);
    }
    for (const [n, rows] of byNote) {
      lines.push(`## note=${n} (${rows.length} entries)`);
      lines.push('');
      const sample = rows.slice(0, 30);
      for (const r of sample) {
        lines.push(`- \`${r.word}\` (${r.sourceLang}→${r.targetLang}, cat=${r.category})${r.quick?.correctedHeadword ? ' → '+r.quick.correctedHeadword : ''}`);
      }
      if (rows.length > 30) lines.push(`- _(...${rows.length - 30} more)_`);
      lines.push('');
    }
    fs.writeFileSync(path.join(outDir, 'note-rejected.md'), lines.join('\n'));
    console.log(`  wrote note-rejected.md (${noteRecs.length} entries)`);
  }

  console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(1)}s. Output: ${outDir}`);
})().catch((e) => { console.error('Fatal:', e); process.exit(1); });
