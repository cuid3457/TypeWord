// Backfill TOPIK 2급 word list with stricter anti-fabrication prompt.
// Reads /tmp/topik2-words-filtered.json + 1급 exclusion → generates remainder.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function fetchTopik1() {
  const slugs = ['topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3'];
  const set = new Set();
  for (const slug of slugs) {
    const { data: list } = await admin
      .from('curated_wordlists').select('id').eq('slug', slug).maybeSingle();
    if (!list) continue;
    const { data } = await admin
      .from('curated_words').select('word').eq('curated_wordlist_id', list.id);
    for (const r of (data || [])) set.add(String(r.word).trim());
  }
  return set;
}

const SYS = `You are a Korean lexicographer specializing in TOPIK 2급 (한국어능력시험 I 레벨 2) vocabulary, working from NIKL 국제 통용 한국어 표준 교육과정 (2017) and 세종학당 통합한국어 2A/2B reference materials.

Produce real Korean vocabulary at TOPIK 2급 difficulty (CEFR A2), excluded from the provided exclusion lists.

ABSOLUTE RULES — EACH WORD MUST:
1. Be a dictionary-attested standard Korean word (검색 시 표준국어대사전 또는 우리말샘에 표제어로 등재되어 있어야 함).
2. Be in canonical dictionary form (verb/adjective: -다 form; noun: bare).
3. Not be formed by mechanically attaching a generic suffix (장소/계획/약속/행사/사진/모임/시간/일정/축사/연설/공연 등) to a stem just to fill the list.
4. Not be a chain of repeating morphemes (no recursive concatenation).
5. Not be a spaced phrase written without spaces (e.g. "졸업 이후" → not "졸업이후").
6. Be useful for an A2-level learner — not so basic it overlaps with 1급, not so abstract it belongs in 3급+.

CRITICAL: If you find yourself producing 3+ words that share the same stem with different generic suffixes, STOP and pick different stems. Variety of distinct lexical roots is more important than category balance.

CRITICAL: Each word must pass the test "would this word be a separate entry in 표준국어대사전?". If it's compositional (분석 가능한 합성어) and would be written as two words with a space, do NOT include it.`;

const TOPICS = `Cover these areas with rough balance:
- 직장·학교 활동 (회의, 보고서, 발표, 출근, 졸업, 학기, etc.)
- 감정·상태 (행복하다, 슬프다, 화나다, 외롭다, 등)
- 여행·교통 (여행, 예약, 출발, 도착, 환승, 등)
- 쇼핑·서비스 (가격, 할인, 영수증, 환불, 배달, 등)
- 건강·신체 (병, 감기, 두통, 약, 다치다, 등)
- 요리·식당 (음료, 디저트, 굽다, 끓이다, 볶다, 등)
- 사회 관계 (동료, 이웃, 친척, 결혼, 약속, 등)
- 시간·계획·일정 (계획, 일찍, 늦게, 평소, 가끔, 등)
- 연결 표현·기본 한자어 (그래서, 그러나, 만약, 결과, 이유, 차이, 등)`;

async function gen(exclude, n, attempt) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.5,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: `${TOPICS}\n\n[EXCLUSION LIST — ${exclude.length} words to never reuse]:\n${exclude.join(', ')}\n\nAttempt ${attempt}: Produce exactly ${n} NEW Korean words at TOPIK 2급 difficulty, all passing the dictionary-attestation test.\n\nOutput JSON: {"words": [...]}` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content).words || [];
}

(async () => {
  const filtered = JSON.parse(fs.readFileSync('/tmp/topik2-words-filtered.json', 'utf8')).words;
  const topik1 = await fetchTopik1();
  const have = new Set([...filtered, ...topik1]);
  console.log(`Have: ${filtered.length} good 2급 + ${topik1.size} 1급. Need: ${900 - filtered.length} more.`);

  const target = 900 - filtered.length;
  const out = [];
  const newSeen = new Set();
  let attempts = 0;

  while (out.length < target && attempts < 8) {
    attempts++;
    const need = target - out.length;
    const reqN = Math.max(need * 3, 60);
    const exclude = [...have, ...newSeen];
    console.log(`attempt ${attempts}: have ${out.length}/${target}, requesting ${reqN}`);
    const batch = await gen(exclude, reqN, attempts);
    let added = 0;
    for (const raw of batch) {
      const w = String(raw).trim();
      if (!w || !/\p{Script=Hangul}/u.test(w)) continue;
      if (have.has(w) || newSeen.has(w)) continue;
      // Reject obvious fab: any X+장소/계획/약속/행사/참석자/참석명단/행진곡/케이크/파티 where X is in have
      let fab = false;
      for (let i = 2; i <= w.length - 1 && !fab; i++) {
        const px = w.slice(0, i), sx = w.slice(i);
        if ((have.has(px) || newSeen.has(px)) && ['장소','계획','약속','행사','참석자','참석명단','행진곡','케이크','파티','음악','노래','초대장','준비물','사진촬영','동영상','기록','연주','공연','축사','연설','의상','이후','앨범사진'].includes(sx)) fab = true;
      }
      if (fab) continue;
      if (w.startsWith('졸업식') && w !== '졸업식' && w !== '졸업식장') continue;
      if (w.startsWith('끝장') && w !== '끝장' && w !== '끝장나다' && w !== '끝장내다' && w !== '끝장내기') continue;
      newSeen.add(w);
      out.push(w);
      added++;
      if (out.length >= target) break;
    }
    console.log(`  +${added} → ${out.length}`);
    if (added === 0) break;
  }

  // Final combined list: filtered + backfill
  const final = [...filtered, ...out];
  fs.writeFileSync('/tmp/topik2-words-final.json', JSON.stringify({ words: final }, null, 2));
  console.log(`\n✓ Total: ${final.length} words → /tmp/topik2-words-final.json`);
  console.log(`Backfill samples:`, out.slice(0, 30).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
