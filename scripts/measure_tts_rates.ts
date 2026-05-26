/**
 * Measure per-voice mp3 duration for all (language, gender) combos used in
 * production, plus optional alternates for A/B comparison. Compute:
 *   1. Within-language F-vs-M correction factor (current production goal)
 *   2. Effective syllable rate per language (cross-language balance signal)
 *
 * Output is a JSON snapshot + a human-readable table. The new VOICE_CORRECTIONS
 * + suggested LANGUAGE_BASE_RATE block can be pasted into tts-voices.ts after
 * human listening confirms the result feels right.
 *
 * Invocation:
 *   tsx scripts/measure_tts_rates.ts
 *
 * Requires .env.local with EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Uses the production tts-synthesize edge function (which calls Azure), so
 * results match exactly what users hear. Service-role bypasses rate limits.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
// @ts-expect-error — pure JS package, no types
import mp3Duration from 'mp3-duration';

const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Reference sentences — same semantic content per language, written by native
// speakers (not machine-translated). ~10-12 syllables of typical-difficulty
// vocabulary so timing reflects real learning content, not edge cases.
interface Ref {
  lang: string;
  text: string;
  // Linguist-counted syllables/morae/characters that map to natural prosody.
  // For tonal/CJK we count characters (each = one syllable). For others, the
  // sum of vowel-nuclei. These drive the cross-language syllable-rate signal.
  syllables: number;
}
const REFS: Ref[] = [
  { lang: 'en',    text: 'The quick brown fox jumps over the lazy dog and runs to the river.', syllables: 16 },
  { lang: 'ko',    text: '오늘 날씨가 아주 좋아서 공원에서 산책을 하기로 했어요.',                              syllables: 22 },
  { lang: 'ja',    text: '今日は天気がとても良いので公園で散歩することにしました。',                         syllables: 27 },
  { lang: 'zh-CN', text: '今天天气非常好，所以我决定去公园散步。',                                              syllables: 17 },
  { lang: 'zh-TW', text: '今天天氣非常好，所以我決定去公園散步。',                                              syllables: 17 },
  { lang: 'es',    text: 'Hoy hace muy buen tiempo, así que decidí dar un paseo por el parque.', syllables: 22 },
  { lang: 'fr',    text: 'Il fait très beau aujourd hui, alors je vais me promener dans le parc.', syllables: 20 },
  { lang: 'de',    text: 'Heute ist das Wetter sehr schön, also gehe ich im Park spazieren.', syllables: 19 },
  { lang: 'it',    text: 'Oggi il tempo è molto bello, quindi vado a fare una passeggiata nel parco.', syllables: 25 },
  { lang: 'pt',    text: 'Hoje o tempo está muito bom, então vou dar uma caminhada no parque.', syllables: 22 },
  { lang: 'ru',    text: 'Сегодня очень хорошая погода, поэтому я решил прогуляться по парку.', syllables: 22 },
];

// Voices to measure. Includes current production mapping + optional alternates
// for A/B. zh-CN alternates target clearer tones for language learners.
interface VoiceTest {
  lang: string;
  gender: 'F' | 'M';
  voice: string;
  label: string;  // 'prod' or 'alt-clearer' etc.
}
const VOICES: VoiceTest[] = [
  // Current production voices
  { lang: 'en',    gender: 'F', voice: 'en-US-JennyNeural',     label: 'prod' },
  { lang: 'en',    gender: 'M', voice: 'en-US-AndrewNeural',    label: 'prod' },
  { lang: 'ko',    gender: 'F', voice: 'ko-KR-JiMinNeural',     label: 'prod' },
  { lang: 'ko',    gender: 'M', voice: 'ko-KR-HyunsuNeural',    label: 'prod' },
  { lang: 'ja',    gender: 'F', voice: 'ja-JP-MayuNeural',      label: 'prod' },
  { lang: 'ja',    gender: 'M', voice: 'ja-JP-DaichiNeural',    label: 'prod' },
  { lang: 'zh-CN', gender: 'F', voice: 'zh-CN-XiaoxiaoNeural',  label: 'prod' },
  { lang: 'zh-CN', gender: 'M', voice: 'zh-CN-YunyangNeural',   label: 'prod' },
  { lang: 'zh-TW', gender: 'F', voice: 'zh-TW-HsiaoChenNeural', label: 'prod' },
  { lang: 'zh-TW', gender: 'M', voice: 'zh-TW-YunJheNeural',    label: 'prod' },
  { lang: 'es',    gender: 'F', voice: 'es-ES-AbrilNeural',     label: 'prod' },
  { lang: 'es',    gender: 'M', voice: 'es-ES-NilNeural',       label: 'prod' },
  { lang: 'fr',    gender: 'F', voice: 'fr-FR-CelesteNeural',   label: 'prod' },
  { lang: 'fr',    gender: 'M', voice: 'fr-FR-YvesNeural',      label: 'prod' },
  { lang: 'de',    gender: 'F', voice: 'de-DE-TanjaNeural',     label: 'prod' },
  { lang: 'de',    gender: 'M', voice: 'de-DE-KlausNeural',     label: 'prod' },
  { lang: 'it',    gender: 'F', voice: 'it-IT-PalmiraNeural',   label: 'prod' },
  { lang: 'it',    gender: 'M', voice: 'it-IT-GianniNeural',    label: 'prod' },
  { lang: 'pt',    gender: 'F', voice: 'pt-BR-LeilaNeural',     label: 'prod' },
  { lang: 'pt',    gender: 'M', voice: 'pt-BR-JulioNeural',     label: 'prod' },
  { lang: 'ru',    gender: 'F', voice: 'ru-RU-SvetlanaNeural',  label: 'prod' },
  { lang: 'ru',    gender: 'M', voice: 'ru-RU-DmitryNeural',    label: 'prod' },
  // Chinese alternates — clearer tones for language learners
  { lang: 'zh-CN', gender: 'F', voice: 'zh-CN-XiaoyiNeural',    label: 'alt-clearer-F' },
  { lang: 'zh-CN', gender: 'M', voice: 'zh-CN-YunxiNeural',     label: 'alt-clearer-M' },
];

interface Measured {
  lang: string;
  gender: 'F' | 'M';
  voice: string;
  label: string;
  text: string;
  syllables: number;
  durationSec: number;
  syllablesPerSec: number;
}

async function measureOne(test: VoiceTest, ref: Ref): Promise<Measured> {
  const { data, error } = await supabase.functions.invoke('tts-synthesize', {
    body: {
      text: ref.text,
      language: test.lang,
      gender: test.gender,
      voice: test.voice,
    },
  });
  if (error) throw new Error(`invoke ${test.voice}: ${error.message}`);
  const url = (data as { url?: string }).url;
  if (!url) throw new Error(`no url for ${test.voice}`);

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch mp3 ${test.voice}: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());

  const durationSec: number = await new Promise((res, rej) => {
    mp3Duration(buf, (err: Error | null, dur: number) => err ? rej(err) : res(dur));
  });
  const syllablesPerSec = ref.syllables / durationSec;
  return {
    lang: test.lang,
    gender: test.gender,
    voice: test.voice,
    label: test.label,
    text: ref.text,
    syllables: ref.syllables,
    durationSec,
    syllablesPerSec,
  };
}

async function main() {
  console.log(`Measuring ${VOICES.length} voices…`);
  const results: Measured[] = [];
  for (const v of VOICES) {
    const ref = REFS.find((r) => r.lang === v.lang);
    if (!ref) {
      console.warn(`  no ref for ${v.lang} — skipping ${v.voice}`);
      continue;
    }
    process.stdout.write(`  ${v.voice} (${v.label})… `);
    try {
      const m = await measureOne(v, ref);
      results.push(m);
      console.log(`${m.durationSec.toFixed(3)}s  (${m.syllablesPerSec.toFixed(2)} syll/s)`);
    } catch (e) {
      console.log(`FAIL ${(e as Error).message}`);
    }
  }

  // ── Within-language corrections (F vs M same speed) ──
  console.log('\n── Within-language F/M correction factors ──');
  console.log('voice                          dur     syll/s   correction');
  const prodResults = results.filter((r) => r.label === 'prod');
  const corrections: Record<string, number> = {};
  const byLang = new Map<string, Measured[]>();
  for (const r of prodResults) {
    if (!byLang.has(r.lang)) byLang.set(r.lang, []);
    byLang.get(r.lang)!.push(r);
  }
  for (const [lang, voices] of byLang.entries()) {
    if (voices.length !== 2) continue;
    const ref = (voices[0].durationSec + voices[1].durationSec) / 2;
    for (const v of voices) {
      corrections[v.voice] = ref / v.durationSec;
      console.log(
        `  ${v.voice.padEnd(30)} ${v.durationSec.toFixed(3)}s  ${v.syllablesPerSec.toFixed(2).padStart(5)}    ${corrections[v.voice].toFixed(3)}`,
      );
    }
  }

  // ── Cross-language syllable-rate analysis ──
  console.log('\n── Cross-language syllable rate (avg of F+M at correction=1) ──');
  console.log('language   avg syll/s   target syll/s   suggested LANG_BASE');
  // Target: comfortable learning pace per language family.
  // Bases drawn from psycholinguistic literature on L2 listening comfort.
  const LEARNING_TARGET_SYLL_S: Record<string, number> = {
    en: 5.0, es: 5.5, fr: 5.0, de: 4.8, it: 5.2, pt: 5.3, ru: 5.0,
    ko: 5.5, ja: 6.5, 'zh-CN': 4.5, 'zh-TW': 4.5,
  };
  const langBase: Record<string, number> = {};
  for (const [lang, voices] of byLang.entries()) {
    if (voices.length !== 2) continue;
    const avgSps = (voices[0].syllablesPerSec + voices[1].syllablesPerSec) / 2;
    const target = LEARNING_TARGET_SYLL_S[lang] ?? avgSps;
    const base = target / avgSps;
    langBase[lang] = base;
    console.log(
      `  ${lang.padEnd(8)} ${avgSps.toFixed(2).padStart(9)}    ${target.toFixed(2).padStart(9)}       ${base.toFixed(3)}`,
    );
  }

  // ── Chinese alt voices comparison ──
  console.log('\n── Chinese voice A/B (Xiaoxiao+Yunyang vs Xiaoyi+Yunxi) ──');
  const zhResults = results.filter((r) => r.lang === 'zh-CN');
  for (const r of zhResults) {
    console.log(
      `  ${r.voice.padEnd(28)} ${r.label.padEnd(16)} ${r.durationSec.toFixed(3)}s  ${r.syllablesPerSec.toFixed(2)} syll/s`,
    );
  }

  // ── Snapshot file ──
  const snapshot = {
    timestamp: new Date().toISOString(),
    results,
    corrections,
    langBase,
  };
  const outPath = 'scripts/measure_tts_rates.snapshot.json';
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\n✓ snapshot written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
