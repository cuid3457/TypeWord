// Auto-rewrite flagged curated_words entries.
//
// Input: flagged entries from _llm-audit.js output (llm-audit-flags.json).
// Process: for each flag, call gpt-4.1 with the current entry + audit issues
//          + prompt asking for a corrected version. Update DB.
// Re-audit: pass results through audit again. PASS entries kept; remaining
//           FLAG entries dumped to llm-rewrite-still-failing.json for
//           manual review.
//
// Usage:
//   node _llm-rewrite.js              — process llm-audit-flags.json
//   node _llm-rewrite.js --dry         — print rewrites without DB update
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const DRY = process.argv.includes('--dry');

const REWRITE_SYSTEM = `You are a strict editor of a language-learning vocabulary entry. You will receive ONE entry plus a list of specific issues identified by a native-speaker quality audit. Your job is to produce a corrected entry that addresses every issue.

INPUT contains:
- word_lang: the SOURCE language (e.g. Korean) — the language of the headword + example sentences
- headword: the word being defined (in word_lang)
- meanings: list of senses with definition + partOfSpeech BOTH WRITTEN IN ENGLISH (this is an English-target entry)
- examples: list of example sentences. sentence is in word_lang with **marker** on the headword. translation is in English.
- issues: specific problems identified by the audit

OUTPUT: corrected entry, SAME format as input:
- definitions and partOfSpeech in ENGLISH (NOT in word_lang)
- example sentences in word_lang, English translations in English

AUDIT ISSUE INTERPRETATION:
- "meaning X is not standalone / compound-only / forced" → REMOVE meaning X
- "main sense X is missing / primary sense not listed" → ADD the missing sense (and its example)
- "example uses sense X but is labeled as sense Y" → FIX meaning_index, or rewrite sentence to demonstrate the correct sense
- "marker is on wrong word" → REWRITE sentence with marker on the headword
- "translation does not match" → FIX translation
- "Korean state-adjective lacks subject" → REWRITE with state-bearer noun

Decide carefully: remove vs fix vs add. Some flags require ADDING a missing common sense, not just removing the bad one.

CORE RULES (must hold in output):
1. Meanings must be STANDALONE senses of the bare headword. Reject compound-only / character-dictionary-only senses (e.g. Korean Sino monosyllables where the abstract sense only surfaces in compounds).
2. Example sentences must be NATURAL — a native speaker would actually produce them. The marker (**) is on the EXACT headword (or its valid inflection), NEVER on adjacent verb / adjective / particle / related compound.
3. Each example demonstrates the SENSE at its meaning_index. The sentence's actual meaning must match the listed meaning.
4. Korean specifics: numeral-counter pairing (sino numeral↔sino counter, native numeral↔native counter); state-adjectives need state-bearer subject (배가 부르다, 머리가 아프다); verb senses include typical object (노래를 부른다); source sentences end with terminal punctuation.
5. Bare Korean verb / adjective stems (without -다) are NOT lexemes. The bare stem returns only noun / non-verb senses. Sell sense belongs to 팔다 (verb form), not 팔 (bare).
6. Meanings-Examples PARITY: final meaning count = final example count (capped at 3). If you can't construct a natural example for a meaning, drop both the meaning and its example slot.
7. Slang / vulgar / derogatory secondary senses are NEVER included (this is a learning tool, not a dictionary).
8. INCLUSION-FAVORED: when an audit says a primary sense is missing (like 아침=morning + 아침=breakfast as common dual sense), ADD it. Don't be conservative — the goal is to cover common polysemy, not minimize entries.
9. English translation: accurate to the source's actual meaning AND natural English.

Output strict JSON:
{
  "meanings": [ { "definition": "<English>", "partOfSpeech": "<English>" } ],
  "examples": [ { "sentence": "<word_lang>", "meaning_index": number, "translation": "<English>" } ]
}

Definitions in English. partOfSpeech in English (noun / verb / adjective / adverb / etc.). Example sentences in word_lang. Translations in English. Source sentences end with terminal punctuation.`;

async function rewriteOne(word, sourceLang, current, issues) {
  const input = {
    word_lang: sourceLang,
    headword: word,
    meanings: current.meanings || [],
    examples: (current.examples || []).map(ex => ({
      sentence: ex.sentence,
      meaning_index: ex.meaning_index,
      translation: ex.translation,
    })),
    issues,
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1',
      temperature: 0.2,
      messages: [
        { role: 'system', content: REWRITE_SYSTEM },
        { role: 'user', content: JSON.stringify(input, null, 2) },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content);
}

(async () => {
  const flagsPath = path.resolve(__dirname, 'llm-audit-flags.json');
  const flags = JSON.parse(fs.readFileSync(flagsPath, 'utf8'));
  console.log(`Loaded ${flags.length} flagged entries from llm-audit-flags.json\n`);

  // Group by slug to minimize list lookups
  const bySlug = {};
  for (const f of flags) {
    if (!bySlug[f.slug]) bySlug[f.slug] = [];
    bySlug[f.slug].push(f);
  }

  let success = 0, failure = 0;
  const rewrites = [];

  for (const slug of Object.keys(bySlug)) {
    const { data: list } = await admin.from('curated_wordlists')
      .select('id, source_lang').eq('slug', slug).single();

    for (const flag of bySlug[slug]) {
      const { data: row } = await admin.from('curated_words')
        .select('reading_key, display_order, results_by_target_lang')
        .eq('curated_wordlist_id', list.id).eq('word', flag.word).maybeSingle();
      if (!row) { console.log(`  ! ${flag.word}: not found in DB`); continue; }

      const en = row.results_by_target_lang?.en;
      if (!en) { console.log(`  ! ${flag.word}: no en entry`); continue; }

      try {
        const fixed = await rewriteOne(flag.word, list.source_lang, en, flag.issues);
        console.log(`\n  ▸ ${slug}/${flag.word}`);
        console.log(`    before: m=${(en.meanings||[]).length}, e=${(en.examples||[]).length}`);
        console.log(`    after:  m=${(fixed.meanings||[]).length}, e=${(fixed.examples||[]).length}`);
        for (const m of (fixed.meanings||[])) console.log(`      m: [${m.partOfSpeech}] ${m.definition}`);
        for (const ex of (fixed.examples||[])) console.log(`      e[mi=${ex.meaning_index}]: ${ex.sentence}  →  ${ex.translation}`);

        if (!DRY) {
          // Patch only the en target (other langs to be re-translated separately).
          // Keep other lang entries intact for now — they're translation-only and
          // depend on canonical which is being changed. Future iteration: re-run
          // translate pass for all targets.
          const newResults = { ...(row.results_by_target_lang || {}) };
          newResults.en = {
            ...en,
            meanings: fixed.meanings,
            examples: fixed.examples,
          };
          await admin.from('curated_words').upsert({
            curated_wordlist_id: list.id,
            word: flag.word,
            reading_key: row.reading_key ?? '',
            display_order: row.display_order,
            results_by_target_lang: newResults,
          }, { onConflict: 'curated_wordlist_id,word,reading_key' });
        }
        success++;
        rewrites.push({ slug, word: flag.word, before: en, after: fixed });
      } catch (e) {
        console.log(`  ! ${flag.word}: ERROR ${e.message.slice(0, 100)}`);
        failure++;
      }
    }
  }

  console.log(`\n══ Summary ══`);
  console.log(`  Rewritten: ${success}`);
  console.log(`  Failed: ${failure}`);
  if (DRY) console.log('  (DRY RUN — DB not updated)');

  const outPath = path.resolve(__dirname, 'llm-rewrite-results.json');
  fs.writeFileSync(outPath, JSON.stringify(rewrites, null, 2));
  console.log(`\n→ ${outPath}`);
})().catch(e => { console.error(e); process.exit(1); });
