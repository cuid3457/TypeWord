/**
 * Invalidate word_translations + word_entries cache for the 40 smoke-test words.
 * Deletes ONLY the 40 (word, word_lang) pairs used by smoke-v4.ts so re-running
 * the smoke test exercises the full new pipeline.
 *
 * Run: npx tsx scripts/invalidate-smoke-cache.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf-8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {/* */}
  return out;
}
const env = loadEnv();
const URL = env.EXPO_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
const SROLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SROLE) { console.error('Missing env'); process.exit(1); }

const admin = createClient(URL, SROLE, { auth: { persistSession: false } });

const PAIRS: Array<[string, string]> = [
  ['ko', '사과'], ['ko', '학교'], ['ko', '가다'], ['ko', '예쁘다'], ['ko', '빨리'],
  ['ja', '食べる'], ['ja', '学校'], ['ja', '美しい'], ['ja', '速い'], ['ja', '本'],
  ['zh-CN', '苹果'], ['zh-CN', '学校'], ['zh-CN', '吃'], ['zh-CN', '美丽'], ['zh-CN', '快'],
  ['en', 'apple'], ['en', 'school'], ['en', 'eat'], ['en', 'beautiful'], ['en', 'quickly'],
  ['es', 'manzana'], ['es', 'escuela'], ['es', 'comer'], ['es', 'hermoso'], ['es', 'rápido'],
  ['fr', 'pomme'], ['fr', 'école'], ['fr', 'manger'], ['fr', 'beau'], ['fr', 'vite'],
  ['de', 'Apfel'], ['de', 'Schule'], ['de', 'essen'], ['de', 'schön'], ['de', 'schnell'],
  ['it', 'mela'], ['it', 'scuola'], ['it', 'mangiare'], ['it', 'bello'], ['it', 'velocemente'],
];

(async () => {
  let entryHits = 0;
  let translationHits = 0;
  for (const [lang, word] of PAIRS) {
    const { data: entry } = await admin
      .from('word_entries')
      .select('id')
      .eq('word', word)
      .eq('word_lang', lang)
      .maybeSingle();
    if (!entry) continue;
    entryHits++;
    const { error: e1 } = await admin
      .from('word_translations')
      .delete()
      .eq('word_entry_id', entry.id);
    if (e1) console.warn(`${lang} ${word} trans del:`, e1.message);
    else translationHits++;
    // Also delete the canonical entry so reading/source flags get refreshed.
    await admin.from('word_entries').delete().eq('id', entry.id);
  }
  console.log(`Invalidated ${entryHits} word_entries, ${translationHits} word_translations rows.`);
})();
