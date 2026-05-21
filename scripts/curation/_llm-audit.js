// LLM-based audit: gpt-4.1 evaluates each curated_words entry for native-
// speaker naturalness and accuracy. Returns PASS or FLAG with reasons.
//
// Audit scope (per entry):
//   1. Meanings (in WORD_LANG): are these standalone senses a native speaker
//      would accept as the bare headword? Reject char-dictionary glosses
//      that only surface in compounds (e.g. 역=disease, 도=way).
//   2. Examples (in WORD_LANG): natural sentences? Marker on headword (not
//      adjacent word)? Sentence demonstrates the meaning at meaning_index?
//      Korean numeral-counter pairing correct? State-adjective subject?
//   3. Translation (en target only — others follow canonical): accurate
//      sense match? Natural English?
//
// Usage:
//   node _llm-audit.js <slug> [<slug>...]   — audit listed wordlists
//   node _llm-audit.js --all                 — audit all active wordlists
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

const AUDIT_SYSTEM = `You are a strict quality auditor for a language-learning vocabulary entry. Your job is to evaluate ONE entry and decide PASS or FLAG.

Evaluate as a NATIVE SPEAKER of WORD_LANG (the source language) — and as a NATIVE SPEAKER of the target language for the translation. Be honest, not lenient.

You will receive: headword, meanings (in WORD_LANG), examples (in WORD_LANG with **marker**), and an English translation of each example. The entry may also carry a "note" field — see special case below.

SPECIAL CASE — INTENTIONAL REFUSAL (always PASS):
- If the entry has note set to "non_word" / "sentence" / "wrong_language" AND meanings is empty AND examples is empty, the system has intentionally refused to define this input. This is the CORRECT behavior for: pure slurs/profanity, character-dictionary-only Sino monosyllables that lack standalone senses (e.g. 백/천 in some contexts), composed non-idiom sentences, or wrong-language input. Return PASS with empty issues. Do NOT flag as "incomplete" — the refusal is intentional.

EVALUATION CRITERIA (any one failure = FLAG, otherwise PASS):

A. MEANINGS — each listed sense MUST be:
   • A genuine STANDALONE sense of the EXACT bare headword (not compound-only, not character-dictionary-only)
   • Encountered by ordinary native speakers in natural usage
   • Distinct from other listed senses (no near-duplicates)
   FLAG if any sense is: compound-only (the meaning surfaces only inside compounds like 역병/역사/안전), archaic/literary, or so rare it should not be in a learning vocabulary.

B. EXAMPLES — each example MUST:
   • Be a NATURAL sentence a native speaker would actually produce
   • Have the marker (**) on the EXACT headword (or a valid inflection), NEVER on an adjacent verb/adjective/particle/related word
   • Demonstrate the SENSE that corresponds to its meaning_index (the sentence's meaning must match the assigned meaning slot)
   • Use the bare headword as a standalone word (not as a constituent of a different compound word — e.g. headword 역 marked inside 역할 is WRONG)
   • For Korean: numeral-counter pairing must be correct (sino numeral with sino counter, native numeral with native counter). State-adjectives (배가 부르다, 머리가 아프다) must have the state-bearer subject.
   • For verb senses: include the typical object/argument (노래를 부른다, not bare 부른다)
   • Source sentence must end with appropriate terminal punctuation
   FLAG if any example fails.

C. TRANSLATION (English) — must:
   • Accurately convey the meaning of the source sentence
   • Be natural English (not translationese)
   • Match the sense being demonstrated

Output strict JSON:
{
  "verdict": "PASS" | "FLAG",
  "issues": [
    { "category": "meaning" | "example" | "translation", "index": 0, "problem": "<short specific reason in English>" }
  ]
}

Return empty issues array on PASS. Include all distinct issues on FLAG. Be CONCRETE — name the specific problem (which meaning, which example, what's wrong).`;

async function auditOne(headword, sourceLang, result) {
  const userMsg = JSON.stringify({
    word_lang: sourceLang,
    headword,
    note: result.note || null,
    meanings: result.meanings || [],
    examples: (result.examples || []).map(ex => ({
      sentence: ex.sentence,
      meaning_index: ex.meaning_index,
      en_translation: ex.translation,
    })),
  }, null, 2);

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1',
      temperature: 0,
      messages: [
        { role: 'system', content: AUDIT_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content);
}

async function auditSlug(slug) {
  const { data: list } = await admin.from('curated_wordlists')
    .select('id, source_lang').eq('slug', slug).single();
  const { data: rows } = await admin.from('curated_words')
    .select('word, results_by_target_lang, display_order')
    .eq('curated_wordlist_id', list.id)
    .order('display_order');

  const flags = [];
  const passCount = { total: 0, pass: 0, flag: 0 };
  for (const row of rows || []) {
    const en = row.results_by_target_lang?.en;
    if (!en) continue;
    passCount.total++;
    try {
      const audit = await auditOne(row.word, list.source_lang, en);
      if (audit.verdict === 'FLAG') {
        passCount.flag++;
        flags.push({ slug, word: row.word, issues: audit.issues });
        console.log(`  ✗ ${row.word}: ${audit.issues.map(i => `[${i.category}${i.index !== undefined ? '['+i.index+']' : ''}] ${i.problem}`).join('; ')}`);
      } else {
        passCount.pass++;
        console.log(`  ✓ ${row.word}`);
      }
    } catch (e) {
      console.log(`  ! ${row.word}: ERROR ${e.message.slice(0, 80)}`);
    }
  }
  return { slug, ...passCount, flags };
}

(async () => {
  let slugs = process.argv.slice(2);
  if (slugs[0] === '--all') {
    const { data } = await admin.from('curated_wordlists')
      .select('slug').eq('is_active', true).gt('word_count', 0)
      .order('display_order');
    slugs = (data || []).map(r => r.slug);
  }
  if (slugs.length === 0) {
    console.error('Usage: node _llm-audit.js <slug>... | --all');
    process.exit(1);
  }

  const allFlags = [];
  const summary = [];
  for (const slug of slugs) {
    console.log(`\n══ ${slug} ══`);
    const r = await auditSlug(slug);
    summary.push(r);
    allFlags.push(...r.flags);
  }

  console.log(`\n\n══ SUMMARY ══`);
  console.log('Slug                          | total | pass  | flag  | flag%');
  console.log('-'.repeat(70));
  for (const r of summary) {
    const pct = r.total ? (100 * r.flag / r.total).toFixed(1) : '0';
    console.log(`${r.slug.padEnd(30)} | ${String(r.total).padStart(5)} | ${String(r.pass).padStart(5)} | ${String(r.flag).padStart(5)} | ${pct}%`);
  }

  const outPath = path.resolve(__dirname, 'llm-audit-flags.json');
  fs.writeFileSync(outPath, JSON.stringify(allFlags, null, 2));
  console.log(`\n→ ${outPath} (${allFlags.length} flagged entries)`);
})().catch(e => { console.error(e); process.exit(1); });
