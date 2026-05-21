// Smoke test — invoke the freshly deployed word-lookup-v2 with a few
// words across the case branches to confirm the deploy actually applied
// the new case-routed prompts.

import { createClient } from '@supabase/supabase-js';

const c = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TESTS = [
  { word: 'kick the bucket', sourceLang: 'en', targetLang: 'ko' },
  { word: 'Madrid', sourceLang: 'es', targetLang: 'ko' },
  { word: 's\'il vous plaît', sourceLang: 'fr', targetLang: 'ko' },
  { word: '42', sourceLang: 'de', targetLang: 'ko' },
  { word: 'per favore', sourceLang: 'it', targetLang: 'ko' },
];

for (const t of TESTS) {
  process.stdout.write(`${t.word.padEnd(22)} [${t.sourceLang}→${t.targetLang}] ... `);
  const t0 = Date.now();
  const { data, error } = await c.functions.invoke('word-lookup-v2', {
    body: { ...t, mode: 'enrich', forceFresh: true, forceFreshTranslation: true },
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (error) { console.log(`ERR: ${error.message}`); continue; }
  const r = data?.result ?? {};
  const m0 = r.meanings?.[0];
  const ex0 = r.examples?.[0];
  console.log(`${dt}s | (${m0?.partOfSpeech}) ${m0?.definition}${ex0 ? ' | ' + ex0.sentence : ''}`);
}
