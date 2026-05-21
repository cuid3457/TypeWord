// Test how word-lookup-v2 handles slang / vulgar / derogatory words.
// Categories:
//   A. Primary clean + secondary slang (should return ONLY primary clean sense)
//   B. Primary slang/vulgar (should return empty meanings + note="non_word")
//   C. Slurs (moderation blocklist should reject at input layer)
//   D. Non-Korean slang in en/de/fr to verify rule applies across source langs
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Format: [word, sourceLang, expectedCategory, comment]
const TESTS = [
  // A. Primary clean + secondary slang (should return ONLY primary clean)
  ['년', 'ko', 'A', 'primary=year, secondary=bitch-slur — expect year only'],
  ['개', 'ko', 'A', 'primary=dog, secondary=damn-intensifier — expect dog only'],
  ['고추', 'ko', 'A', 'primary=chili pepper, secondary=penis-slang — expect chili only'],
  ['걸레', 'ko', 'A', 'primary=mop/rag, secondary=slut-slur — expect mop only'],

  // B. Primary slang/vulgar (expect note="non_word")
  ['씨발', 'ko', 'B', 'strong profanity — expect refuse'],
  ['좆', 'ko', 'B', 'strong profanity — expect refuse'],
  ['병신', 'ko', 'B', 'ableist slur — expect refuse'],
  ['fuck', 'en', 'B', 'strong en profanity — expect refuse'],
  ['shit', 'en', 'B', 'en profanity — expect refuse'],

  // C. Slurs (moderation blocklist)
  ['짱깨', 'ko', 'C', 'anti-Chinese slur — expect refuse or blocked'],
  ['쪽바리', 'ko', 'C', 'anti-Japanese slur — expect refuse or blocked'],
  ['한남충', 'ko', 'C', 'misandry slur — expect refuse or blocked'],

  // D. Non-Korean test (de, fr profanity)
  ['Scheiße', 'de', 'D', 'de profanity — expect refuse'],
  ['merde', 'fr', 'D', 'fr profanity — expect refuse'],
];

async function lookup(word, sourceLang, targetLang) {
  const r = await admin.functions.invoke('word-lookup-v2', {
    body: { word, sourceLang, targetLang, mode: 'enrich' },
  });
  if (r.error) return { error: r.error.message };
  return r.data?.result;
}

function summarize(result) {
  if (!result) return '(empty)';
  if (result.error) return `ERROR: ${result.error}`;
  const note = result.note;
  const meanings = result.meanings || [];
  if (note) return `note=${note} m=${meanings.length}`;
  return `m=${meanings.length}: ${meanings.map(m => m.definition).join(' | ')}`;
}

(async () => {
  console.log('Testing slang / vulgar / slur handling across word-lookup-v2 + 3 target langs (en/ja/de)\n');
  for (const [word, sourceLang, category, comment] of TESTS) {
    console.log(`\n══ [${category}] "${word}" (${sourceLang}) — ${comment} ══`);
    for (const targetLang of ['en', 'ja', 'de']) {
      try {
        const result = await lookup(word, sourceLang, targetLang);
        console.log(`  ${targetLang}: ${summarize(result)}`);
      } catch (e) {
        console.log(`  ${targetLang}: EXCEPTION ${e.message.slice(0, 100)}`);
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
