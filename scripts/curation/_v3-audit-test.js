// v3 prompt audit measurement: 30 critical-pattern words.
// Each word: forceFresh enrich (canonical + examples + en translation) → audit.
// Compare PASS/FLAG counts vs the original 30% baseline.
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TEST_WORDS = [
  // Sino monosyllables — standalone violation pattern (10)
  '나', '저', '사', '오', '백', '월', '분', '천', '년', '이',
  // TOPIK verbs — bare stem terminal pattern (10)
  '가다', '오다', '먹다', '살다', '사다', '앉다', '서다', '보다', '하다', '쓰다',
  // Adjectives + general — regression (10)
  '좋다', '작다', '학교', '친구', '음식', '사람', '회사', '시간', '책', '잘 부탁드립니다',
];

const AUDIT_SYSTEM = `You are a strict quality auditor for a language-learning vocabulary entry. Your job is to evaluate ONE entry and decide PASS or FLAG.

Evaluate as a NATIVE SPEAKER of WORD_LANG and TARGET_LANG. Be honest, not lenient.

You will receive: headword, meanings (in WORD_LANG), examples (in WORD_LANG with **marker**), and an English translation of each example. The entry may also carry a "note" field — see special case below.

SPECIAL CASE — INTENTIONAL REFUSAL (always PASS):
- If the entry has note set to "non_word" / "sentence" / "wrong_language" AND meanings is empty AND examples is empty, the system has intentionally refused to define this input. This is the CORRECT behavior for: pure slurs/profanity, character-dictionary-only Sino monosyllables that lack standalone senses (e.g. 백/천 in some contexts), composed non-idiom sentences, or wrong-language input. Return PASS with empty issues. Do NOT flag as "incomplete" — the refusal is intentional.

EVALUATION CRITERIA (any one failure = FLAG, otherwise PASS):

A. MEANINGS — each listed sense MUST be:
   • A genuine STANDALONE sense of the EXACT bare headword (not compound-only, not character-dictionary-only)
   • Encountered by ordinary native speakers in natural usage
   • Distinct from other listed senses (no near-duplicates)
   FLAG if any sense is: compound-only, archaic/literary, or so rare it should not be in a learning vocabulary.

B. EXAMPLES — each example MUST:
   • Be a NATURAL sentence a native speaker would actually produce
   • Have the marker (**) on the EXACT headword (or a valid inflection), NEVER on an adjacent verb/adjective/particle/related word
   • Demonstrate the SENSE that corresponds to its meaning_index
   • Use the bare headword as a standalone word (not as a constituent of a different compound word)
   • For Korean: numeral-counter pairing correct, state-adjectives have state-bearer subject
   • For verb senses: include the typical object/argument
   • Source sentence ends with appropriate terminal punctuation
   FLAG if any example fails.

C. TRANSLATION (English) — must:
   • Accurately convey the meaning of the source sentence
   • Be natural English (not translationese)
   • Match the sense being demonstrated

Output strict JSON:
{ "verdict": "PASS" | "FLAG", "issues": [ { "category": "meaning"|"example"|"translation", "index": 0, "problem": "<short reason>" } ] }

Return empty issues on PASS. Include all distinct issues on FLAG.`;

async function generate(word) {
  const { data, error } = await admin.functions.invoke('word-lookup-v2', {
    body: { word, sourceLang: 'ko', targetLang: 'en', mode: 'enrich', forceFresh: true },
  });
  if (error) throw new Error(error.message);
  return data.result;
}

async function audit(headword, result) {
  const userMsg = JSON.stringify({
    word_lang: 'ko',
    headword,
    note: result.note || null,
    meanings: result.meanings || [],
    examples: (result.examples || []).map(ex => ({
      sentence: ex.sentence,
      meaning_index: ex.meaningIndex ?? ex.meaning_index ?? 0,
      en_translation: ex.translation || '',
    })),
  }, null, 2);
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
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
  if (!resp.ok) throw new Error('audit ' + resp.status);
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content);
}

(async () => {
  const results = [];
  let pass = 0, flag = 0, err = 0;
  for (const word of TEST_WORDS) {
    process.stdout.write(`  ${word.padEnd(15)} ... `);
    try {
      const result = await generate(word);
      const aud = await audit(word, result);
      if (aud.verdict === 'PASS') { pass++; console.log('✓ PASS'); }
      else {
        flag++;
        const issuesShort = (aud.issues || []).map(i => `[${i.category}${i.index !== undefined ? '['+i.index+']' : ''}] ${i.problem.slice(0, 100)}`).join('; ');
        console.log(`✗ FLAG — ${issuesShort.slice(0, 200)}`);
      }
      results.push({ word, verdict: aud.verdict, issues: aud.issues || [], meanings: result.meanings, examples: result.examples });
    } catch (e) {
      err++;
      console.log(`! ERR — ${e.message.slice(0, 80)}`);
      results.push({ word, error: e.message });
    }
  }
  console.log(`\n══ v3 RESULTS ══`);
  console.log(`PASS: ${pass}/${TEST_WORDS.length} (${(100*pass/TEST_WORDS.length).toFixed(1)}%)`);
  console.log(`FLAG: ${flag}/${TEST_WORDS.length} (${(100*flag/TEST_WORDS.length).toFixed(1)}%)`);
  if (err) console.log(`ERR:  ${err}`);
  console.log(`\nBaseline (v2): ~30% flag → goal <10%`);

  fs.writeFileSync(path.resolve(__dirname, 'v3-audit-results.json'), JSON.stringify(results, null, 2));
  console.log(`\n→ scripts/curation/v3-audit-results.json`);
})().catch(e => { console.error(e); process.exit(1); });
