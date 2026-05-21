/**
 * JLPT N5 mechanical marker repair — phase 5.
 *
 * Two repair strategies, applied in order per sentence:
 *  1. repositionMarker:  if the headword appears literally in the stripped
 *                        sentence, drop existing markers and mark the headword.
 *  2. extendTruncatedMarker: ** X ** Y → ** XY ** when XY === headword
 *                        (model truncated trailing kana of short kana adverbs).
 *
 * Also fixes the residual non-marker issues:
 *  - S5 きっと synonym dedupe (missed in phase 1)
 *  - S8 manual reading for 一緒に / 失礼します (lookup rejects them as phrases)
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

function stripMarkers(s) {
  return s.replace(/\*\*([^*]+)\*\*/g, '$1');
}

function markerInflectionMatches(marker, headword) {
  // Exact match
  if (marker === headword) return true;
  // Marker is the headword stem + okurigana variation (verb conjugation, i-adj inflection).
  // Headword is a verb dict-form ending in る/く/す/む/つ/ぬ/ぶ/ぐ/う?
  const verbStem = headword.match(/^(.+?)([るくすむつぬぶぐう])$/);
  if (verbStem) {
    const stem = verbStem[1];
    if (marker.startsWith(stem)) return true;
  }
  // Headword is i-adjective?
  if (/^(.+)い$/.test(headword)) {
    const stem = headword.slice(0, -1);
    if (marker.startsWith(stem)) return true;
  }
  // Headword contained in marker
  if (marker.includes(headword)) return true;
  return false;
}

function repairSentence(sentence, headword) {
  if (!sentence) return sentence;
  // 1. If sentence ALREADY contains a valid marker matching the headword, leave it.
  const existing = [...sentence.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]);
  for (const e of existing) {
    if (markerInflectionMatches(e, headword)) return sentence;
  }
  // 2. Try extending truncated marker: ** X ** Y where XY contains headword.
  //    Allow Y to be the missing tail (1-2 chars) of headword.
  const extended = sentence.replace(/\*\*([^*]+)\*\*([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]{1,3})/u, (full, m1, tail) => {
    const combined = m1 + tail;
    if (combined === headword || markerInflectionMatches(combined, headword)) {
      return `**${combined}**`;
    }
    return full;
  });
  if (extended !== sentence) {
    // Verify the new sentence has a valid marker
    const newMarkers = [...extended.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]);
    if (newMarkers.some((m) => markerInflectionMatches(m, headword))) return extended;
  }
  // 3. Reposition: if headword (or simple inflected form) appears in stripped sentence, re-mark there.
  const stripped = stripMarkers(sentence);
  const candidates = [headword];
  // Add common verb inflections
  if (/[るくすむつぬぶぐう]$/.test(headword)) {
    const stem = headword.slice(0, -1);
    candidates.push(stem + 'ます', stem + 'ました', stem + 'ません', stem + 'て', stem + 'た');
  }
  // Add i-adjective inflections
  if (/い$/.test(headword)) {
    const stem = headword.slice(0, -1);
    candidates.push(stem + 'く', stem + 'くて', stem + 'かった', stem + 'くない');
  }
  for (const cand of candidates) {
    const idx = stripped.indexOf(cand);
    if (idx !== -1) {
      return stripped.slice(0, idx) + '**' + cand + '**' + stripped.slice(idx + cand.length);
    }
  }
  // No repair possible
  return null;
}

async function patchEntry(slug, word, mutate) {
  const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
  const { data: row } = await admin.from('curated_words')
    .select('results_by_target_lang')
    .eq('curated_wordlist_id', list.id).eq('word', word).maybeSingle();
  if (!row) return null;
  const updated = JSON.parse(JSON.stringify(row.results_by_target_lang));
  const note = mutate(updated);
  if (note === null) return null;
  await admin.from('curated_words')
    .update({ results_by_target_lang: updated })
    .eq('curated_wordlist_id', list.id).eq('word', word);
  return note;
}

async function main() {
  // Collect all (slug, word) pairs flagged with S2 or S3.
  const markerTargets = new Set();
  for (const f of report.flags) {
    if (f.issues.some((i) => i.startsWith('S2:') || i.startsWith('S3:'))) {
      markerTargets.add(`${f.slug}|${f.word}`);
    }
  }
  console.log(`Marker repair targets: ${markerTargets.size}`);

  let repairedSentences = 0;
  let unrepaired = [];
  for (const key of markerTargets) {
    const [slug, word] = key.split('|');
    const note = await patchEntry(slug, word, (data) => {
      let count = 0;
      for (const lang of Object.keys(data)) {
        if (!Array.isArray(data[lang]?.examples)) continue;
        for (const ex of data[lang].examples) {
          // Repair sentence (JA source) if it lacks a valid marker
          const newSentence = repairSentence(ex.sentence, word);
          if (newSentence && newSentence !== ex.sentence) {
            ex.sentence = newSentence;
            count++;
          }
        }
      }
      return count;
    });
    if (note > 0) {
      repairedSentences += note;
    } else {
      unrepaired.push(key);
    }
  }
  console.log(`Repaired ${repairedSentences} sentence markers across ${markerTargets.size - unrepaired.length} entries.`);
  console.log(`Unrepaired: ${unrepaired.length}`);
  if (unrepaired.length > 0 && unrepaired.length <= 30) {
    console.log('  ' + unrepaired.join('\n  '));
  }

  // ── Reading manual fill ────────────────────────────────────────────────
  console.log('\n=== Manual reading fill ===');
  const readingPatches = [
    ['jlpt-n5-part-1', '一緒に', ['いっしょに']],
    ['jlpt-n5-part-2', '失礼します', ['しつれいします']],
  ];
  for (const [slug, word, reading] of readingPatches) {
    await patchEntry(slug, word, (data) => {
      for (const lang of Object.keys(data)) {
        if (!Array.isArray(data[lang].reading) || data[lang].reading.length === 0) {
          data[lang].reading = [...reading];
        }
      }
      return 1;
    });
    console.log(`  ✓ [${slug}] ${word}: reading set to [${reading.join(',')}]`);
  }

  // ── Synonym dedupe (きっと) ────────────────────────────────────────────
  console.log('\n=== Synonym dedupe (きっと) ===');
  await patchEntry('jlpt-n5-part-2', 'きっと', (data) => {
    let removed = 0;
    for (const lang of Object.keys(data)) {
      if (!Array.isArray(data[lang]?.synonyms)) continue;
      const before = data[lang].synonyms.length;
      data[lang].synonyms = data[lang].synonyms.filter((s) => s.trim() !== 'きっと');
      removed += before - data[lang].synonyms.length;
    }
    return removed;
  });
  console.log('  ✓ きっと: synonym dedupe applied');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
