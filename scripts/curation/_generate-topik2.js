// Generate ~900 NEW Korean words at TOPIK 2급 difficulty.
// Excludes all TOPIK 1급 words (DB + JSON) so 2급 adds genuinely new vocabulary.
//
// Output: /tmp/topik2-words.json — 900 deduped Korean words ordered by category
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY missing');

const { createClient } = require('@supabase/supabase-js');
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const norm = (w) => String(w).trim();

async function fetchExisting() {
  const slugs = ['topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3'];
  const set = new Set();
  for (const slug of slugs) {
    const { data: list } = await admin
      .from('curated_wordlists').select('id').eq('slug', slug).maybeSingle();
    if (list) {
      const { data } = await admin
        .from('curated_words').select('word').eq('curated_wordlist_id', list.id);
      for (const r of (data || [])) set.add(norm(r.word));
    }
    // Also pull from the source JSON in case DB and file diverge
    try {
      const j = JSON.parse(fs.readFileSync(path.resolve(__dirname, `data/${slug}.json`), 'utf8'));
      for (const w of (j.words || [])) set.add(norm(typeof w === 'string' ? w : w.word));
    } catch {}
  }
  return set;
}

const SYS = `You are a Korean lexicographer specializing in TOPIK (한국어능력시험) preparation, working from the NIKL 국제 통용 한국어 표준 교육과정 (2017) and 세종학당 통합한국어 2A/2B vocabulary scope.

Produce NEW Korean words at TOPIK 2급 difficulty (TOPIK I level 2 — beginner-upper, roughly CEFR A2). These are words a learner masters AFTER 1급 basic survival vocabulary, EXCLUDED from the provided 1급 exclusion list.

STRICT RULES:
1. **Canonical form only**:
   - Verbs: -다 dictionary form (가다, 만나다, 시작하다) — NEVER conjugated (갑니다, 만났다)
   - Adjectives: -다 form (좋다, 예쁘다)
   - Nouns: bare form, no particles (학교, 친구) — NEVER with 을/를/이/가/은/는/의
   - Adverbs: bare form (빨리, 자주)
2. **Single lexical unit per entry**: one word OR a short fixed expression (안녕히 가세요, 잘 부탁드립니다). NO sentences, NO grammar particles alone.
3. **No conjugated/inflected forms** of words already in 1급. E.g. if 1급 has 먹다, don't add 먹었다 / 먹습니다.
4. **No proper nouns** (no place names, brand names, person names — except 한국/미국/일본/중국 already in 1급).
5. **No 사동/피동 derivatives** of 1급 verbs unless they're truly a distinct learner item (e.g. 시키다 from 하다 is OK; but 보이다 from 보다 only if widely separately taught at 2급).
6. **TOPIK 2급 difficulty band**: avoid trivial 1급 territory (안녕/먹다/좋다 등 already there), avoid 3급+ abstract or 한자어 heavy vocabulary (개념/이론/체계 등). Target: real beginner-upper words used in daily/school/work contexts at the A2 level.
7. **Real Korean usage**: dictionary-attested, naturally used in everyday spoken/written Korean. Not artificial or rare.
8. **No vulgarities, slang, or sensitive words.**
9. **Distribute across the 9 categories below** — don't concentrate in one area.`;

const CATEGORIES = `9 categories to cover (~100-130 words each):

1. **직장·학교 활동**: 회의, 보고서, 발표, 출근, 퇴근, 점심시간, 휴가, 회식, 입학, 졸업, 시험, 점수, 합격, 과제, 학년, 학기, 전공, 동아리, etc.

2. **감정·상태**: 행복하다, 슬프다, 화나다, 놀라다, 무섭다, 걱정하다, 안심하다, 답답하다, 외롭다, 부끄럽다, 자랑스럽다, 미안하다, 고맙다 (감사 외), 지루하다, 신나다, etc.

3. **여행·교통**: 여행, 예약, 호텔, 짐, 가방 (1급 제외), 출발, 도착, 환승, 길, 지도, 안내, 표, 좌석, 출구, 입구, 도로, 신호등, 횡단보도, 사고, 막히다, etc.

4. **쇼핑·서비스**: 가격, 할인, 세일, 영수증, 카드, 현금, 잔돈, 거스름돈, 교환, 환불, 포장, 배달, 택배, 주문, 손님, 점원, 계산하다, 고르다, etc.

5. **건강·신체**: 병, 감기, 열, 기침, 두통, 배탈, 약, 약국, 의사 (1급 제외), 진료, 검사, 입원, 퇴원, 건강하다, 아프다, 다치다, 운동 (1급 제외), 살, 몸무게, 키 (height), etc.

6. **요리·식당**: 메뉴 (1급 제외), 음식 (1급 제외), 음료, 후식, 디저트, 맛, 단맛, 쓴맛, 짠맛, 매운맛, 향, 굽다, 끓이다, 볶다, 찌다, 자르다, 섞다, 식다, 식히다, 시키다, 추천, 예약 (3번과 중복 가능), etc.

7. **사회 관계·일상**: 친구 (1급 제외), 동료, 이웃, 가족 (1급 제외), 친척, 부모, 부부, 결혼, 약속, 만남, 소개, 인사, 초대, 도와주다, 부탁하다, 약속하다, 거절하다, etc.

8. **시간·계획·일정**: 일정, 계획, 약속, 미래, 과거, 일찍, 늦게, 지각, 갑자기, 잠깐, 잠시, 평소, 보통, 가끔, 매번, 매일 (1급 제외), 평일, 휴일, 공휴일, 등, etc.

9. **연결 표현·접속·정도·기본 한자어 명사**: 그래서, 그런데, 하지만, 그리고 (1급 제외), 그러나, 그러면, 그러므로, 또한, 만약, 만일, 비록, 만큼, 정도, 거의, 약, 대략, 시작 (1급 제외), 끝, 문제, 해결, 방법, 결과, 이유, 차이, 종류, 부분 etc.`;

async function gen(exclude, n, attempt) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.7,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: `${CATEGORIES}\n\n[1급 EXCLUSION LIST — ${exclude.length} words, never reuse, case-sensitive Korean]:\n${exclude.join(', ')}\n\nProduce ${n} new TOPIK 2급 Korean words distributed across the 9 categories above.\n\nOutput JSON: {"words": ["...", "...", ...]} — exactly ${n} entries in dictionary canonical form. Attempt ${attempt} — produce DIFFERENT words from prior attempts (use exclusion list to ensure novelty).` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content).words || [];
}

(async () => {
  const target = 900;
  const baseExclude = [...await fetchExisting()];
  console.log(`Base exclusion (1급): ${baseExclude.length} unique words`);

  const seen = new Set();
  const out = [];
  let attempts = 0;
  const maxAttempts = 12;

  while (out.length < target && attempts < maxAttempts) {
    attempts++;
    const need = target - out.length;
    const reqN = Math.max(Math.min(need * 2, 400), 100);
    const exclude = [...baseExclude, ...Array.from(seen)];
    console.log(`attempt ${attempts}: have ${out.length}/${target}, requesting ${reqN}, excluding ${exclude.length}`);
    const batch = await gen(exclude, reqN, attempts);
    const exSet = new Set(exclude);
    let added = 0;
    for (const w of batch) {
      const k = norm(w);
      if (!k || seen.has(k) || exSet.has(k)) continue;
      // Sanity: must contain at least 1 Hangul char
      if (!/\p{Script=Hangul}/u.test(k)) continue;
      seen.add(k);
      out.push(k);
      added++;
      if (out.length >= target) break;
    }
    console.log(`  +${added} → ${out.length}`);
    if (added === 0) break;
  }

  fs.writeFileSync('/tmp/topik2-words.json', JSON.stringify({ words: out }, null, 2));
  console.log(`\n✓ Saved ${out.length} words to /tmp/topik2-words.json`);
  console.log('First 30:', out.slice(0, 30).join(', '));
  console.log('Last 10:', out.slice(-10).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
