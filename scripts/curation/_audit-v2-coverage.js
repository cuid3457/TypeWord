// Audit which curated_wordlists have all/most words processed with v2 prompt.
// v2 launched 2026-05-13. Major v2 prompt update on 2026-05-16 13:24 (numbers
// idiomatic + proper-noun bare cat + IPA-only retry).
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const V2_LAUNCH = new Date('2026-05-13T00:00:00Z');
const V2_RECENT_UPDATE = new Date('2026-05-16T13:24:00+09:00');

(async () => {
  const { data: lists } = await admin
    .from('curated_wordlists')
    .select('id, slug, name_i18n, source_lang, exam_type, level, category, is_active')
    .eq('is_active', true)
    .order('display_order');

  console.log(`Total active wordlists: ${lists?.length}\n`);
  const report = [];

  for (const list of (lists || [])) {
    const { data: words } = await admin
      .from('curated_words')
      .select('updated_at')
      .eq('curated_wordlist_id', list.id);
    if (!words || !words.length) continue;
    const total = words.length;
    let v2 = 0, v2recent = 0, oldest = null, newest = null;
    for (const w of words) {
      const t = new Date(w.updated_at);
      if (!oldest || t < oldest) oldest = t;
      if (!newest || t > newest) newest = t;
      if (t >= V2_LAUNCH) v2++;
      if (t >= V2_RECENT_UPDATE) v2recent++;
    }
    report.push({
      slug: list.slug,
      exam_type: list.exam_type,
      level: list.level,
      total,
      v2_pct: ((v2/total)*100).toFixed(1),
      v2_recent_pct: ((v2recent/total)*100).toFixed(1),
      oldest: oldest?.toISOString().slice(0,10),
      newest: newest?.toISOString().slice(0,10),
    });
  }

  console.log('Wordlist                       | exam | lvl | total | v2 %     | v2-recent % | oldest     | newest');
  console.log('-'.repeat(110));
  for (const r of report.sort((a,b)=>parseFloat(b.v2_pct)-parseFloat(a.v2_pct))) {
    console.log(
      `${r.slug.padEnd(30)} | ${(r.exam_type||'-').padEnd(4)} | ${(r.level||'-').padEnd(3)} | ` +
      `${String(r.total).padStart(5)} | ${r.v2_pct.padStart(5)}%  | ${r.v2_recent_pct.padStart(5)}%      | ${r.oldest} | ${r.newest}`
    );
  }

  console.log('\nv2 % = % words curated after 2026-05-13 (v2 launch)');
  console.log('v2-recent % = % words curated after 2026-05-16 13:24 (v6 prompt update)');
})().catch(e => { console.error(e); process.exit(1); });
