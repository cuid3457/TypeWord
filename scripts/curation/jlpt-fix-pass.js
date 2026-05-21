/**
 * JLPT N5 fix pass — phase 1: auto-patches + reading backfill
 *
 *  D. Synonym = headword                → strip
 *  E. Parenthesized synonym             → strip
 *  A. Reading missing on kanji headword → copy from sibling lang if present;
 *                                         fall back to dedicated quick-lookup
 *
 * Reads jlpt-full-audit-report.json to know which entries to touch.
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

const report = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'jlpt-full-audit-report.json'), 'utf8'));

async function getList(slug) {
  const { data } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
  return data?.id;
}

async function patchOneRow(slug, word, mutate) {
  const id = await getList(slug);
  const { data: row } = await admin.from('curated_words')
    .select('results_by_target_lang')
    .eq('curated_wordlist_id', id).eq('word', word).maybeSingle();
  if (!row) return null;
  const updated = JSON.parse(JSON.stringify(row.results_by_target_lang));
  const note = mutate(updated);
  if (note === null) return note;
  const { error } = await admin.from('curated_words')
    .update({ results_by_target_lang: updated })
    .eq('curated_wordlist_id', id).eq('word', word);
  if (error) throw new Error(error.message);
  return note;
}

async function fetchReading(word) {
  const r = await fetch(process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1/word-lookup', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ word, sourceLang: 'ja', targetLang: 'en', mode: 'quick', forceFresh: true }),
  });
  const j = await r.json();
  const reading = j.result?.reading;
  return Array.isArray(reading) && reading.length > 0 ? reading : null;
}

async function main() {
  // Build target sets per type from audit flags.
  const synEqHeadword = new Set();   // `${slug}|${word}` → patch all langs in entry
  const synParen = new Set();
  const readingMissing = new Map();  // `${slug}|${word}` → Set of langs missing reading
  for (const f of report.flags) {
    const key = `${f.slug}|${f.word}`;
    for (const i of f.issues) {
      if (i.startsWith('S5:eq_headword')) synEqHeadword.add(key);
      else if (i.startsWith('S5:paren')) synParen.add(key);
      else if (i.startsWith('S6:eq_headword')) synEqHeadword.add(key);
      else if (i.startsWith('S6:paren')) synParen.add(key);
      else if (i.startsWith('S8:no_reading_for_kanji')) {
        if (!readingMissing.has(key)) readingMissing.set(key, new Set());
        readingMissing.get(key).add(f.lang);
      }
    }
  }

  // ── D + E: synonym/antonym cleanup ────────────────────────────────────────
  console.log('=== D + E: synonym/antonym cleanup ===');
  const synCleanup = new Set([...synEqHeadword, ...synParen]);
  for (const key of synCleanup) {
    const [slug, word] = key.split('|');
    const note = await patchOneRow(slug, word, (data) => {
      let changed = 0;
      for (const lang of Object.keys(data)) {
        for (const field of ['synonyms', 'antonyms']) {
          if (!Array.isArray(data[lang][field])) continue;
          const before = data[lang][field].length;
          data[lang][field] = data[lang][field].filter((s) => {
            if (typeof s !== 'string') return false;
            if (s.trim() === word) return false;
            if (/[\(\)（）]/.test(s)) return false;
            return true;
          });
          changed += before - data[lang][field].length;
        }
      }
      return changed;
    });
    console.log(`  ${note > 0 ? '✓' : '·'} [${slug}] ${word}: removed ${note}`);
  }

  // ── A: reading backfill ──────────────────────────────────────────────────
  console.log('\n=== A: reading backfill ===');
  let copyCount = 0;
  let fetchCount = 0;
  let stillMissingCount = 0;
  for (const [key, missingLangs] of readingMissing.entries()) {
    const [slug, word] = key.split('|');
    await patchOneRow(slug, word, (data) => {
      const langs = Object.keys(data);
      // Find any sibling lang that has reading
      let donor = null;
      for (const lang of langs) {
        const r = data[lang]?.reading;
        if (Array.isArray(r) && r.length > 0 && r[0]) { donor = r; break; }
      }
      if (donor) {
        for (const lang of langs) {
          const cur = data[lang]?.reading;
          if (!Array.isArray(cur) || cur.length === 0) {
            data[lang].reading = [...donor];
            copyCount++;
          }
        }
        return 'copied';
      }
      return null; // no donor, will fetch outside transaction
    });
  }
  // Second pass — for entries where no sibling had reading, do a fresh quick lookup
  for (const [key, missingLangs] of readingMissing.entries()) {
    const [slug, word] = key.split('|');
    const id = await getList(slug);
    const { data: row } = await admin.from('curated_words')
      .select('results_by_target_lang').eq('curated_wordlist_id', id).eq('word', word).maybeSingle();
    if (!row) continue;
    const langs = Object.keys(row.results_by_target_lang);
    const stillMissing = langs.filter((l) => {
      const r = row.results_by_target_lang[l]?.reading;
      return !Array.isArray(r) || r.length === 0 || !r[0];
    });
    if (stillMissing.length === 0) continue;
    const fresh = await fetchReading(word);
    if (!fresh) {
      console.log(`  ✗ [${slug}] ${word}: lookup failed, still missing in ${stillMissing.join(',')}`);
      stillMissingCount++;
      continue;
    }
    const updated = JSON.parse(JSON.stringify(row.results_by_target_lang));
    for (const lang of stillMissing) updated[lang].reading = [...fresh];
    await admin.from('curated_words')
      .update({ results_by_target_lang: updated })
      .eq('curated_wordlist_id', id).eq('word', word);
    fetchCount += stillMissing.length;
    console.log(`  ✓ [${slug}] ${word}: fetched [${fresh.join(',')}] → filled ${stillMissing.length} lang(s)`);
  }

  console.log(`\nReading backfill summary: copied ${copyCount}, fetched ${fetchCount}, still missing ${stillMissingCount}`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
