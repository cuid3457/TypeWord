// Direct-OpenAI SynAnt patch for curated_words (avoids re-running enrich).
// Calls SynAnt prompt per (word, sourceLang), patches all 7 target_lang entries.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const LANG_NAMES = {
  en: 'English', ko: 'Korean', ja: 'Japanese', 'zh-CN': 'Chinese',
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
};
const TARGET_LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

function buildSynAntSystem(sourceLang) {
  const name = LANG_NAMES[sourceLang] ?? sourceLang;
  return `<role>List synonyms and antonyms for a vocabulary headword. ${name} only. Return json.</role>

<schema>{ "synonyms": string[], "antonyms": string[] }</schema>

<rules>
- Each entry: ONE bare word or fixed compound. NO parentheticals, NO glosses, NO disclaimers. Parenthetical content = fabrication signal → reject.
- Each entry: real attested ${name} word, genuinely interchangeable with headword in at least one common sense.
- NEVER the headword itself. NEVER inflected/declined headword forms.
- NEVER register variants (ko/ja honorific/humble = same lexeme).
- NEVER cross arrays.
- Synonyms ≤5, antonyms ≤3. Empty array ALWAYS better than fabrication.
</rules>

<peer_group_antonym>
Members of finite semantic groups (seasons, cardinal directions, weekdays, months, suits, primary colors, numerals): peers are PEERS, NOT antonyms.
- Seasons: ONE paired opposite each (spring↔autumn, summer↔winter).
- Cardinal directions: ONE opposite each (north↔south, east↔west).
- Weekdays / months / suits / primary colors / numerals: typically NO antonym → [].
- When unsure: [].
</peer_group_antonym>`;
}

function buildSynAntUser(word, sourceLang, meanings) {
  const name = LANG_NAMES[sourceLang] ?? sourceLang;
  const lines = [
    `Headword (${name}): "${word}"`,
    '',
    "Canonical meanings (context for which senses' syn/ant to draw from):",
  ];
  for (let i = 0; i < meanings.length; i++) {
    lines.push(`[${i}] (${meanings[i].partOfSpeech}) ${meanings[i].definition}`);
  }
  lines.push('', `Output synonyms and antonyms. ${name} only. Prefer [] over fabrication.`);
  return lines.join('\n');
}

async function callSynAnt(word, sourceLang, meanings) {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: buildSynAntSystem(sourceLang) },
          { role: 'user', content: buildSynAntUser(word, sourceLang, meanings) },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) return { synonyms: [], antonyms: [] };
    const j = await r.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? '{}');
    const synonyms = Array.isArray(parsed.synonyms) ? parsed.synonyms.filter(s => typeof s === 'string' && s.trim()).slice(0, 5) : [];
    const antonyms = Array.isArray(parsed.antonyms) ? parsed.antonyms.filter(s => typeof s === 'string' && s.trim()).slice(0, 3) : [];
    return { synonyms, antonyms };
  } catch {
    return { synonyms: [], antonyms: [] };
  }
}

async function processOne(row, sourceLang) {
  const rbtl = row.results_by_target_lang || {};
  // pick meanings from any available lang (use en if present)
  const baseLang = rbtl.en ? 'en' : Object.keys(rbtl)[0];
  const baseResult = rbtl[baseLang];
  if (!baseResult || !baseResult.meanings || baseResult.meanings.length === 0) return { status: 'SKIP_NO_MEANINGS' };
  // SynAnt is source-lang. For source meanings, we need source-lang meanings — but results store target-lang translations.
  // Fall back to passing target-lang meaning text + POS; the model still uses source-lang headword for syn/ant generation.
  const meanings = baseResult.meanings.slice(0, 3).map(m => ({ definition: m.definition, partOfSpeech: m.partOfSpeech }));
  const { synonyms, antonyms } = await callSynAnt(row.word, sourceLang, meanings);

  // Patch all target_lang entries that exist.
  const newResults = { ...rbtl };
  for (const lang of TARGET_LANGS) {
    if (newResults[lang]) {
      newResults[lang] = { ...newResults[lang], synonyms, antonyms };
    }
  }
  await admin.from('curated_words').upsert({
    curated_wordlist_id: row.curated_wordlist_id,
    word: row.word,
    reading_key: row.reading_key ?? '',
    display_order: row.display_order,
    results_by_target_lang: newResults,
  }, { onConflict: 'curated_wordlist_id,word,reading_key' });
  return { status: 'OK', s: synonyms.length, a: antonyms.length };
}

(async () => {
  const SLUGS = ['topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3', 'topik-2-part-1', 'topik-2-part-2', 'topik-2-part-3'];
  let totalRows = 0;
  for (const slug of SLUGS) {
    const { data: list } = await admin.from('curated_wordlists').select('id, slug, source_lang').eq('slug', slug).single();
    if (!list) { console.log(`! ${slug} not found`); continue; }
    const sourceLang = list.source_lang || 'ko';
    const { data: rows } = await admin.from('curated_words')
      .select('curated_wordlist_id, word, reading_key, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', list.id).order('display_order');
    console.log(`\n[${slug}] ${rows.length} words (source=${sourceLang})`);
    let ok = 0, skip = 0;
    let idx = 0;
    const concurrency = 8;
    async function worker() {
      while (true) {
        const my = idx++;
        if (my >= rows.length) return;
        const r = await processOne(rows[my], sourceLang);
        if (r.status === 'OK') { ok++; if (my % 50 === 0) console.log(`  [${my+1}/${rows.length}] ${rows[my].word} s=${r.s} a=${r.a}`); }
        else skip++;
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    console.log(`  → ${ok} OK / ${skip} skip`);
    totalRows += ok;
  }
  console.log(`\nTotal patched: ${totalRows} curated_words rows.`);
})();
