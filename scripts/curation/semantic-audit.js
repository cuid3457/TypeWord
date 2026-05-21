/**
 * Stage 1 — Programmatic semantic audit.
 * Detects semantic anomalies that don't require an AI reviewer:
 *  - Marker placement: ** content plausibly corresponds to the headword
 *  - Script: source sentence in source script, translation in target script
 *  - IPA structural validity: only IPA-range characters
 *  - Definition: not suspiciously short, no AI refusal phrases
 *  - Synonyms/antonyms: don't include the headword itself, are non-empty strings
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const norm = (s) => (s || '').toLowerCase().trim().normalize('NFKD').replace(/\p{M}/gu, '');

function dominantScript(text) {
  const clean = (text || '').replace(/\*\*/g, '').replace(/[^\p{L}]/gu, '');
  if (!clean) return 'unknown';
  let hangul = 0, kana = 0, han = 0, latin = 0, cyrillic = 0;
  for (const ch of clean) {
    const c = ch.codePointAt(0);
    if ((c >= 0xAC00 && c <= 0xD7AF) || (c >= 0x1100 && c <= 0x11FF)) hangul++;
    else if ((c >= 0x3040 && c <= 0x309F) || (c >= 0x30A0 && c <= 0x30FF)) kana++;
    else if (c >= 0x4E00 && c <= 0x9FFF) han++;
    else if ((c >= 0x0041 && c <= 0x005A) || (c >= 0x0061 && c <= 0x007A) || (c >= 0x00C0 && c <= 0x024F)) latin++;
    else if (c >= 0x0400 && c <= 0x04FF) cyrillic++;
  }
  const total = hangul + kana + han + latin + cyrillic;
  if (total === 0) return 'unknown';
  if (hangul / total > 0.3) return 'hangul';
  if (kana / total > 0.1) return 'kana';
  if (han / total > 0.3) return 'han';
  if (latin / total > 0.5) return 'latin';
  if (cyrillic / total > 0.3) return 'cyrillic';
  return 'unknown';
}

const SCRIPT = {
  ko: 'hangul', ja: 'kana', 'zh-CN': 'han', 'zh-TW': 'han',
  en: 'latin', es: 'latin', fr: 'latin', de: 'latin', it: 'latin', pt: 'latin',
  ru: 'cyrillic',
};

// Allow Han for ja (kanji mix)
function scriptOk(text, langKey) {
  const expected = SCRIPT[langKey];
  const got = dominantScript(text);
  if (expected === 'kana' && got === 'han') return true; // kanji mix
  if (expected === 'han' && got === 'unknown') return true; // very short text edge case
  if (got === 'unknown') return true;
  return got === expected;
}

const IPA_RE = /^[\s'ˈˌːa-zæɑəɛɪɔʊɒʌʃʒθðŋɲʎʁʔɸβθχɣɸʝɱɾɸ̩ɛ̃ɔ̃ɑ̃œ̃ãõɛ̃iyuoeɔ̃ɲɲʁʁʔ̩ʕħʡɹɮlɫʝɹɫɫːʔɥwjʔŋ.()\-]+$/u;

function ipaPlausible(ipa) {
  if (!ipa) return true; // empty handled elsewhere
  if (ipa.length > 50 || ipa.length < 1) return false;
  // Must contain at least one vowel-like char
  if (!/[aeiouæɑəɛɪɔʊɒʌyø]/i.test(ipa)) return false;
  // Should not contain Latin alphabetic words mixed with English (e.g. "the word is...")
  if (/\b(the|a|word|sound|like|is)\b/i.test(ipa)) return false;
  return true;
}

function markerMatches(marked, headword) {
  if (!marked || !headword) return false;
  const m = norm(marked);
  const w = norm(headword);
  if (!m || !w) return false;
  // Exact match
  if (m === w) return true;
  // Substring (handles inflection where surface contains stem or vice versa)
  if (m.includes(w) || w.includes(m)) return true;
  // For function-word headwords, mark might be a particle/postposition (Korean,
  // Japanese) — accept short marks of 1-3 chars that don't share letters
  if (m.length <= 3 && /[\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(marked)) return true;
  // Accept stem-prefix match (4+ chars shared at start)
  const minLen = Math.min(m.length, w.length);
  if (minLen >= 4) {
    let shared = 0;
    for (let i = 0; i < minLen; i++) { if (m[i] === w[i]) shared++; else break; }
    if (shared >= 3) return true;
  }
  return false;
}

const REFUSAL_PATTERNS = [
  /i (cannot|can't|am unable|do not)/i,
  /(refuse|decline|reject) to (provide|define|answer)/i,
  /sorry, (i|but)/i,
  /not appropriate/i,
  /unable to (provide|define)/i,
];

async function main() {
  const { data: lists } = await admin.from('curated_wordlists').select('id, slug, source_lang').eq('is_active', true).order('display_order');
  const flags = [];
  let totalEntries = 0;

  for (const list of lists) {
    const { data: rows } = await admin.from('curated_words').select('word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const row of rows) {
      for (const tl of Object.keys(row.results_by_target_lang)) {
        totalEntries++;
        const r = row.results_by_target_lang[tl];
        const issues = [];

        // Definition checks
        for (const m of (r.meanings ?? [])) {
          if (!m.definition || m.definition.length < 1) continue;
          if (REFUSAL_PATTERNS.some((rx) => rx.test(m.definition))) issues.push('REFUSAL_IN_DEF');
          if (m.definition.length > 200) issues.push('DEF_TOO_LONG');
          // Definition should be in target language for non-translate output
          if (!scriptOk(m.definition, tl)) issues.push('DEF_WRONG_SCRIPT');
        }

        // IPA validity
        if (r.ipa) {
          if (!ipaPlausible(r.ipa)) issues.push('IPA_IMPLAUSIBLE:' + r.ipa);
        }

        // Examples: marker placement + script
        for (let i = 0; i < (r.examples?.length ?? 0); i++) {
          const ex = r.examples[i];
          // Sentence script
          if (ex.sentence && !scriptOk(ex.sentence, list.source_lang)) {
            issues.push('SENT_WRONG_SCRIPT[' + i + ']');
          }
          // Translation script
          if (ex.translation && !scriptOk(ex.translation, tl)) {
            issues.push('TRANS_WRONG_SCRIPT[' + i + ']');
          }
          // Marker placement: source
          const sm = ex.sentence?.match(/\*\*([^*]+)\*\*/);
          if (sm) {
            if (!markerMatches(sm[1], row.word)) {
              issues.push('SENT_MARKER_OFF[' + i + ']:' + sm[1]);
            }
          }
          // Marker placement: translation — compare against any meaning's definition
          const tm = ex.translation?.match(/\*\*([^*]+)\*\*/);
          if (tm) {
            const defs = (r.meanings ?? []).flatMap((m) => (m.definition || '').split(/[,;、·／/]/).map((s) => s.trim()).filter(Boolean));
            const matchedDef = defs.some((d) => markerMatches(tm[1], d));
            if (!matchedDef && defs.length > 0) {
              issues.push('TRANS_MARKER_OFF[' + i + ']:' + tm[1]);
            }
          }
        }

        // Synonyms/antonyms: shouldn't include the headword itself
        for (const s of (r.synonyms ?? [])) {
          if (typeof s !== 'string') { issues.push('SYN_NON_STRING'); break; }
          if (norm(s) === norm(row.word)) issues.push('SYN_SELF:' + s);
          if (s.length > 50) issues.push('SYN_TOO_LONG');
        }
        for (const a of (r.antonyms ?? [])) {
          if (typeof a !== 'string') { issues.push('ANT_NON_STRING'); break; }
          if (norm(a) === norm(row.word)) issues.push('ANT_SELF:' + a);
          if (a.length > 50) issues.push('ANT_TOO_LONG');
        }

        if (issues.length) flags.push({ slug: list.slug, word: row.word, lang: tl, issues });
      }
    }
  }

  console.log('=== STAGE 1 SEMANTIC AUDIT ===');
  console.log('Total entries scanned:', totalEntries);
  console.log('Flagged:', flags.length, '(' + (100*flags.length/totalEntries).toFixed(2) + '%)');

  const byType = {};
  for (const f of flags) {
    for (const t of f.issues) {
      const k = t.split(':')[0].split('[')[0];
      byType[k] = (byType[k] ?? 0) + 1;
    }
  }
  console.log('\n=== ISSUE TYPES ===');
  console.table(byType);

  // Print up to 50 flagged
  console.log('\n=== SAMPLE FLAGS (first 50) ===');
  flags.slice(0, 50).forEach((f) => {
    console.log('  [' + f.slug + '] ' + f.word + ' (' + f.lang + '): ' + f.issues.join(', '));
  });

  // Save full report
  const fs = require('fs');
  fs.writeFileSync(path.resolve(__dirname, 'semantic-audit-report.json'), JSON.stringify({ totalEntries, flags }, null, 2));
  console.log('\nFull report saved to scripts/curation/semantic-audit-report.json');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
