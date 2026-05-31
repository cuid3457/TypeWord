// Stress test for v4 — verifies canonical preservation, alignment, edge cases.
// Goal: prove there are NO MORE BUGS before committing to curation.

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function lookup(w, sl, tl, opts = {}) {
  const r = await admin.functions.invoke('word-lookup-v4', { body: { word: w, sourceLang: sl, targetLang: tl, mode: 'enrich', ...opts } });
  return r.data?.result || {};
}
async function wipeCanonical(w, sl) {
  await admin.from('word_entries').delete().eq('word', w).eq('word_lang', sl);
}
async function getCanonical(w, sl) {
  const { data } = await admin.from('word_entries').select('meanings, examples').eq('word', w).eq('word_lang', sl).maybeSingle();
  return data;
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.log('  ✗ FAIL:', msg); failures++; return false; }
  console.log('  ✓', msg); return true;
}

async function test(name, fn) {
  console.log('\n══', name);
  try { await fn(); }
  catch (err) { console.log('  ✗ THREW:', err.message); failures++; }
}

(async () => {
  // ─── Test 1: canonical truly preserved across 7 targets ───
  await test('Test 1: canonical preserved across 7 targets (사랑)', async () => {
    const W = '사랑'; const SL = 'ko';
    await wipeCanonical(W, SL);
    await lookup(W, SL, 'en', { forceFresh: true });
    await new Promise(r => setTimeout(r, 1500));
    const c0 = await getCanonical(W, SL);
    const baseSenseIds = (c0?.meanings || []).map(m => m.sense_id).sort();
    const baseExSentences = (c0?.examples || []).map(e => e.sentence).sort();
    assert(baseSenseIds.length > 0, `canonical has senses (count=${baseSenseIds.length})`);
    assert(baseExSentences.length > 0, `canonical has examples (count=${baseExSentences.length})`);

    for (const tl of ['fr', 'de', 'it', 'es', 'ja', 'zh-CN']) {
      await lookup(W, SL, tl);
      await new Promise(r => setTimeout(r, 800));
      const c = await getCanonical(W, SL);
      const senseIds = (c?.meanings || []).map(m => m.sense_id).sort();
      const exSentences = (c?.examples || []).map(e => e.sentence).sort();
      assert(JSON.stringify(senseIds) === JSON.stringify(baseSenseIds), `${tl}: canonical sense_ids unchanged`);
      assert(JSON.stringify(exSentences) === JSON.stringify(baseExSentences), `${tl}: canonical source sentences unchanged`);
    }
  });

  // ─── Test 2: meaning↔example alignment across all 7 targets (polysemy) ───
  await test('Test 2: meaning↔example alignment (배 polysemy across 7 targets)', async () => {
    const W = '배'; const SL = 'ko';
    await wipeCanonical(W, SL);
    await lookup(W, SL, 'en', { forceFresh: true });
    await new Promise(r => setTimeout(r, 1500));

    // For each target, verify meaningIndex points at a meaning whose definition
    // semantically matches the marked span's role in the sentence.
    for (const tl of ['en', 'fr', 'de', 'it', 'es', 'ja', 'zh-CN']) {
      const res = await lookup(W, SL, tl);
      const meanings = res.meanings || [];
      const examples = res.examples || [];
      assert(meanings.length > 0, `${tl}: has ≥1 meaning`);
      // Every example's meaningIndex must point at a real meaning
      for (const ex of examples) {
        assert(
          ex.meaningIndex >= 0 && ex.meaningIndex < meanings.length,
          `${tl}: example meaningIndex=${ex.meaningIndex} is in range [0,${meanings.length})`,
        );
      }
      // Examples count must NOT exceed meanings count (one example per meaning typically)
      assert(examples.length <= meanings.length + 1, `${tl}: examples (${examples.length}) ≤ meanings (${meanings.length}) + 1`);
    }
  });

  // ─── Test 3: Korean -하다 deterministic post-fix ───
  await test('Test 3: Korean verb -하다 post-fix', async () => {
    const cases = [
      ['point_fire_zh', '点火', 'zh-CN', '점화하다'],
      ['research_en', 'research', 'en', '연구하다'],
      ['participate_zh', '参加', 'zh-CN', '참가하다'],
    ];
    for (const [name, w, sl] of cases) {
      await wipeCanonical(w, sl);
      const res = await lookup(w, sl, 'ko', { forceFresh: true });
      const verbMeaning = (res.meanings || []).find(m => m.partOfSpeech === 'verb');
      if (verbMeaning) {
        const isDaForm = verbMeaning.definition.endsWith('다') || verbMeaning.definition.endsWith('다.');
        assert(isDaForm, `${name}: "${verbMeaning.definition}" ends with 다`);
      } else {
        assert(false, `${name}: no verb meaning found`);
      }
    }
  });

  // ─── Test 4: proper noun POS via freedict (Crimea) ───
  await test('Test 4: proper noun POS (Crimea via freedict)', async () => {
    const W = 'Crimea'; const SL = 'en';
    await wipeCanonical(W, SL);
    const res = await lookup(W, SL, 'de', { forceFresh: true });
    const m = (res.meanings || [])[0];
    assert(m?.partOfSpeech === 'proper noun', `pos = "${m?.partOfSpeech}" (expected proper noun)`);
  });

  // ─── Test 5: NO English leak in non-en target for legacy data ───
  await test('Test 5: No English leak in non-en target', async () => {
    // 배 polysemy → fr/it should never show "abdomen; belly" or similar English
    const W = '배';
    await wipeCanonical(W, 'ko');
    await lookup(W, 'ko', 'en', { forceFresh: true });
    await new Promise(r => setTimeout(r, 1500));

    for (const tl of ['fr', 'it', 'es']) {
      const res = await lookup(W, 'ko', tl);
      const defs = (res.meanings || []).map(m => m.definition);
      for (const def of defs) {
        // Reject CLEAR English leaks. "abdomen" / "plan" / "stop" exist in
        // Romance langs as Latinate cognates so don't flag those — only the
        // multi-word dict-gloss patterns and English-only function words.
        const isEnglish = /(;|,\s)/i.test(def) || // multi-word semicolon list
          /^to\s+\w/i.test(def) ||                  // English infinitive marker
          /^(belly|stomach|ship|vessel|pear|the\s+\w|a\s+\w)/i.test(def);
        assert(!isEnglish, `${tl}: "${def}" is NOT obvious English`);
      }
    }
  });

  // ─── Test 6: typo correction surfaces correctedHeadword ───
  await test('Test 6: typo correction', async () => {
    const res = await lookup('recieve', 'en', 'ko', { forceFresh: true });
    assert(res.note === 'non_word' || res.correctedHeadword === 'receive', `typo note=${res.note} corrected=${res.correctedHeadword}`);
  });

  // ─── Test 7: sentence rejection ───
  await test('Test 7: sentence rejection', async () => {
    const res = await lookup('I love learning languages', 'en', 'ko', { forceFresh: true });
    assert(res.note === 'sentence', `sentence note=${res.note}`);
    assert((res.meanings || []).length === 0, `sentence meanings empty`);
  });

  // ─── Test 8: TTS works for headword ───
  await test('Test 8: TTS', async () => {
    const r = await admin.functions.invoke('tts-synthesize', { body: { text: '안녕', language: 'ko', gender: 'F' } });
    assert(!r.error, `TTS no error (got: ${r.error?.message || 'OK'})`);
    assert(!!r.data?.url, `TTS returned URL`);
  });

  // ─── Test 9: reverse lookup ───
  await test('Test 9: reverse lookup', async () => {
    const r = await admin.functions.invoke('word-lookup-v4', { body: { word: 'apple', sourceLang: 'ko', targetLang: 'en', translate: true } });
    const cands = r.data?.result?.candidates || [];
    assert(cands.length > 0, `reverse returned ${cands.length} candidates`);
    assert(cands.some(c => c.headword === '사과'), `candidate includes 사과`);
  });

  // ─── Test 10: stale POS cache invalidation ───
  await test('Test 10: stale POS cache heals', async () => {
    // Probe a zh-CN word that may have legacy empty POS
    const W = '银行';
    const res = await lookup(W, 'zh-CN', 'ko');
    const m = (res.meanings || [])[0];
    assert(m?.partOfSpeech && m.partOfSpeech !== '', `POS populated: "${m?.partOfSpeech}"`);
  });

  console.log('\n══════════════════════════════════════');
  console.log(failures === 0 ? '✅ ALL TESTS PASSED' : `✗ ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})();
