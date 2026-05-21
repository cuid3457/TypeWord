// backfill-ipa.js
// ────────────────────────────────────────────────────────────────────────────
// Backfills missing "ipa" on word_entries rows. Targets rows where:
//   • word_lang ∈ {en, es, fr, de, it, pt}
//   • ipa is NULL
//   • headword has no internal spaces
//   • primary partOfSpeech is not "expression"
//
// Uses a tiny IPA-only OpenAI call (~50 tokens in, ~10 out) per row. At
// gpt-4.1-mini pricing this is ~$0.00004/row, so a few thousand rows ≈ pennies.
//
// Usage:
//   node scripts/curation/backfill-ipa.js [--slug=toeic-600] [--workers=10] [--dry]
//
// --slug   : limit to a curated_wordlist's words only (defaults to ALL missing)
// --workers: parallel calls (default 10)
// --dry    : log only, don't write
// ────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

function arg(name, def) {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return def;
  if (a === `--${name}`) return true;
  return a.split('=')[1];
}

const SLUG = arg('slug');
const WORKERS = parseInt(arg('workers', '10'), 10);
const DRY = !!arg('dry', false);

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error('OPENAI_API_KEY missing from .env.local');
  process.exit(1);
}

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const IPA_LANGS = new Set(['en', 'es', 'fr', 'de', 'it', 'pt']);

const SYSTEM_PROMPT = `You output phonetic IPA transcriptions for vocabulary words.

Output strict JSON: {"ipa": string}

Rules:
- Use real IPA characters (ʃ, ɛ, ø, χ, ʁ, …). NO slashes, NO brackets.
- Include stress marks (ˈ ˌ) and length (ː) as appropriate.
- Transcribe the EXACT inflected form given (singular/plural/conjugated as input).
- en: General American.
- es: standard Castilian or LatAm.
- fr: standard Parisian.
- de: standard High German.
- it: standard Italian.
- pt: Brazilian standard.
- If the input is unknown / non-word / multi-word phrase / expression-only, output {"ipa": ""}.`;

async function fetchIpa(word, lang) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `WORD_LANG: ${lang}\nWord: ${word}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);
  const ipa = typeof parsed.ipa === 'string' ? parsed.ipa.trim() : '';
  return ipa.length > 0 ? ipa : null;
}

(async () => {
  let query = admin
    .from('word_entries')
    .select('id, word, word_lang, meanings')
    .is('ipa', null)
    .in('word_lang', Array.from(IPA_LANGS));

  if (SLUG) {
    const { data: list } = await admin
      .from('curated_wordlists')
      .select('id, source_lang')
      .eq('slug', SLUG)
      .single();
    if (!list) {
      console.error(`Wordlist not found: ${SLUG}`);
      process.exit(1);
    }
    const { data: cw } = await admin
      .from('curated_words')
      .select('word')
      .eq('curated_wordlist_id', list.id);
    const words = cw.map((r) => r.word);
    query = query.eq('word_lang', list.source_lang).in('word', words);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }

  const candidates = rows.filter((r) => {
    if (!r.word || r.word.includes(' ')) return false;
    const primary = r.meanings?.[0]?.partOfSpeech;
    if (primary === 'expression') return false;
    return true;
  });

  console.log(`Scanned: ${rows.length} null-ipa rows`);
  console.log(`Eligible (no spaces, not expression): ${candidates.length}`);
  console.log(`Workers: ${WORKERS}${DRY ? ' [DRY-RUN]' : ''}`);
  console.log('');

  if (candidates.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const queue = [...candidates];
  let done = 0;
  let filled = 0;
  let empty = 0;
  let failed = 0;
  const started = Date.now();

  const reporter = setInterval(() => {
    const elapsed = (Date.now() - started) / 1000;
    const rate = done / Math.max(elapsed, 1);
    const eta = (candidates.length - done) / Math.max(rate, 0.01);
    process.stdout.write(`\rprogress: ${done}/${candidates.length} | filled=${filled} empty=${empty} fail=${failed} | ${rate.toFixed(1)}/s | ETA ${(eta / 60).toFixed(1)}min   `);
  }, 1500);

  const workers = Array.from({ length: WORKERS }, async () => {
    while (queue.length > 0) {
      const row = queue.shift();
      if (!row) break;
      try {
        const ipa = await fetchIpa(row.word, row.word_lang);
        if (ipa) {
          if (!DRY) {
            const { error: upErr } = await admin
              .from('word_entries')
              .update({ ipa })
              .eq('id', row.id);
            if (upErr) {
              failed++;
              console.error(`\n  ${row.word} (${row.word_lang}) update failed: ${upErr.message}`);
            } else {
              filled++;
            }
          } else {
            filled++;
            console.log(`  [dry] ${row.word_lang}/${row.word} → ${ipa}`);
          }
        } else {
          empty++;
        }
      } catch (err) {
        failed++;
        console.error(`\n  ${row.word} (${row.word_lang}) failed: ${err.message}`);
      }
      done++;
    }
  });
  await Promise.all(workers);
  clearInterval(reporter);

  const elapsed = (Date.now() - started) / 1000;
  console.log(`\n\nDone. filled=${filled}, empty=${empty}, failed=${failed} in ${(elapsed / 60).toFixed(1)} min.`);
})();
