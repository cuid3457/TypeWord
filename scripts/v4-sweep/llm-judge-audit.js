// LLM-as-judge quality audit over a v4 sweep NDJSON.
// -----------------------------------------------------------
// Sends each forward result to GPT-4.1-mini with a strict rubric. The judge
// reads (headword, source/target lang, meanings, examples, category-specific
// hints) and returns scores + a free-text issue list. Bottom-scoring entries
// are escalated to GPT-4.1 for a second opinion.
//
// Score axes (0-100 each):
//   - definition_quality:  meanings cover real, common senses; no fabrications
//   - example_grammar:     source sentence is grammatical in source_lang
//   - marker_correctness:  the **...** span really wraps the headword (or a
//                          legitimate inflection) — NOT an unrelated word
//   - example_sense_align: example demonstrates THE meaning shown on the card
//   - translation_quality: translation conveys the same meaning naturally
//   - register_match:      register/tone preserved (profanity stays vulgar,
//                          neutral stays neutral, formal stays formal)
//   - neutrality (disputed only): no advocacy / political slant
//
// Output: per-row JSON + worst-N markdown report.
//
// Usage:
//   node scripts/v4-sweep/llm-judge-audit.js <ndjson_path> [--concurrency=20]
//                                            [--model=gpt-4.1-mini]
//                                            [--escalate-below=70]

const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!OPENAI_KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) { console.error('Supabase env missing'); process.exit(1); }
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Pull the FULL meanings + examples (not just first) from word_entries +
// word_translations so the judge sees what the user actually sees. Without
// this, the audit harness only sends meaning_1+example_1 and the judge
// flags the (correct) mismatch against the reported meanings_count.
async function fetchFull(word, sourceLang, targetLang) {
  const { data } = await admin
    .from('word_entries')
    .select('headword, reading, word_translations!inner(meanings_translated, examples_translated, target_lang)')
    .eq('word', word)
    .eq('word_lang', sourceLang)
    .eq('word_translations.target_lang', targetLang)
    .maybeSingle();
  const trans = data?.word_translations?.[0];
  return {
    headword: data?.headword || word,
    reading: data?.reading || null,
    meanings: trans?.meanings_translated || [],
    examples: trans?.examples_translated || [],
  };
}

const ARGS = process.argv.slice(2);
const inputPath = ARGS.find((a) => !a.startsWith('--'));
const arg = (k, d) => { const a = ARGS.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const CONCURRENCY = parseInt(arg('concurrency', '20'), 10);
const PRIMARY = arg('model', 'gpt-4.1-mini');
const ESCALATE_BELOW = parseInt(arg('escalate-below', '70'), 10);
const SAMPLE_N = arg('sample', null);
if (!inputPath) { console.error('usage: llm-judge-audit.js <ndjson_path>'); process.exit(1); }

const LANG_NAME = { ko: 'Korean', ja: 'Japanese', zh: 'Mandarin Chinese', 'zh-CN': 'Mandarin Chinese', en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian' };

const JUDGE_SYSTEM = `You are a strict quality reviewer for a multilingual learning dictionary. A vocabulary card for headword W (in SOURCE_LANG) has been generated with meanings (each with a TARGET_LANG definition) and example sentences. Your job: score each axis 0-100 and list concrete issues.

Score honestly. 95+ = publishable as-is. 80-94 = small issues. 60-79 = noticeable problems. 0-59 = broken.

Axes (always score all that apply; use null when N/A):
- definition_quality: do the meanings cover real, common senses of W in SOURCE_LANG? No fabricated meanings? Are sense distinctions valid for a learner?
- example_grammar: is each SOURCE_LANG sentence grammatical and natural to a native speaker?
- marker_correctness: does the **...** span wrap the actual headword (or a legitimate inflection like conjugation/declension)? Reject if it wraps an unrelated word, marks a particle/article instead of the headword, or omits a marker.
- example_sense_align: does each example sentence demonstrate the meaning shown on its card (not a different sense)?
- translation_quality: is the TARGET_LANG translation accurate, idiomatic, and conveys the same meaning?
- register_match: is the register (vulgar / casual / formal / academic / neutral) preserved between W and its translations + examples? E.g. a vulgar curse word should not be translated as a mild "darn".
- neutrality: (only for political figures, disputed places, contested historical events) — is the example neutral and factual, free of advocacy / opinion / commentary? null if not applicable.

For each issue you find, include a SHORT concrete reason: "marker wraps 'le' (article) instead of headword", "translation 'darn' too mild for vulgar W", "example demonstrates sense B but card shows sense A", "fabricated archaic meaning never used".

Hold a strict bar — most everyday-vocab cards should score 90+. Only flag REAL problems, not stylistic preferences.

Output strict JSON:
{
  "definition_quality": <int|null>,
  "example_grammar": <int|null>,
  "marker_correctness": <int|null>,
  "example_sense_align": <int|null>,
  "translation_quality": <int|null>,
  "register_match": <int|null>,
  "neutrality": <int|null>,
  "overall": <int 0-100>,
  "issues": [<string>, ...]
}`;

const REVERSE_JUDGE_SYSTEM = `You are a strict quality reviewer for a multilingual reverse-lookup feature. A user typed W in their NATIVE_LANG and the system returned candidate words in STUDY_LANG. Your job: judge whether each candidate is a correct/plausible STUDY_LANG translation of W.

Output strict JSON:
{
  "candidates_correct": <int — how many candidates are accurate STUDY_LANG translations of W>,
  "candidates_total": <int — total candidate count>,
  "best_translation": <string — the best STUDY_LANG word for W; if missing from candidates, say so>,
  "overall": <int 0-100>,
  "issues": [<string>, ...]
}`;

async function callJudge(model, system, userMessage) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      temperature: 0.0,
    }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const body = await res.json();
  return JSON.parse(body.choices[0].message.content);
}

function buildForwardUser(rec, full) {
  const lines = [
    `SOURCE_LANG=${LANG_NAME[rec.sourceLang]}`,
    `TARGET_LANG=${LANG_NAME[rec.targetLang]}`,
    `W="${rec.word}"`,
    `category=${rec.category}`,
    `headword=${full.headword}`,
  ];
  if (full.reading) lines.push(`reading=${full.reading}`);
  lines.push('');
  lines.push('Meanings (each card the user sees):');
  full.meanings.forEach((m, i) => {
    lines.push(`  ${i + 1}. [${m.partOfSpeech || '-'}] ${m.definition}`);
  });
  lines.push('');
  lines.push('Examples (each tied to a meaning by meaningIndex):');
  full.examples.forEach((ex, i) => {
    lines.push(`  ${i + 1}. (meaning ${ex.meaningIndex ?? '?'})`);
    lines.push(`     ${ex.sentence}`);
    lines.push(`     → ${ex.translation}`);
  });
  return lines.join('\n');
}

function buildReverseUser(rec) {
  return [
    `STUDY_LANG=${LANG_NAME[rec.studyLang]}`,
    `NATIVE_LANG=${LANG_NAME[rec.inputLang]}`,
    `W="${rec.word}"`,
    `candidates=${(rec.candidates || []).join(' / ') || '(none)'}`,
  ].join('\n');
}

function loadRecords(p) {
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

(async () => {
  let recs = loadRecords(inputPath);
  if (SAMPLE_N) recs = recs.slice(0, parseInt(SAMPLE_N, 10));

  // Skip intentionally-rejected note entries (sentence / non_word /
  // wrong_language) — those return empty meanings BY DESIGN and would skew
  // the judge into flagging system-correct refusals as low quality.
  const forwards = recs.filter((r) =>
    r.type === 'forward' && r.quick?.ok && (r.quick?.meaningsCount ?? 0) > 0,
  );
  const reverses = recs.filter((r) => r.type === 'reverse' && r.ok && (r.candidateCount ?? 0) > 0);
  console.log(`Auditing ${forwards.length} forwards + ${reverses.length} reverses with ${PRIMARY}, concurrency=${CONCURRENCY}`);
  console.log(`Escalate to gpt-4.1 if score < ${ESCALATE_BELOW}`);

  const outPath = path.join(path.dirname(inputPath), `audit-${path.basename(inputPath, '.ndjson')}.ndjson`);
  const out = fs.createWriteStream(outPath, { flags: 'w' });

  let done = 0, escalated = 0;
  const t0 = Date.now();
  const judged = [];

  async function judgeOne(rec) {
    const isReverse = rec.type === 'reverse';
    const system = isReverse ? REVERSE_JUDGE_SYSTEM : JUDGE_SYSTEM;
    let user, full;
    if (isReverse) {
      user = buildReverseUser(rec);
    } else {
      full = await fetchFull(rec.word, rec.sourceLang, rec.targetLang);
      // If DB lookup fails or returns nothing meaningful, the sweep recorded
      // a successful quick result so we expect at least 1 meaning. A miss here
      // means cache drift between sweep run and audit; skip the row rather
      // than score it against incomplete data.
      if (!full || full.meanings.length === 0) {
        return;
      }
      user = buildForwardUser(rec, full);
    }
    let primary, secondary;
    try { primary = await callJudge(PRIMARY, system, user); }
    catch (e) { primary = { overall: -1, issues: ['JUDGE_ERROR:' + e.message] }; }
    if (primary.overall !== undefined && primary.overall < ESCALATE_BELOW && primary.overall !== -1) {
      try { secondary = await callJudge('gpt-4.1', system, user); escalated++; }
      catch (e) { secondary = { overall: -1, issues: ['ESCALATE_ERROR:' + e.message] }; }
    }
    const finalScore = secondary?.overall ?? primary.overall;
    const finalIssues = secondary?.issues ?? primary.issues ?? [];
    const judgedRec = {
      type: rec.type,
      sourceLang: rec.sourceLang, targetLang: rec.targetLang,
      studyLang: rec.studyLang, inputLang: rec.inputLang,
      word: rec.word, category: rec.category,
      headword: full?.headword || rec.quick?.headword,
      meanings: full?.meanings,
      examples: full?.examples,
      primary, secondary,
      finalScore, finalIssues,
      escalated: !!secondary,
    };
    judged.push(judgedRec);
    out.write(JSON.stringify(judgedRec) + '\n');
    done++;
    if (done % 50 === 0 || done === total) {
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const rate = (done / Math.max(0.001, (Date.now() - t0) / 1000)).toFixed(1);
      console.log(`  [${done}/${total}] +${dt}s @ ${rate}/s  escalated=${escalated}`);
    }
  }

  const tasks = [...forwards, ...reverses];
  const total = tasks.length;
  let cursor = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < tasks.length) {
      const idx = cursor++;
      try { await judgeOne(tasks[idx]); } catch (e) { console.warn('  err:', e.message); }
    }
  }));

  out.end();
  await new Promise((r) => out.on('close', r));

  // ── Report generation ──
  function pct(p, arr) {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  }
  const scores = judged.map((j) => j.finalScore).filter((s) => s >= 0);
  const failed = judged.filter((j) => j.finalScore >= 0 && j.finalScore < 70);
  const subPass = judged.filter((j) => j.finalScore >= 70 && j.finalScore < 85);

  // Per category
  const byCat = new Map();
  for (const j of judged) {
    const c = j.category || 'reverse';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(j);
  }

  // Per pair
  const byPair = new Map();
  for (const j of judged.filter((x) => x.type === 'forward')) {
    const k = `${j.sourceLang}→${j.targetLang}`;
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(j);
  }

  // Issue frequency
  const issueCounts = new Map();
  for (const j of judged) {
    for (const iss of j.finalIssues || []) {
      const key = iss.slice(0, 80);
      issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
    }
  }
  const topIssues = [...issueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);

  const lines = [];
  lines.push(`# v4 LLM-as-judge audit report`);
  lines.push('');
  lines.push(`Input: \`${path.basename(inputPath)}\`  ·  Primary judge: ${PRIMARY}  ·  Escalation: gpt-4.1 below ${ESCALATE_BELOW}`);
  lines.push(`Runtime: ${((Date.now() - t0) / 1000).toFixed(1)}s  ·  Escalated: ${escalated}/${judged.length}`);
  lines.push('');
  lines.push('## Overall score distribution');
  lines.push('');
  lines.push(`- n=${scores.length}`);
  lines.push(`- p50=${pct(50, scores)}  p25=${pct(25, scores)}  p10=${pct(10, scores)}  min=${Math.min(...scores)}`);
  lines.push(`- ≥85 (publishable): ${scores.filter((s) => s >= 85).length} (${((scores.filter((s) => s >= 85).length / scores.length) * 100).toFixed(1)}%)`);
  lines.push(`- 70-84 (sub-pass — small issues): ${subPass.length}`);
  lines.push(`- <70 (FAIL): ${failed.length}`);
  lines.push('');
  lines.push('## Per-category quality');
  lines.push('');
  lines.push('| category | n | p50 | p10 | ≥85% | <70 |');
  lines.push('|----------|---:|----:|----:|----:|---:|');
  for (const [cat, items] of [...byCat.entries()].sort()) {
    const sc = items.map((x) => x.finalScore).filter((s) => s >= 0);
    if (sc.length === 0) { lines.push(`| ${cat} | 0 | - | - | - | 0 |`); continue; }
    const fail = sc.filter((s) => s < 70).length;
    const pass = ((sc.filter((s) => s >= 85).length / sc.length) * 100).toFixed(0);
    lines.push(`| ${cat} | ${items.length} | ${pct(50, sc)} | ${pct(10, sc)} | ${pass}% | ${fail} |`);
  }
  lines.push('');
  lines.push('## Per-pair quality (forward only)');
  lines.push('');
  lines.push('| pair | n | p50 | ≥85% | <70 |');
  lines.push('|------|---:|----:|----:|---:|');
  for (const [pair, items] of [...byPair.entries()].sort()) {
    const sc = items.map((x) => x.finalScore).filter((s) => s >= 0);
    if (sc.length === 0) { lines.push(`| ${pair} | 0 | - | - | 0 |`); continue; }
    const fail = sc.filter((s) => s < 70).length;
    const pass = ((sc.filter((s) => s >= 85).length / sc.length) * 100).toFixed(0);
    lines.push(`| ${pair} | ${items.length} | ${pct(50, sc)} | ${pass}% | ${fail} |`);
  }
  lines.push('');
  lines.push('## Top 30 issue patterns');
  lines.push('');
  lines.push('| count | issue |');
  lines.push('|------:|-------|');
  for (const [iss, n] of topIssues) lines.push(`| ${n} | ${iss.replace(/\|/g, '\\|')} |`);
  lines.push('');
  lines.push(`## All failed entries (< 70) — ${failed.length} items`);
  lines.push('');
  if (failed.length > 0) {
    lines.push('| score | pair | word | category | top issue |');
    lines.push('|---:|------|------|----------|-----------|');
    for (const f of failed.sort((a, b) => a.finalScore - b.finalScore)) {
      const pair = f.type === 'forward' ? `${f.sourceLang}→${f.targetLang}` : `rev ${f.studyLang}/${f.inputLang}`;
      lines.push(`| ${f.finalScore} | ${pair} | ${(f.word || '').slice(0, 30)} | ${f.category || 'reverse'} | ${(f.finalIssues?.[0] || '').slice(0, 80).replace(/\|/g, '\\|')} |`);
    }
  } else {
    lines.push('_(none — all entries scored ≥70)_');
  }
  lines.push('');
  lines.push(`## Detail for bottom 30 (sub-pass + fail)`);
  lines.push('');
  const bottom = [...judged].sort((a, b) => a.finalScore - b.finalScore).slice(0, 30);
  for (const j of bottom) {
    const pair = j.type === 'forward' ? `${j.sourceLang}→${j.targetLang}` : `rev ${j.studyLang}/${j.inputLang}`;
    lines.push(`### [${j.finalScore}] ${pair} \`${j.word}\` (${j.category || 'reverse'})${j.escalated ? ' ⚠ escalated' : ''}`);
    lines.push('');
    if (j.headword && j.headword !== j.word) lines.push(`- headword: ${j.headword}`);
    if (j.meanings) for (let i = 0; i < j.meanings.length; i++) lines.push(`- meaning ${i+1}: [${j.meanings[i].partOfSpeech || '-'}] ${j.meanings[i].definition}`);
    if (j.examples) for (let i = 0; i < j.examples.length; i++) { lines.push(`- ex ${i+1}: ${j.examples[i].sentence}`); lines.push(`  → ${j.examples[i].translation}`); }
    if (j.finalIssues?.length) {
      lines.push('- issues:');
      for (const iss of j.finalIssues) lines.push(`  - ${iss}`);
    }
    lines.push('');
  }
  lines.push(`---`);
  lines.push(`Raw audit NDJSON: \`${path.basename(outPath)}\``);

  const reportPath = path.join(path.dirname(inputPath), `audit-${path.basename(inputPath, '.ndjson')}.md`);
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`\n📄 Report: ${reportPath}`);
  console.log(`📝 Raw:    ${outPath}`);
})().catch((e) => { console.error('Fatal:', e); process.exit(1); });
