// Aggregate latency / cost / quality stats across every sweep NDJSON run so
// far. Reports cumulative numbers + per-sweep breakdown so we can see how
// the system evolved across the 6 fix rounds.

const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, 'reports');
const files = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.ndjson') && (f.startsWith('sweep-') || f.startsWith('merged-')))
  .sort();

function load(p) {
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function pct(p, arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const perSweep = [];
let totalForward = 0, totalReverse = 0, totalTts = 0;
let totalQuickErr = 0, totalEnrichErr = 0, totalReverseErr = 0;
const allQuick = [], allEnrich = [], allTts = [], allReverse = [];

for (const f of files) {
  const recs = load(path.join(dir, f));
  const fwd = recs.filter((r) => r.type === 'forward');
  const rev = recs.filter((r) => r.type === 'reverse');
  if (fwd.length === 0 && rev.length === 0) continue;

  const qOk = fwd.filter((r) => r.quick?.ok);
  const qErr = fwd.filter((r) => r.quick && !r.quick.ok).length;
  const eOk = fwd.filter((r) => r.enrich?.ok);
  const eErr = fwd.filter((r) => r.enrich && !r.enrich.ok).length;
  const tOk = fwd.filter((r) => r.tts?.ok);
  const tErr = fwd.filter((r) => r.tts && !r.tts.skipped && !r.tts.ok).length;
  const rOk = rev.filter((r) => r.ok);
  const rErr = rev.filter((r) => !r.ok).length;

  const qMs = qOk.map((r) => r.quick.ms);
  const eMs = eOk.map((r) => r.enrich.ms);
  const tMs = tOk.map((r) => r.tts.ms);
  const rMs = rOk.map((r) => r.ms);

  // cache hit rate
  const qCached = qOk.filter((r) => r.quick.cached).length;
  const eCached = eOk.filter((r) => r.enrich.cached).length;

  // quality flags
  const emptyQuick = qOk.filter((r) => r.quick.meaningsCount === 0 && !r.quick.note).length;
  const emptyEnrich = eOk.filter((r) => r.enrich.meaningsCount > 0 && r.enrich.examplesCount === 0).length;
  const missingMarker = eOk.filter((r) => r.enrich.examplesCount > 0 && r.enrich.markersOk < r.enrich.examplesCount).length;

  // cost: forward = quick + enrich = 2 LLM calls × $0.0015 avg (per memory)
  // reverse = 1 LLM call. TTS = avg 10 chars × $16/M chars.
  const llmCalls = fwd.length * 2 + rev.length;
  const llmCost = llmCalls * 0.0015;
  const ttsCost = tOk.length * 10 * 16 / 1_000_000;
  const cost = llmCost + ttsCost;

  perSweep.push({
    file: f,
    forward: fwd.length, reverse: rev.length,
    qOk: qOk.length, qErr, eOk: eOk.length, eErr, tOk: tOk.length, tErr, rOk: rOk.length, rErr,
    qP50: pct(50, qMs), qP95: pct(95, qMs),
    eP50: pct(50, eMs), eP95: pct(95, eMs),
    tP50: pct(50, tMs),
    rP50: pct(50, rMs),
    qCacheRate: qOk.length ? Math.round(qCached / qOk.length * 100) : 0,
    eCacheRate: eOk.length ? Math.round(eCached / eOk.length * 100) : 0,
    emptyQuick, emptyEnrich, missingMarker,
    llmCalls, cost,
  });

  totalForward += fwd.length;
  totalReverse += rev.length;
  totalTts += tOk.length;
  totalQuickErr += qErr;
  totalEnrichErr += eErr;
  totalReverseErr += rErr;
  allQuick.push(...qMs);
  allEnrich.push(...eMs);
  allTts.push(...tMs);
  allReverse.push(...rMs);
}

// Cumulative cost
const cumCost = perSweep.reduce((s, x) => s + x.cost, 0);

console.log('# v4 sweep cumulative stats (all runs)');
console.log('');
console.log('## Cumulative volume');
console.log('');
console.log(`- Forward lookups (quick+enrich pair): ${totalForward.toLocaleString()}`);
console.log(`- Reverse lookups: ${totalReverse.toLocaleString()}`);
console.log(`- TTS calls: ${totalTts.toLocaleString()}`);
console.log(`- **Total LLM/TTS edge calls**: ${(totalForward * 2 + totalReverse + totalTts).toLocaleString()}`);
console.log(`- **Cumulative cost**: **$${cumCost.toFixed(2)} USD**`);
console.log('');
console.log('## Cumulative latency (all sweeps combined)');
console.log('');
console.log('| Phase | n | p50 | p90 | p95 | p99 | max |');
console.log('|-------|---:|----:|----:|----:|----:|----:|');
console.log(`| quick | ${allQuick.length.toLocaleString()} | ${pct(50, allQuick)} | ${pct(90, allQuick)} | ${pct(95, allQuick)} | ${pct(99, allQuick)} | ${Math.max(0, ...allQuick)} |`);
console.log(`| enrich | ${allEnrich.length.toLocaleString()} | ${pct(50, allEnrich)} | ${pct(90, allEnrich)} | ${pct(95, allEnrich)} | ${pct(99, allEnrich)} | ${Math.max(0, ...allEnrich)} |`);
console.log(`| tts | ${allTts.length.toLocaleString()} | ${pct(50, allTts)} | ${pct(90, allTts)} | ${pct(95, allTts)} | ${pct(99, allTts)} | ${Math.max(0, ...allTts)} |`);
console.log(`| reverse | ${allReverse.length.toLocaleString()} | ${pct(50, allReverse)} | ${pct(90, allReverse)} | ${pct(95, allReverse)} | ${pct(99, allReverse)} | ${Math.max(0, ...allReverse)} |`);
console.log('');
console.log('## Per-sweep evolution (chronological)');
console.log('');
console.log('| sweep | n | quick p50/p95 | enrich p50/p95 | tts p50 | err q/e | empty Q/E | mismarker | cost |');
console.log('|-------|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const s of perSweep) {
  const tag = s.file.replace('.ndjson', '').slice(0, 36);
  console.log(`| ${tag} | ${s.forward}/${s.reverse} | ${s.qP50}/${s.qP95} | ${s.eP50}/${s.eP95} | ${s.tP50} | ${s.qErr}/${s.eErr} | ${s.emptyQuick}/${s.emptyEnrich} | ${s.missingMarker} | $${s.cost.toFixed(2)} |`);
}
console.log('');
console.log('## Total errors across all sweeps');
console.log('');
console.log(`- Quick errors: ${totalQuickErr} / ${totalForward} (${(totalQuickErr / Math.max(1, totalForward) * 100).toFixed(1)}%)`);
console.log(`- Enrich errors: ${totalEnrichErr} / ${totalForward} (${(totalEnrichErr / Math.max(1, totalForward) * 100).toFixed(1)}%)`);
console.log(`- Reverse errors: ${totalReverseErr} / ${totalReverse} (${(totalReverseErr / Math.max(1, totalReverse) * 100).toFixed(1)}%)`);
console.log(`- (IP cap errors in original sweep were transient — see fix-history below)`);
