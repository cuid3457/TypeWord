// v4 56-pair comprehensive sweep.
// -----------------------------------------------------------
// Per (sourceLang, targetLang, word) pair, runs the EXACT call sequence a
// real user triggers:
//   1. word-lookup-v4 mode=quick    (search-screen meaning preview)
//   2. word-lookup-v4 mode=enrich   (detail/save — examples + syn/ant)
//   3. tts-synthesize               (audio tap on headword)
// Plus reverse-lookup samples per source lang via word-lookup-v4 translate=true.
//
// Results dump (NDJSON) → reports JSON+markdown summary with latency p50/p90/
// p95, cache rates, quality flags (empty meanings / missing markers / IPA
// absence / etc.) and rough cost estimate.
//
// Auth: service-role so we can fire ~9k edge calls without per-user limits.
// Compute path inside the edge function is identical to a real user call so
// latency stats reflect what users see.
//
// Usage:
//   node scripts/v4-sweep/run-sweep.js                 # full sweep
//   node scripts/v4-sweep/run-sweep.js --pilot         # 5 words × 2 pairs
//   node scripts/v4-sweep/run-sweep.js --concurrency=20
//   node scripts/v4-sweep/run-sweep.js --langs=ko,en   # subset
//   node scripts/v4-sweep/run-sweep.js --no-tts        # skip TTS

const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const { SOURCE_LANGS, CORPUS, REVERSE_CORPUS } = require('./corpus');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ARGS = process.argv.slice(2);
const arg = (k, def) => {
  const a = ARGS.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : def;
};
const flag = (k) => ARGS.includes(`--${k}`);

const PILOT = flag('pilot');
const NO_TTS = flag('no-tts');
const NO_REVERSE = flag('no-reverse');
const FORCE_FRESH = flag('force-fresh'); // bypass cache so every call exercises the LIVE code path
const RETRY_FROM = arg('retry-from', null); // path to a prior NDJSON; re-runs only failed rows
const CONCURRENCY = parseInt(arg('concurrency', PILOT ? '4' : '15'), 10);
const LANGS_ARG = arg('langs', null);
const PAIRS_ARG = arg('pairs', null);
const RUN_LANGS = LANGS_ARG ? LANGS_ARG.split(',').filter(Boolean) : SOURCE_LANGS;
const TARGET_LANGS = SOURCE_LANGS; // 7 others; pair function excludes self
const REPORT_DIR = path.resolve(__dirname, 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T.]/g, '-').slice(0, 19);
const TAG = PILOT ? 'pilot' : 'full';
const NDJSON = path.join(REPORT_DIR, `sweep-${TAG}-${stamp}.ndjson`);
const REPORT_MD = path.join(REPORT_DIR, `sweep-${TAG}-${stamp}.md`);
const REPORT_JSON = path.join(REPORT_DIR, `sweep-${TAG}-${stamp}.json`);

const ndStream = fs.createWriteStream(NDJSON, { flags: 'a' });
function nd(rec) { ndStream.write(JSON.stringify(rec) + '\n'); }

const counters = {
  started: 0,
  forward: { quick_ok: 0, quick_err: 0, enrich_ok: 0, enrich_err: 0, tts_ok: 0, tts_err: 0 },
  reverse: { ok: 0, err: 0 },
};
const t0 = Date.now();

function pct(p, arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[i];
}

// ─────────────────────────────────────────────────────────────────
// Single forward lookup (quick + enrich + tts) mirroring the real
// app flow: quick runs first (search preview), enrich kicks off on
// detail open, TTS fires when the user taps audio. We await sequentially
// (matches the user's saving flow when they immediately save). For
// timing accuracy, each call records its own latency.
// ─────────────────────────────────────────────────────────────────
async function forwardPair({ sourceLang, targetLang, word, category, note, readingHint }) {
  const rec = {
    type: 'forward',
    sourceLang, targetLang, word, category, note, readingHint,
    quick: null, enrich: null, tts: null,
  };

  // Step 1: quick. v4 returns meanings + reading + ipa (Latin) immediately.
  const q0 = Date.now();
  try {
    const r = await admin.functions.invoke('word-lookup-v4', {
      body: { word, sourceLang, targetLang, mode: 'quick', ...(readingHint ? { readingHint } : {}), ...(FORCE_FRESH ? { forceFresh: true } : {}) },
    });
    const ms = Date.now() - q0;
    if (r.error) {
      rec.quick = { ok: false, ms, error: r.error.message };
      counters.forward.quick_err++;
    } else {
      const result = r.data?.result ?? {};
      rec.quick = {
        ok: true, ms, cached: !!r.data?.cached,
        headword: result.headword, reading: result.reading, ipa: result.ipa,
        meaningsCount: Array.isArray(result.meanings) ? result.meanings.length : 0,
        note: result.note ?? null,
        firstMeaning: result.meanings?.[0]?.definition ?? null,
        partOfSpeech: result.meanings?.[0]?.partOfSpeech ?? null,
        correctedHeadword: result.correctedHeadword ?? null,
      };
      counters.forward.quick_ok++;
    }
  } catch (err) {
    rec.quick = { ok: false, ms: Date.now() - q0, error: String(err.message || err) };
    counters.forward.quick_err++;
  }

  // Step 2: enrich. Same word, asks for examples + syn/ant. Cache hit on
  // 2nd target_lang for the same word saves canonical sentence (now that
  // race-condition fix is deployed).
  const e0 = Date.now();
  try {
    const r = await admin.functions.invoke('word-lookup-v4', {
      body: { word, sourceLang, targetLang, mode: 'enrich', ...(readingHint ? { readingHint } : {}), ...(FORCE_FRESH ? { forceFresh: true } : {}) },
    });
    const ms = Date.now() - e0;
    if (r.error) {
      rec.enrich = { ok: false, ms, error: r.error.message };
      counters.forward.enrich_err++;
    } else {
      const result = r.data?.result ?? {};
      const examples = Array.isArray(result.examples) ? result.examples : [];
      const markersOk = examples.filter((ex) => /\*\*[^*]+\*\*/.test(ex.sentence || '')).length;
      const transNoMarker = examples.filter((ex) => ex.translation && !/\*\*/.test(ex.translation)).length;
      rec.enrich = {
        ok: true, ms, cached: !!r.data?.cached,
        meaningsCount: Array.isArray(result.meanings) ? result.meanings.length : 0,
        examplesCount: examples.length,
        markersOk, transNoMarker,
        synonymsCount: Array.isArray(result.synonyms) ? result.synonyms.length : 0,
        antonymsCount: Array.isArray(result.antonyms) ? result.antonyms.length : 0,
        note: result.note ?? null,
        firstExample: examples[0]?.sentence ?? null,
        firstTranslation: examples[0]?.translation ?? null,
      };
      counters.forward.enrich_ok++;
    }
  } catch (err) {
    rec.enrich = { ok: false, ms: Date.now() - e0, error: String(err.message || err) };
    counters.forward.enrich_err++;
  }

  // Step 3: TTS on headword (skipped for the first target_lang only on long
  // sentences / non-words so we don't synth garbage). 1 voice per word.
  if (!NO_TTS) {
    const headword = rec.quick?.headword || word;
    const hwLen = (headword || '').length;
    const skipTts = (rec.quick?.meaningsCount ?? 0) === 0 || hwLen === 0 || hwLen > 40;
    if (!skipTts) {
      const s0 = Date.now();
      try {
        const r = await admin.functions.invoke('tts-synthesize', {
          body: { text: headword, language: sourceLang, gender: 'F' },
        });
        const ms = Date.now() - s0;
        if (r.error) {
          rec.tts = { ok: false, ms, error: r.error.message };
          counters.forward.tts_err++;
        } else {
          rec.tts = {
            ok: true, ms, cached: !!r.data?.cached,
            url: typeof r.data?.url === 'string' ? r.data.url.slice(0, 60) : null,
            rateCorrection: r.data?.rateCorrection ?? null,
          };
          counters.forward.tts_ok++;
        }
      } catch (err) {
        rec.tts = { ok: false, ms: Date.now() - s0, error: String(err.message || err) };
        counters.forward.tts_err++;
      }
    } else {
      rec.tts = { skipped: true };
    }
  } else {
    rec.tts = { skipped: true };
  }

  nd(rec);
  counters.started++;
  if (counters.started % 25 === 0 || counters.started === totalPairs) {
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    const rate = (counters.started / Math.max(0.001, (Date.now() - t0) / 1000)).toFixed(1);
    console.log(`  [${counters.started}/${totalPairs}] +${dt}s @ ${rate}/s  quick:${counters.forward.quick_ok}ok/${counters.forward.quick_err}err  enrich:${counters.forward.enrich_ok}/${counters.forward.enrich_err}  tts:${counters.forward.tts_ok}/${counters.forward.tts_err}`);
  }
  return rec;
}

async function reversePair({ word, inputLang, studyLang }) {
  const rec = { type: 'reverse', studyLang, inputLang, word, ms: 0, ok: false };
  const t = Date.now();
  try {
    const r = await admin.functions.invoke('word-lookup-v4', {
      body: { word, sourceLang: studyLang, targetLang: inputLang, translate: true },
    });
    rec.ms = Date.now() - t;
    if (r.error) {
      rec.error = r.error.message;
      counters.reverse.err++;
    } else {
      const result = r.data?.result ?? {};
      rec.ok = true;
      rec.candidateCount = Array.isArray(result.candidates) ? result.candidates.length : 0;
      rec.candidates = (result.candidates || []).slice(0, 3).map((c) => c.headword);
      rec.note = result.note ?? null;
      counters.reverse.ok++;
    }
  } catch (err) {
    rec.ms = Date.now() - t;
    rec.error = String(err.message || err);
    counters.reverse.err++;
  }
  nd(rec);
  return rec;
}

// ─────────────────────────────────────────────────────────────────
// Bounded-concurrency pool over an array of tasks.
// ─────────────────────────────────────────────────────────────────
async function pool(items, fn, n) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try { await fn(items[idx]); }
      catch (err) { console.warn('  worker error:', err.message || err); }
    }
  });
  await Promise.all(workers);
}

// Build the (source × target × word) task list.
function buildForwardTasks() {
  const tasks = [];
  for (const sl of RUN_LANGS) {
    let words = CORPUS[sl] || [];
    if (PILOT) words = words.slice(0, 5);
    for (const tl of TARGET_LANGS) {
      if (tl === sl) continue;
      if (PAIRS_ARG && !PAIRS_ARG.split(',').includes(`${sl}-${tl}`)) continue;
      for (const w of words) {
        tasks.push({ sourceLang: sl, targetLang: tl, ...w });
      }
    }
  }
  return tasks;
}

function buildReverseTasks() {
  if (NO_REVERSE) return [];
  const tasks = [];
  for (const sl of RUN_LANGS) {
    let words = REVERSE_CORPUS[sl] || [];
    if (PILOT) words = words.slice(0, 2);
    for (const w of words) {
      tasks.push({ studyLang: sl, ...w });
    }
  }
  return tasks;
}

// Retry mode: load a prior NDJSON, keep only rows whose quick OR enrich
// errored, and rebuild the task list from those. Reverse: re-run all
// reverses whose .ok=false. Lets us re-fire just the IP-capped tail of a
// previous sweep without touching the ~2300 successful pairs.
function loadRetryTasks(priorPath) {
  const lines = fs.readFileSync(priorPath, 'utf8').split('\n').filter(Boolean);
  const fwd = [];
  const rev = [];
  for (const line of lines) {
    const r = JSON.parse(line);
    if (r.type === 'forward' && (!r.quick?.ok || !r.enrich?.ok)) {
      fwd.push({ sourceLang: r.sourceLang, targetLang: r.targetLang, word: r.word, category: r.category, note: r.note, readingHint: r.readingHint });
    } else if (r.type === 'reverse' && !r.ok) {
      rev.push({ studyLang: r.studyLang, inputLang: r.inputLang, word: r.word });
    }
  }
  return { fwd, rev };
}

let forwardTasks, reverseTasks;
if (RETRY_FROM) {
  const retry = loadRetryTasks(RETRY_FROM);
  forwardTasks = retry.fwd;
  reverseTasks = retry.rev;
  console.log(`Retry mode: loaded ${forwardTasks.length} forward + ${reverseTasks.length} reverse from ${RETRY_FROM}`);
} else {
  forwardTasks = buildForwardTasks();
  reverseTasks = buildReverseTasks();
}
let totalPairs = forwardTasks.length;

// ─────────────────────────────────────────────────────────────────
// Report generation
// ─────────────────────────────────────────────────────────────────
function loadRecords() {
  return fs.readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function quickIsCacheable(r) {
  if (!r.quick?.ok) return false;
  return r.quick.cached === true;
}

function generateReport() {
  const recs = loadRecords();
  const forwards = recs.filter((r) => r.type === 'forward');
  const reverses = recs.filter((r) => r.type === 'reverse');

  // Latency arrays
  const quickMs = forwards.filter((r) => r.quick?.ok).map((r) => r.quick.ms);
  const enrichMs = forwards.filter((r) => r.enrich?.ok).map((r) => r.enrich.ms);
  const ttsMs = forwards.filter((r) => r.tts?.ok).map((r) => r.tts.ms);
  const reverseMs = reverses.filter((r) => r.ok).map((r) => r.ms);

  // Per-pair latency
  const pairStats = new Map();
  for (const r of forwards) {
    const key = `${r.sourceLang}→${r.targetLang}`;
    if (!pairStats.has(key)) pairStats.set(key, { quick: [], enrich: [], tts: [], cachedQuick: 0, cachedEnrich: 0, total: 0 });
    const s = pairStats.get(key);
    if (r.quick?.ok) { s.quick.push(r.quick.ms); if (r.quick.cached) s.cachedQuick++; }
    if (r.enrich?.ok) { s.enrich.push(r.enrich.ms); if (r.enrich.cached) s.cachedEnrich++; }
    if (r.tts?.ok) s.tts.push(r.tts.ms);
    s.total++;
  }

  // Per-category quality
  const catStats = new Map();
  for (const r of forwards) {
    const cat = r.category || 'uncat';
    if (!catStats.has(cat)) catStats.set(cat, {
      total: 0, emptyQuick: 0, emptyEnrich: 0, missingMarker: 0, ipaMissing: 0,
      readingMissing: 0, noteRejected: 0,
    });
    const s = catStats.get(cat);
    s.total++;
    if (r.quick?.ok) {
      if (r.quick.meaningsCount === 0) s.emptyQuick++;
      if (r.quick.note && r.quick.note !== null) s.noteRejected++;
      // For Latin source langs IPA lives in the `reading` field (DictEntry
      // maps wiktionary/freedict.ipa → reading). ko has Hangul == phonetic,
      // intentionally no separate reading. ja/zh-CN need a real reading
      // (kana / pinyin) since the headword glyphs don't convey sound.
      const latinSource = ['en', 'es', 'fr', 'de', 'it'].includes(r.sourceLang);
      const cjkPhoneticSource = ['ja', 'zh-CN'].includes(r.sourceLang);
      if (latinSource && r.quick.meaningsCount > 0 && !r.quick.reading) s.ipaMissing++;
      if (cjkPhoneticSource && r.quick.meaningsCount > 0 && !r.quick.reading) s.readingMissing++;
    }
    if (r.enrich?.ok) {
      if (r.enrich.examplesCount === 0 && r.enrich.meaningsCount > 0) s.emptyEnrich++;
      if (r.enrich.examplesCount > 0 && r.enrich.markersOk < r.enrich.examplesCount) s.missingMarker++;
    }
  }

  // Cost estimate (rough — based on observed openai pricing).
  // gpt-4.1-mini avg per word-lookup call: ~$0.001. TTS Azure Neural: ~$16/M chars; avg 10 char headword.
  const llmCalls = forwards.length * 2 + reverses.length; // quick + enrich + reverse
  const estLlmCost = llmCalls * 0.0015;
  const ttsChars = forwards.filter((r) => r.tts?.ok).reduce((acc) => acc + 10, 0);
  const estTtsCost = (ttsChars / 1_000_000) * 16;
  const estTotalUsd = estLlmCost + estTtsCost;

  // Build markdown report
  const lines = [];
  lines.push(`# v4 56-pair sweep — ${TAG} (${stamp})`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}  ·  Mode: ${TAG}  ·  Concurrency: ${CONCURRENCY}`);
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(`- Forward lookups (quick+enrich pairs): **${forwards.length}**`);
  lines.push(`- Reverse lookups: **${reverses.length}**`);
  lines.push(`- Total OpenAI/LLM edge calls: ${llmCalls}`);
  lines.push(`- Total run time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  lines.push(`- Throughput: ${(forwards.length / Math.max(0.001, (Date.now() - t0) / 1000)).toFixed(1)} pairs/s`);
  lines.push(`- **Estimated cost: $${estTotalUsd.toFixed(3)} USD** (LLM $${estLlmCost.toFixed(3)} + TTS $${estTtsCost.toFixed(3)})`);
  lines.push('');
  lines.push('## Latency (ms)');
  lines.push('');
  lines.push('| Phase | n | p50 | p90 | p95 | max |');
  lines.push('|-------|---:|----:|----:|----:|----:|');
  lines.push(`| quick (search preview) | ${quickMs.length} | ${pct(50, quickMs)} | ${pct(90, quickMs)} | ${pct(95, quickMs)} | ${Math.max(0, ...quickMs)} |`);
  lines.push(`| enrich (detail/save)   | ${enrichMs.length} | ${pct(50, enrichMs)} | ${pct(90, enrichMs)} | ${pct(95, enrichMs)} | ${Math.max(0, ...enrichMs)} |`);
  lines.push(`| tts-synthesize         | ${ttsMs.length} | ${pct(50, ttsMs)} | ${pct(90, ttsMs)} | ${pct(95, ttsMs)} | ${Math.max(0, ...ttsMs)} |`);
  lines.push(`| reverse lookup         | ${reverseMs.length} | ${pct(50, reverseMs)} | ${pct(90, reverseMs)} | ${pct(95, reverseMs)} | ${Math.max(0, ...reverseMs)} |`);
  lines.push('');
  lines.push('## Success rate');
  lines.push('');
  lines.push(`- Quick OK / Err: ${counters.forward.quick_ok} / ${counters.forward.quick_err}`);
  lines.push(`- Enrich OK / Err: ${counters.forward.enrich_ok} / ${counters.forward.enrich_err}`);
  lines.push(`- TTS OK / Err: ${counters.forward.tts_ok} / ${counters.forward.tts_err}`);
  lines.push(`- Reverse OK / Err: ${counters.reverse.ok} / ${counters.reverse.err}`);
  lines.push('');
  lines.push('## Per-pair latency (enrich p50/p95 ms, cache hit %)');
  lines.push('');
  lines.push('| pair | n | quick p50/p95 | enrich p50/p95 | tts p50 | quick cache% | enrich cache% |');
  lines.push('|------|---:|---:|---:|---:|---:|---:|');
  const sortedPairs = [...pairStats.entries()].sort();
  for (const [pair, s] of sortedPairs) {
    lines.push(`| ${pair} | ${s.total} | ${pct(50, s.quick)}/${pct(95, s.quick)} | ${pct(50, s.enrich)}/${pct(95, s.enrich)} | ${pct(50, s.tts)} | ${((s.cachedQuick / Math.max(1, s.total)) * 100).toFixed(0)}% | ${((s.cachedEnrich / Math.max(1, s.total)) * 100).toFixed(0)}% |`);
  }
  lines.push('');
  lines.push('## Quality by category');
  lines.push('');
  lines.push('| category | n | empty quick | empty enrich | missing marker | IPA missing | reading missing | note=rejected |');
  lines.push('|----------|---:|---:|---:|---:|---:|---:|---:|');
  const sortedCats = [...catStats.entries()].sort();
  for (const [cat, s] of sortedCats) {
    lines.push(`| ${cat} | ${s.total} | ${s.emptyQuick} | ${s.emptyEnrich} | ${s.missingMarker} | ${s.ipaMissing} | ${s.readingMissing} | ${s.noteRejected} |`);
  }
  lines.push('');
  lines.push('## Notable outliers');
  lines.push('');
  lines.push('### Slowest 10 enrich calls');
  const slowest = [...forwards].filter((r) => r.enrich?.ok).sort((a, b) => b.enrich.ms - a.enrich.ms).slice(0, 10);
  lines.push('| ms | pair | word | category |');
  lines.push('|---:|------|------|----------|');
  for (const r of slowest) lines.push(`| ${r.enrich.ms} | ${r.sourceLang}→${r.targetLang} | ${r.word} | ${r.category} |`);
  lines.push('');
  lines.push('### Empty quick (model returned no meanings on dict path)');
  const emptyQ = forwards.filter((r) => r.quick?.ok && r.quick.meaningsCount === 0 && !r.quick.note).slice(0, 20);
  if (emptyQ.length) {
    lines.push('| pair | word | category |');
    lines.push('|------|------|----------|');
    for (const r of emptyQ) lines.push(`| ${r.sourceLang}→${r.targetLang} | ${r.word} | ${r.category} |`);
  } else {
    lines.push('_(none)_');
  }
  lines.push('');
  lines.push('### Errors (any phase)');
  const errs = forwards.filter((r) => !r.quick?.ok || !r.enrich?.ok).slice(0, 20);
  if (errs.length) {
    lines.push('| pair | word | category | quick err | enrich err |');
    lines.push('|------|------|----------|-----------|------------|');
    for (const r of errs) lines.push(`| ${r.sourceLang}→${r.targetLang} | ${r.word} | ${r.category} | ${r.quick?.error || '-'} | ${r.enrich?.error || '-'} |`);
  } else {
    lines.push('_(none)_');
  }
  lines.push('');
  lines.push(`## Raw data`);
  lines.push('');
  lines.push(`NDJSON: \`${path.relative(process.cwd(), NDJSON)}\``);

  fs.writeFileSync(REPORT_MD, lines.join('\n'));
  fs.writeFileSync(REPORT_JSON, JSON.stringify({
    stamp, tag: TAG, concurrency: CONCURRENCY,
    counts: { forward: forwards.length, reverse: reverses.length },
    counters,
    latency: {
      quick: { n: quickMs.length, p50: pct(50, quickMs), p90: pct(90, quickMs), p95: pct(95, quickMs) },
      enrich: { n: enrichMs.length, p50: pct(50, enrichMs), p90: pct(90, enrichMs), p95: pct(95, enrichMs) },
      tts: { n: ttsMs.length, p50: pct(50, ttsMs), p90: pct(90, ttsMs), p95: pct(95, ttsMs) },
      reverse: { n: reverseMs.length, p50: pct(50, reverseMs), p90: pct(90, reverseMs), p95: pct(95, reverseMs) },
    },
    estCostUsd: estTotalUsd,
    perPair: Object.fromEntries(pairStats),
    perCategory: Object.fromEntries(catStats),
  }, null, 2));

  console.log(`\n📄 Report: ${REPORT_MD}`);
  console.log(`📊 JSON:   ${REPORT_JSON}`);
  console.log(`📝 Raw:    ${NDJSON}`);
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n=== v4 sweep ${TAG} — concurrency=${CONCURRENCY} ===`);
  console.log(`Langs: ${RUN_LANGS.join(',')}`);
  console.log(`Forward tasks: ${forwardTasks.length}  Reverse tasks: ${reverseTasks.length}`);
  console.log(`NDJSON output: ${NDJSON}\n`);

  console.log('▶ Forward sweep…');
  await pool(forwardTasks, forwardPair, CONCURRENCY);

  if (reverseTasks.length > 0) {
    console.log('\n▶ Reverse sweep…');
    await pool(reverseTasks, reversePair, Math.min(CONCURRENCY, 8));
  }

  ndStream.end();
  await new Promise((r) => ndStream.on('close', r));
  generateReport();
  console.log(`\n✅ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch((err) => { console.error('Fatal:', err); process.exit(1); });
