/**
 * Mechanical grammar fixes — pure deterministic transformations of model
 * output, NOT content generation. Two passes:
 *   1. French elision: "Je écris" → "J'écris" etc. (le/la/de/je/ne/que/
 *      ce/se/me/te + vowel/h-muet → contraction)
 *   2. Korean SOV reorder: "**verb** obj." → "obj **verb**." for clauses
 *      where the bolded verb is followed by a marker-postposition word
 *      (을/를/이/가/은/는/에/에서/로/으로/도/만/와/과) before the next
 *      sentence boundary.
 *
 * Targets: every active wordlist with a French source (elision) or any
 * wordlist with a Korean target (SOV).
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ── French elision ──────────────────────────────────────────────────────
const ELIDABLE = ['Je', 'je', 'Le', 'le', 'La', 'la', 'De', 'de', 'Ne', 'ne', 'Que', 'que', 'Ce', 'ce', 'Se', 'se', 'Me', 'me', 'Te', 'te'];
const VOWEL_INITIAL = /^[aàâäeéèêëiîïoôöuùûüAÀÂÄEÉÈÊËIÎÏOÔÖUÙÛÜ]/;
// Common h-muet words. Conservative list — when in doubt, don't elide.
const H_MUET_WORDS = new Set(['homme', 'hommes', 'hôtel', 'hôtels', 'heure', 'heures', 'herbe', 'herbes', 'histoire', 'histoires', 'hiver', 'hivers', 'horloge', 'horloges', 'hôpital', 'hôpitaux', 'huile', 'huiles', 'habite', 'habites', 'habitent', 'habitons', 'habitez', 'habiter', 'habité', 'habitée', 'habités', 'habitées', 'honneur', 'honneurs', 'humide', 'humides', 'humeur', 'humeurs', 'humain', 'humains', 'humaine', 'humaines', 'humble', 'humbles']);

function elide(short) {
  // Map of full → contracted form
  const map = { Je: "J'", je: "j'", Le: "L'", le: "l'", La: "L'", la: "l'", De: "D'", de: "d'", Ne: "N'", ne: "n'", Que: "Qu'", que: "qu'", Ce: "C'", ce: "c'", Se: "S'", se: "s'", Me: "M'", me: "m'", Te: "T'", te: "t'" };
  return map[short];
}

function applyFrenchElision(s) {
  if (!s) return s;
  // Match: word boundary + (elidable) + space + (next word)
  return s.replace(/\b(Je|je|Le|le|La|la|De|de|Ne|ne|Que|que|Ce|ce|Se|se|Me|me|Te|te)\s+(\*\*)?([\wÀ-ÿ]+)/g, (full, det, marker, next) => {
    const lower = next.toLowerCase();
    const isVowel = VOWEL_INITIAL.test(next);
    const isHMuet = H_MUET_WORDS.has(lower);
    if (!isVowel && !isHMuet) return full;
    return elide(det) + (marker || '') + next;
  });
}

// ── Korean SOV reorder ──────────────────────────────────────────────────
// Pattern: "PREFIX **VERB** TAIL POST PUNCT" where TAIL+POST contains a Korean
// postposition (을/를/이/가/은/는/에/에서/로/으로/도/만/와/과) within the
// next 1–10 chars of the marker. Reorder to "PREFIX TAIL POST **VERB** PUNCT".
function applyKoreanSov(s) {
  if (!s) return s;
  // Run multiple passes since one sentence can have multiple clauses.
  // Match: anything... + "**verb**" + space-or-empty + word-with-postposition + ...
  const re = /(\*\*[^*]+\*\*)\s+([^\s.!?,]*[을를이가은는와과도만에]\S*)\s*([.!?,])/u;
  let prev = null;
  while (s !== prev) {
    prev = s;
    s = s.replace(re, (full, marker, tail, punct) => {
      // Only swap when the tail "looks like" an object/adverb (has postposition)
      // — keep punctuation in place.
      return `${tail} ${marker}${punct}`;
    });
  }
  return s;
}

async function main() {
  const { data: lists } = await admin.from('curated_wordlists')
    .select('id, slug, source_lang').eq('is_active', true);
  let elisionFixCount = 0;
  let sovFixCount = 0;
  let entriesUpdated = 0;
  for (const list of lists) {
    const isFr = list.source_lang === 'fr';
    const { data: rows } = await admin.from('curated_words')
      .select('word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const row of rows || []) {
      const updated = JSON.parse(JSON.stringify(row.results_by_target_lang));
      let changed = false;
      for (const lang of Object.keys(updated)) {
        const r = updated[lang];
        if (!Array.isArray(r.examples)) continue;
        for (const ex of r.examples) {
          if (isFr && ex.sentence) {
            const after = applyFrenchElision(ex.sentence);
            if (after !== ex.sentence) {
              ex.sentence = after;
              elisionFixCount++;
              changed = true;
            }
          }
          if (lang === 'ko' && ex.translation) {
            const after = applyKoreanSov(ex.translation);
            if (after !== ex.translation) {
              ex.translation = after;
              sovFixCount++;
              changed = true;
            }
          }
        }
      }
      if (changed) {
        await admin.from('curated_words')
          .update({ results_by_target_lang: updated })
          .eq('curated_wordlist_id', list.id).eq('word', row.word);
        entriesUpdated++;
      }
    }
  }
  console.log(`Elision fixes: ${elisionFixCount}`);
  console.log(`Korean SOV reorders: ${sovFixCount}`);
  console.log(`Entries updated: ${entriesUpdated}`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
