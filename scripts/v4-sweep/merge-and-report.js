// Merge primary + retry NDJSON files into one report.
// Successful retry rows OVERRIDE failed primary rows for the same key.
//
// Usage:
//   node scripts/v4-sweep/merge-and-report.js <primary.ndjson> <retry.ndjson>

const path = require('path');
const fs = require('fs');

const [primary, retry] = process.argv.slice(2);
if (!primary || !retry) { console.error('usage: merge-and-report.js <primary.ndjson> <retry.ndjson>'); process.exit(1); }

function load(p) {
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const pri = load(primary);
const ret = load(retry);

const fwdKey = (r) => `f|${r.sourceLang}|${r.targetLang}|${r.word}`;
const revKey = (r) => `r|${r.studyLang}|${r.inputLang}|${r.word}`;

const merged = new Map();
for (const r of pri) merged.set(r.type === 'forward' ? fwdKey(r) : revKey(r), r);
let overrides = 0;
for (const r of ret) {
  const k = r.type === 'forward' ? fwdKey(r) : revKey(r);
  const existing = merged.get(k);
  // Only override if retry is "better" (existing failed and retry succeeded).
  if (!existing) { merged.set(k, r); continue; }
  if (r.type === 'forward') {
    const existingOk = existing.quick?.ok && existing.enrich?.ok;
    const retryOk = r.quick?.ok && r.enrich?.ok;
    if (!existingOk && retryOk) { merged.set(k, r); overrides++; }
  } else {
    if (!existing.ok && r.ok) { merged.set(k, r); overrides++; }
  }
}

const recs = [...merged.values()];
console.log(`Merged: primary ${pri.length} + retry ${ret.length} → ${recs.length} unique (${overrides} retry overrides)`);

const forwards = recs.filter((r) => r.type === 'forward');
const reverses = recs.filter((r) => r.type === 'reverse');

function pct(p, arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const quickMs = forwards.filter((r) => r.quick?.ok).map((r) => r.quick.ms);
const enrichMs = forwards.filter((r) => r.enrich?.ok).map((r) => r.enrich.ms);
const ttsMs = forwards.filter((r) => r.tts?.ok).map((r) => r.tts.ms);
const reverseMs = reverses.filter((r) => r.ok).map((r) => r.ms);

const pairStats = new Map();
for (const r of forwards) {
  const key = `${r.sourceLang}→${r.targetLang}`;
  if (!pairStats.has(key)) pairStats.set(key, { quick: [], enrich: [], tts: [], cachedQuick: 0, cachedEnrich: 0, total: 0, quickOk: 0, enrichOk: 0 });
  const s = pairStats.get(key);
  if (r.quick?.ok) { s.quick.push(r.quick.ms); s.quickOk++; if (r.quick.cached) s.cachedQuick++; }
  if (r.enrich?.ok) { s.enrich.push(r.enrich.ms); s.enrichOk++; if (r.enrich.cached) s.cachedEnrich++; }
  if (r.tts?.ok) s.tts.push(r.tts.ms);
  s.total++;
}

const catStats = new Map();
for (const r of forwards) {
  const cat = r.category || 'uncat';
  if (!catStats.has(cat)) catStats.set(cat, {
    total: 0, emptyQuick: 0, emptyEnrich: 0, missingMarker: 0, ipaMissing: 0,
    readingMissing: 0, noteRejected: 0, errors: 0,
  });
  const s = catStats.get(cat);
  s.total++;
  if (!r.quick?.ok || !r.enrich?.ok) s.errors++;
  if (r.quick?.ok) {
    if (r.quick.meaningsCount === 0) s.emptyQuick++;
    if (r.quick.note) s.noteRejected++;
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

const llmCalls = forwards.length * 2 + reverses.length;
const estLlmCost = llmCalls * 0.0015;
const ttsChars = forwards.filter((r) => r.tts?.ok).length * 10;
const estTtsCost = (ttsChars / 1_000_000) * 16;
const estTotalUsd = estLlmCost + estTtsCost;

const errorPairs = forwards.filter((r) => !r.quick?.ok || !r.enrich?.ok);
const reverseErrorPairs = reverses.filter((r) => !r.ok);

const counters = {
  forward: {
    quick_ok: forwards.filter((r) => r.quick?.ok).length,
    quick_err: forwards.filter((r) => !r.quick?.ok).length,
    enrich_ok: forwards.filter((r) => r.enrich?.ok).length,
    enrich_err: forwards.filter((r) => !r.enrich?.ok).length,
    tts_ok: forwards.filter((r) => r.tts?.ok).length,
    tts_err: forwards.filter((r) => r.tts && !r.tts.skipped && !r.tts.ok).length,
    tts_skipped: forwards.filter((r) => r.tts?.skipped).length,
  },
  reverse: {
    ok: reverses.filter((r) => r.ok).length,
    err: reverses.filter((r) => !r.ok).length,
  },
};

const stamp = new Date().toISOString().replace(/[:T.]/g, '-').slice(0, 19);
const outDir = path.dirname(primary);
const REPORT_MD = path.join(outDir, `merged-${stamp}.md`);
const REPORT_JSON = path.join(outDir, `merged-${stamp}.json`);
const NDJSON = path.join(outDir, `merged-${stamp}.ndjson`);
fs.writeFileSync(NDJSON, recs.map((r) => JSON.stringify(r)).join('\n'));

const lines = [];
lines.push(`# v4 56-pair sweep — merged report (${stamp})`);
lines.push('');
lines.push(`Merged from primary \`${path.basename(primary)}\` + retry \`${path.basename(retry)}\`. ${overrides} primary failures recovered via retry.`);
lines.push('');
lines.push('## Headline');
lines.push('');
lines.push(`- **Forward lookups**: ${forwards.length} (${counters.forward.quick_ok} quick-OK, ${counters.forward.enrich_ok} enrich-OK)`);
lines.push(`- **Reverse lookups**: ${reverses.length} (${counters.reverse.ok} OK, ${counters.reverse.err} err)`);
lines.push(`- **TTS calls**: ${counters.forward.tts_ok} OK, ${counters.forward.tts_err} err, ${counters.forward.tts_skipped} skipped (non-words / oversized)`);
lines.push(`- **Errors remaining**: ${counters.forward.quick_err} quick / ${counters.forward.enrich_err} enrich / ${counters.reverse.err} reverse`);
lines.push(`- **Estimated cost (primary + retry)**: $${estTotalUsd.toFixed(2)} USD`);
lines.push('');
lines.push('## Latency (ms) — successful calls');
lines.push('');
lines.push('| Phase | n | p50 | p90 | p95 | max |');
lines.push('|-------|---:|----:|----:|----:|----:|');
lines.push(`| quick (search preview) | ${quickMs.length} | ${pct(50, quickMs)} | ${pct(90, quickMs)} | ${pct(95, quickMs)} | ${Math.max(0, ...quickMs)} |`);
lines.push(`| enrich (detail/save)   | ${enrichMs.length} | ${pct(50, enrichMs)} | ${pct(90, enrichMs)} | ${pct(95, enrichMs)} | ${Math.max(0, ...enrichMs)} |`);
lines.push(`| tts-synthesize         | ${ttsMs.length} | ${pct(50, ttsMs)} | ${pct(90, ttsMs)} | ${pct(95, ttsMs)} | ${Math.max(0, ...ttsMs)} |`);
lines.push(`| reverse lookup         | ${reverseMs.length} | ${pct(50, reverseMs)} | ${pct(90, reverseMs)} | ${pct(95, reverseMs)} | ${Math.max(0, ...reverseMs)} |`);
lines.push('');
lines.push('## Per-pair (quick p50/p95, enrich p50/p95)');
lines.push('');
lines.push('| pair | n | quick p50/p95 | enrich p50/p95 | tts p50 | cache% |');
lines.push('|------|---:|---:|---:|---:|---:|');
for (const [pair, s] of [...pairStats.entries()].sort()) {
  const cacheHit = s.total > 0 ? Math.round((s.cachedEnrich / s.total) * 100) : 0;
  lines.push(`| ${pair} | ${s.total} | ${pct(50, s.quick)}/${pct(95, s.quick)} | ${pct(50, s.enrich)}/${pct(95, s.enrich)} | ${pct(50, s.tts)} | ${cacheHit}% |`);
}
lines.push('');
lines.push('## Quality by category');
lines.push('');
lines.push('Columns: total / empty-quick / empty-enrich / missing-marker / IPA-missing (Latin source) / reading-missing (ja+zh-CN) / note-rejected (sentence|non_word|wrong_language) / errors');
lines.push('');
lines.push('| category | n | emptyQ | emptyE | missMarker | IPAmiss | readMiss | noteReject | err |');
lines.push('|----------|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const [cat, s] of [...catStats.entries()].sort()) {
  lines.push(`| ${cat} | ${s.total} | ${s.emptyQuick} | ${s.emptyEnrich} | ${s.missingMarker} | ${s.ipaMissing} | ${s.readingMissing} | ${s.noteRejected} | ${s.errors} |`);
}
lines.push('');
lines.push('## Slowest 15 enrich calls (likely outliers worth inspecting)');
lines.push('');
lines.push('| ms | pair | word | category |');
lines.push('|---:|------|------|----------|');
for (const r of [...forwards].filter((r) => r.enrich?.ok).sort((a, b) => b.enrich.ms - a.enrich.ms).slice(0, 15)) {
  lines.push(`| ${r.enrich.ms} | ${r.sourceLang}→${r.targetLang} | ${r.word} | ${r.category} |`);
}
lines.push('');
lines.push('## Quality red flags');
lines.push('');
lines.push('### Empty quick on valid-looking words (dict gap or judge dropped all senses)');
const realEmpties = forwards.filter((r) => r.quick?.ok && r.quick.meaningsCount === 0 && !r.quick.note && !['edge','formula','long_sentence','wrong_lang','typo'].includes(r.category));
if (realEmpties.length) {
  lines.push('| pair | word | category |');
  lines.push('|------|------|----------|');
  for (const r of realEmpties.slice(0, 30)) lines.push(`| ${r.sourceLang}→${r.targetLang} | ${r.word} | ${r.category} |`);
} else { lines.push('_(none)_'); }
lines.push('');
lines.push('### Enrich examples missing for non-trivial meanings (>0 meanings, 0 examples)');
const emptyExamples = forwards.filter((r) => r.enrich?.ok && r.enrich.meaningsCount > 0 && r.enrich.examplesCount === 0 && !['edge','formula','long_sentence','wrong_lang','typo'].includes(r.category));
if (emptyExamples.length) {
  lines.push('| pair | word | category | meanings |');
  lines.push('|------|------|----------|---------:|');
  for (const r of emptyExamples.slice(0, 30)) lines.push(`| ${r.sourceLang}→${r.targetLang} | ${r.word} | ${r.category} | ${r.enrich.meaningsCount} |`);
} else { lines.push('_(none)_'); }
lines.push('');
lines.push('### Typo handling — should auto-correct (correctedHeadword) or surface note=non_word');
const typoRows = forwards.filter((r) => r.category === 'typo' && r.quick?.ok).slice(0, 20);
if (typoRows.length) {
  lines.push('| pair | word → corrected | note | meanings |');
  lines.push('|------|------------------|------|---------:|');
  for (const r of typoRows) {
    const corr = r.quick.correctedHeadword || (r.quick.headword !== r.word ? r.quick.headword : '-');
    lines.push(`| ${r.sourceLang}→${r.targetLang} | ${r.word} → ${corr} | ${r.quick.note || '-'} | ${r.quick.meaningsCount} |`);
  }
}
lines.push('');
lines.push('### Long-sentence handling — should return note=sentence');
const longRows = forwards.filter((r) => r.category === 'long_sentence' && r.quick?.ok).slice(0, 16);
if (longRows.length) {
  lines.push('| pair | word | note | meanings |');
  lines.push('|------|------|------|---------:|');
  for (const r of longRows) {
    lines.push(`| ${r.sourceLang}→${r.targetLang} | ${r.word.slice(0, 30)} | ${r.quick.note || '-'} | ${r.quick.meaningsCount} |`);
  }
}
lines.push('');
lines.push('### Profanity surfacing (memory: general profanity surface, slurs cut)');
const profRows = forwards.filter((r) => r.category === 'profanity' && r.quick?.ok).slice(0, 24);
if (profRows.length) {
  lines.push('| pair | word | meanings | first definition |');
  lines.push('|------|------|---------:|------------------|');
  for (const r of profRows) {
    lines.push(`| ${r.sourceLang}→${r.targetLang} | ${r.word} | ${r.quick.meaningsCount} | ${(r.quick.firstMeaning || '').slice(0, 60)} |`);
  }
}
lines.push('');
lines.push('### Disputed/political — neutrality check (look at enrich example translations)');
const disputedRows = forwards.filter((r) => r.category === 'disputed' && r.enrich?.ok && r.enrich.examplesCount > 0).slice(0, 18);
if (disputedRows.length) {
  lines.push('| pair | word | first example |');
  lines.push('|------|------|---------------|');
  for (const r of disputedRows) {
    lines.push(`| ${r.sourceLang}→${r.targetLang} | ${r.word} | ${(r.enrich.firstExample || '').slice(0, 80)} |`);
  }
}
lines.push('');
lines.push('## Reverse lookup quality');
lines.push('');
const reverseByStudy = new Map();
for (const r of reverses) {
  if (!reverseByStudy.has(r.studyLang)) reverseByStudy.set(r.studyLang, []);
  reverseByStudy.get(r.studyLang).push(r);
}
lines.push('| studyLang | n | OK | avg candidates | sample |');
lines.push('|-----------|---:|---:|---:|--------|');
for (const [sl, rows] of [...reverseByStudy.entries()].sort()) {
  const ok = rows.filter((r) => r.ok).length;
  const avgC = rows.filter((r) => r.ok).reduce((a, r) => a + (r.candidateCount || 0), 0) / Math.max(1, ok);
  const sample = rows.find((r) => r.ok && r.candidateCount > 0);
  const sampleStr = sample ? `${sample.word}(${sample.inputLang}) → ${sample.candidates?.join('/') || ''}` : '-';
  lines.push(`| ${sl} | ${rows.length} | ${ok} | ${avgC.toFixed(1)} | ${sampleStr} |`);
}
lines.push('');
lines.push('## Remaining errors');
lines.push('');
if (errorPairs.length === 0 && reverseErrorPairs.length === 0) {
  lines.push('_(none — clean run)_');
} else {
  if (errorPairs.length) {
    lines.push(`### Forward (${errorPairs.length})`);
    lines.push('| pair | word | category | quick | enrich |');
    lines.push('|------|------|----------|-------|--------|');
    for (const r of errorPairs.slice(0, 30)) lines.push(`| ${r.sourceLang}→${r.targetLang} | ${r.word} | ${r.category} | ${r.quick?.error || '-'} | ${r.enrich?.error || '-'} |`);
  }
  if (reverseErrorPairs.length) {
    lines.push(`### Reverse (${reverseErrorPairs.length})`);
    lines.push('| study | input | word | error |');
    lines.push('|-------|-------|------|-------|');
    for (const r of reverseErrorPairs.slice(0, 30)) lines.push(`| ${r.studyLang} | ${r.inputLang} | ${r.word} | ${r.error} |`);
  }
}
lines.push('');
lines.push(`## Raw data`);
lines.push('');
lines.push(`Merged NDJSON: \`${path.basename(NDJSON)}\``);
lines.push(`Primary NDJSON: \`${path.basename(primary)}\``);
lines.push(`Retry NDJSON: \`${path.basename(retry)}\``);

fs.writeFileSync(REPORT_MD, lines.join('\n'));
fs.writeFileSync(REPORT_JSON, JSON.stringify({
  stamp,
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

console.log(`📄 Report: ${REPORT_MD}`);
console.log(`📊 JSON:   ${REPORT_JSON}`);
console.log(`📝 NDJSON: ${NDJSON}`);
