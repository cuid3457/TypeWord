import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const a = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  // Use a cached word — "water" was cached recently with en→ko translation.
  const word = 'water';
  const sourceLang = 'en';
  const targetLang = 'ko';

  // 1. Verify cache exists
  const { data: entry } = await a.from('word_entries').select('id, examples').eq('word', word).eq('word_lang', sourceLang).maybeSingle();
  console.log(`Cache check: word_entries id=${entry?.id}, examples=${(entry?.examples ?? []).length}`);
  if (!entry) { console.error('water not cached — abort'); process.exit(1); }

  // 2. Note time, insert report
  const t0 = Date.now();
  const { data: rep, error } = await a.from('content_reports').insert({
    user_id: null,
    word,
    reason: 'wrong_example',
    description: 'TRIGGER TEST — this is a fake report to verify the immediate trigger pipeline. Please discard.',
    context: 'detail',
    source_lang: sourceLang,
    target_lang: targetLang,
    created_at: new Date().toISOString(),
  }).select('id').single();
  if (error) { console.error('Insert failed:', error.message); process.exit(1); }
  console.log(`Inserted report id=${rep.id} at ${t0}`);

  // 3. Poll report_fixes every 5s for up to 60s
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const elapsed = Date.now() - t0;
    const { data: fixes } = await a
      .from('report_fixes')
      .select('id, status, judge_verdict, judge_confidence, created_at')
      .eq('word', word)
      .order('created_at', { ascending: false })
      .limit(3);
    const { data: r } = await a.from('content_reports').select('processed_at').eq('id', rep.id).maybeSingle();
    const newFix = fixes?.find((f) => new Date(f.created_at).getTime() > t0);
    console.log(`  +${(elapsed / 1000).toFixed(0)}s: processed_at=${r?.processed_at ?? '-'}  new_fix=${newFix ? `${newFix.status}/${newFix.judge_verdict}/${newFix.judge_confidence}` : '-'}`);
    if (newFix) {
      // cleanup
      await a.from('content_reports').delete().eq('id', rep.id);
      await a.from('report_fixes').delete().eq('id', newFix.id);
      console.log('Trigger works. Cleaned up.');
      process.exit(0);
    }
  }
  console.log('Timed out after 60s — trigger likely not firing.');
  await a.from('content_reports').delete().eq('id', rep.id);
}
main();
