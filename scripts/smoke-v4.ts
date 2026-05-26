/**
 * Smoke test for word-lookup-v4 (dict-first) after 2026-05-25 overhaul.
 *
 * 8 source langs × 5 words = 40 cases.
 * Validates: meanings non-empty, examples have marker + translation + source tag.
 *
 * Run:
 *   cd TypeWord && npx --yes tsx scripts/smoke-v4.ts [--target=en] [--source=ko]
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * Default target lang: en (for non-en sources) / ko (for en source).
 * Override with --target=...
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(): Record<string, string> {
  const envPath = join(process.cwd(), '.env.local');
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {/* */}
  return out;
}
const env = loadEnv();
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
}
const SOURCE_FILTER = arg('source');
const TARGET_OVERRIDE = arg('target');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// 8 source langs × 5 words. Mix: noun, verb, adjective, adverb, common phrase.
const CASES: Array<{ source: string; word: string }> = [
  // ko
  { source: 'ko', word: '사과' },
  { source: 'ko', word: '학교' },
  { source: 'ko', word: '가다' },
  { source: 'ko', word: '예쁘다' },
  { source: 'ko', word: '빨리' },
  // ja
  { source: 'ja', word: '食べる' },
  { source: 'ja', word: '学校' },
  { source: 'ja', word: '美しい' },
  { source: 'ja', word: '速い' },
  { source: 'ja', word: '本' },
  // zh-CN
  { source: 'zh-CN', word: '苹果' },
  { source: 'zh-CN', word: '学校' },
  { source: 'zh-CN', word: '吃' },
  { source: 'zh-CN', word: '美丽' },
  { source: 'zh-CN', word: '快' },
  // en
  { source: 'en', word: 'apple' },
  { source: 'en', word: 'school' },
  { source: 'en', word: 'eat' },
  { source: 'en', word: 'beautiful' },
  { source: 'en', word: 'quickly' },
  // es
  { source: 'es', word: 'manzana' },
  { source: 'es', word: 'escuela' },
  { source: 'es', word: 'comer' },
  { source: 'es', word: 'hermoso' },
  { source: 'es', word: 'rápido' },
  // fr
  { source: 'fr', word: 'pomme' },
  { source: 'fr', word: 'école' },
  { source: 'fr', word: 'manger' },
  { source: 'fr', word: 'beau' },
  { source: 'fr', word: 'vite' },
  // de
  { source: 'de', word: 'Apfel' },
  { source: 'de', word: 'Schule' },
  { source: 'de', word: 'essen' },
  { source: 'de', word: 'schön' },
  { source: 'de', word: 'schnell' },
  // it
  { source: 'it', word: 'mela' },
  { source: 'it', word: 'scuola' },
  { source: 'it', word: 'mangiare' },
  { source: 'it', word: 'bello' },
  { source: 'it', word: 'velocemente' },
];

function defaultTarget(source: string): string {
  return source === 'en' ? 'ko' : 'en';
}

interface Issue {
  code: string;
  detail?: string;
}

function validateResult(r: any): Issue[] {
  const issues: Issue[] = [];
  if (!r) {
    issues.push({ code: 'no_result' });
    return issues;
  }
  if (!Array.isArray(r.meanings) || r.meanings.length === 0) {
    issues.push({ code: 'no_meanings', detail: r.note ?? '' });
  }
  if (!Array.isArray(r.examples) || r.examples.length === 0) {
    issues.push({ code: 'no_examples' });
  } else {
    for (let i = 0; i < r.examples.length; i++) {
      const ex = r.examples[i];
      if (!ex.sentence) issues.push({ code: 'example_no_sentence', detail: `idx=${i}` });
      if (!ex.translation) issues.push({ code: 'example_no_translation', detail: `idx=${i}` });
      const markerCount = (ex.sentence?.match(/\*\*/g) ?? []).length;
      if (markerCount !== 2) issues.push({ code: 'example_marker_count', detail: `idx=${i} count=${markerCount}` });
      if (!ex.source) issues.push({ code: 'example_no_source_tag', detail: `idx=${i}` });
    }
  }
  return issues;
}

async function runOne(source: string, target: string, word: string): Promise<{
  ok: boolean;
  issues: Issue[];
  durationMs: number;
  meaningsCount: number;
  examplesCount: number;
  note?: string;
}> {
  const start = Date.now();
  const { data, error } = await admin.functions.invoke<{ result: any; cached: boolean }>(
    'word-lookup-v4',
    { body: { word, sourceLang: source, targetLang: target } },
  );
  const durationMs = Date.now() - start;
  if (error) {
    return {
      ok: false,
      issues: [{ code: 'http_error', detail: error.message }],
      durationMs,
      meaningsCount: 0,
      examplesCount: 0,
    };
  }
  const r = data?.result;
  const issues = validateResult(r);
  return {
    ok: issues.length === 0,
    issues,
    durationMs,
    meaningsCount: r?.meanings?.length ?? 0,
    examplesCount: r?.examples?.length ?? 0,
    note: r?.note,
  };
}

(async () => {
  const cases = CASES.filter((c) => !SOURCE_FILTER || c.source === SOURCE_FILTER);
  console.log(`Running ${cases.length} cases against word-lookup-v4...\n`);

  let pass = 0;
  let fail = 0;
  const fails: Array<{ source: string; word: string; target: string; issues: Issue[] }> = [];

  for (const { source, word } of cases) {
    const target = TARGET_OVERRIDE ?? defaultTarget(source);
    const res = await runOne(source, target, word);
    const status = res.ok ? 'OK  ' : 'FAIL';
    const tag = res.note ? ` (note=${res.note})` : '';
    console.log(
      `[${status}] ${source}→${target}  ${word.padEnd(12)}  m=${res.meaningsCount} e=${res.examplesCount} ${res.durationMs}ms${tag}`,
    );
    if (res.ok) {
      pass++;
    } else {
      fail++;
      fails.push({ source, word, target, issues: res.issues });
      for (const i of res.issues) {
        console.log(`         ↳ ${i.code}${i.detail ? ' ' + i.detail : ''}`);
      }
    }
  }

  console.log(`\nSummary: ${pass} pass, ${fail} fail (${cases.length} total)\n`);
  if (fails.length > 0) {
    console.log('Failures:');
    for (const f of fails) {
      console.log(`  ${f.source}→${f.target} "${f.word}": ${f.issues.map((i) => i.code).join(', ')}`);
    }
    process.exit(1);
  }
})();
