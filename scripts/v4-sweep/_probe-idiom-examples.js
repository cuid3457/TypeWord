// Reproduce idiom-empty-example failure locally by calling OpenAI with the
// SAME prompt the edge function uses, then running the same validation
// helpers. Shows what the model returns and which validator rejects it.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1); }

// Copy the system prompt VERBATIM from supabase/functions/_shared/dict-clients/example-generator.ts
const EXAMPLE_SYSTEM = `You write ONE example sentence for a language-learning vocabulary card.

You receive:
- W: the headword (in SOURCE_LANG)
- SOURCE_LANG: language of W and the example sentence
- TARGET_LANG: language of the translation
- SENSE_DEF: a short English definition pinning the SPECIFIC sense to illustrate
- TARGET_GLOSS: the short TARGET_LANG vocabulary-card label for this sense
- SCENE_ANCHOR: a broad situational context for ordinary words (NOT a vocabulary instruction — do not name it literally)
- NEUTRAL_PUBLIC_ANCHOR: a neutral situational frame used ONLY when W is a public figure / disputed topic (rule 7). Vary cards across these sensitive lookups so they don't all read "I saw it in a textbook."
- PROFICIENCY_TIER (optional): a named curriculum tier ...

Requirements for the SOURCE_LANG sentence:
1. Length: 6 to 14 words for Latin-script languages; 8 to 16 characters for CJK languages. EXACTLY ONE sentence...
2. Must illustrate THIS specific sense unambiguously...
5. Wrap the actual surface form of W as it appears in the sentence (inflected / conjugated / declined as needed) in DOUBLE ASTERISKS: **W**. Exactly one opening **, one closing **. Mark nothing else.
...

Output strict JSON:
{
  "sentence": "<SOURCE_LANG sentence with **W** marker>",
  "translation": "<TARGET_LANG natural translation>"
}`;

function stripMarkers(s) { return s.replace(/\*\*/g, ''); }
function countMarkers(s) { return (s.match(/\*\*/g) ?? []).length; }
function sentenceCount(s) {
  const plain = stripMarkers(s).trim();
  if (!plain) return 0;
  return plain.split(/[.!?。！？]+(?=\s|$)/).map((t) => t.trim()).filter(Boolean).length;
}
const CJK_LANGS = new Set(['ko','ja','zh','zh-CN']);
function lengthOk(s, sourceLang) {
  const plain = stripMarkers(s).trim();
  if (CJK_LANGS.has(sourceLang)) {
    const len = Array.from(plain.replace(/\s+/g, '')).length;
    return { ok: len >= 6 && len <= 22, len, mode: 'cjk' };
  }
  const wordCount = plain.split(/\s+/).filter(Boolean).length;
  return { ok: wordCount >= 5 && wordCount <= 20, len: wordCount, mode: 'latin' };
}
function markedSpan(s) {
  const m = s.match(/\*\*([^*]+)\*\*/);
  return m ? m[1] : null;
}
function headwordPresent(sentence, word, surfaceForms, sourceLang) {
  const span = markedSpan(sentence);
  if (!span) return { ok: false, why: 'no_span' };
  const candidates = [word, ...(surfaceForms ?? [])].map((s) => s.trim()).filter(Boolean);
  const s = span.trim();
  if (CJK_LANGS.has(sourceLang)) {
    for (const w of candidates) {
      if (w.length === 0) continue;
      if (s.includes(w) || w.includes(s)) return { ok: true, why: 'substring' };
      const stemLen = w.endsWith('다') ? w.length - 1 : Math.max(1, w.length - 1);
      const stem = w.slice(0, stemLen);
      if (stem.length >= 1 && s.startsWith(stem)) return { ok: true, why: 'stem' };
      if (s.length > 0 && w.length > 0 && s.charAt(0) === w.charAt(0)) return { ok: true, why: 'first_char' };
    }
    return { ok: false, why: 'no_cjk_match', span: s };
  }
  const sLower = s.toLowerCase();
  for (const w of candidates) {
    const wLower = w.toLowerCase();
    if (sLower.includes(wLower) || wLower.includes(sLower)) return { ok: true, why: 'substring' };
    for (let drop = 1; drop <= 3 && wLower.length - drop >= 3; drop++) {
      const stem = wLower.slice(0, wLower.length - drop);
      if (sLower.startsWith(stem)) return { ok: true, why: 'stem-' + drop };
    }
  }
  return { ok: false, why: 'no_latin_match', span: s, candidates };
}
function validate(resp, word, surfaceForms, sourceLang) {
  if (!resp.sentence || !resp.translation) return { ok: false, reason: 'empty' };
  const sm = countMarkers(resp.sentence);
  if (sm !== 2) return { ok: false, reason: `source_marker=${sm}` };
  const lo = lengthOk(resp.sentence, sourceLang);
  if (!lo.ok) return { ok: false, reason: `length:${lo.len}(${lo.mode})` };
  const hp = headwordPresent(resp.sentence, word, surfaceForms, sourceLang);
  if (!hp.ok) return { ok: false, reason: `headword_missing:${hp.why}`, hp };
  if (resp.translation.trim().length < 2) return { ok: false, reason: 'translation_too_short' };
  const srcN = sentenceCount(resp.sentence);
  if (srcN > 1) return { ok: false, reason: `source_multi_sentence=${srcN}` };
  const trN = sentenceCount(resp.translation);
  if (trN > 1) return { ok: false, reason: `translation_multi_sentence=${trN}` };
  return { ok: true };
}

const LANG_NAME = { ko: 'Korean', ja: 'Japanese', zh: 'Mandarin Chinese', 'zh-CN': 'Mandarin Chinese', en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian' };

async function call(model, userMessage) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: EXAMPLE_SYSTEM },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    }),
  });
  const body = await res.json();
  return JSON.parse(body.choices[0].message.content);
}

const CASES = [
  { word: "non vedere l'ora", sl: 'it', tl: 'en', sense: "to look forward (to)", gloss: "to look forward (to)" },
  { word: "no tener pelos en la lengua", sl: 'es', tl: 'en', sense: "to speak one's mind", gloss: "to speak one's mind" },
  { word: "poser un lapin", sl: 'fr', tl: 'en', sense: "to stand someone up", gloss: "to stand up" },
];

(async () => {
  for (const c of CASES) {
    console.log('\n=== ' + c.sl + '→' + c.tl + ' "' + c.word + '" ===');
    const userMessage =
      `SOURCE_LANG=${LANG_NAME[c.sl]}\nTARGET_LANG=${LANG_NAME[c.tl]}\nW="${c.word}"\n` +
      `SENSE_DEF=${c.sense}\nTARGET_GLOSS=${c.gloss}\n` +
      `SCENE_ANCHOR=a casual conversation between two close friends\n` +
      `NEUTRAL_PUBLIC_ANCHOR=a museum audio guide explanation`;
    // tier 1
    try {
      const r = await call('gpt-4.1-mini', userMessage);
      console.log('  [mini] sentence:', r.sentence);
      console.log('         translation:', r.translation);
      const v = validate(r, c.word, [], c.sl);
      console.log('         validate:', JSON.stringify(v));
    } catch (e) { console.log('  [mini] ERR', e.message); }
    // tier 2
    try {
      const r = await call('gpt-4.1', userMessage);
      console.log('  [4.1]  sentence:', r.sentence);
      console.log('         translation:', r.translation);
      const v = validate(r, c.word, [], c.sl);
      console.log('         validate:', JSON.stringify(v));
    } catch (e) { console.log('  [4.1] ERR', e.message); }
  }
})().catch(e => { console.error('Fatal:', e); process.exit(1); });
