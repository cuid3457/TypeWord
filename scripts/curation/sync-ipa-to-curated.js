// sync-ipa-to-curated.js
// ────────────────────────────────────────────────────────────────────────────
// Copies canonical word_entries.ipa INTO curated_words.results_by_target_lang
// for each target language slot. Use after backfill-ipa.js fills the canonical.
//
// Usage:
//   node scripts/curation/sync-ipa-to-curated.js --slug=toeic-600 [--dry]
// ────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

function arg(name, def) {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return def;
  if (a === `--${name}`) return true;
  return a.split('=')[1];
}

const SLUG = arg('slug');
const DRY = !!arg('dry', false);
if (!SLUG) {
  console.error('Usage: node sync-ipa-to-curated.js --slug=<slug> [--dry]');
  process.exit(1);
}

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

(async () => {
  const { data: list } = await admin
    .from('curated_wordlists')
    .select('id, slug, source_lang')
    .eq('slug', SLUG)
    .single();
  if (!list) {
    console.error(`Wordlist not found: ${SLUG}`);
    process.exit(1);
  }

  const { data: words } = await admin
    .from('curated_words')
    .select('id, word, reading_key, display_order, results_by_target_lang')
    .eq('curated_wordlist_id', list.id);

  const wordSet = Array.from(new Set(words.map((w) => w.word)));
  const { data: entries } = await admin
    .from('word_entries')
    .select('word, ipa')
    .eq('word_lang', list.source_lang)
    .in('word', wordSet);

  const ipaByWord = new Map();
  for (const e of entries) if (e.ipa) ipaByWord.set(e.word, e.ipa);

  console.log(`List: ${list.slug} (${list.source_lang})`);
  console.log(`Curated words: ${words.length}`);
  console.log(`Canonical IPAs available: ${ipaByWord.size}`);
  console.log(DRY ? '[DRY-RUN]\n' : '');

  let patched = 0;
  let unchanged = 0;
  let noCanonical = 0;

  for (const w of words) {
    const canonicalIpa = ipaByWord.get(w.word);
    if (!canonicalIpa) {
      noCanonical++;
      continue;
    }
    const existing = w.results_by_target_lang ?? {};
    let dirty = false;
    const updated = {};
    for (const [tl, result] of Object.entries(existing)) {
      if (result && result.ipa !== canonicalIpa) {
        updated[tl] = { ...result, ipa: canonicalIpa };
        dirty = true;
      } else {
        updated[tl] = result;
      }
    }
    if (dirty) {
      if (DRY) {
        console.log(`  [dry] ${w.word} → ipa=${canonicalIpa} (${Object.keys(updated).join(',')})`);
      } else {
        const { error: upErr } = await admin
          .from('curated_words')
          .update({ results_by_target_lang: updated })
          .eq('id', w.id);
        if (upErr) {
          console.error(`  ${w.word} update failed: ${upErr.message}`);
          continue;
        }
      }
      patched++;
    } else {
      unchanged++;
    }
  }

  console.log(`\npatched=${patched}, unchanged=${unchanged}, no_canonical_ipa=${noCanonical}`);
})();
