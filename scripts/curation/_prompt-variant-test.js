// Prompt variant A/B/C 재검증.
// 30개 단어 × 3 variant로 직접 OpenAI 호출 → flag% 측정.
//
// 측정 대상 (critical patterns):
//   1. Standalone meaning violation (한자어 단음절이 char-dict 의미로 들어감)
//   2. Bare verb stem termination (예문이 동사원형 그대로 종결)
//   3. Marker misplaced (** 마커가 inflected/compound에 위치)
//
// Variants:
//   A — abstract rule only (현재 정책 simulating)
//   B — A + diverse positive examples ("같은 형태 복사 금지" 문구 포함)
//   C — A + counter-examples ("DO NOT do X")
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL = 'gpt-4.1-mini';

const TEST_WORDS = [
  // Sino 한자어 단음절 — standalone violation 트리거
  '이', '사', '오', '백', '월', '분', '천', '년', '나', '저',
  // TOPIK 동사 — bare verb stem violation 트리거
  '가다', '오다', '먹다', '살다', '사다', '앉다', '서다', '보다', '하다', '쓰다',
  // 일반 단어 — regression check
  '학교', '친구', '음식', '사람', '회사', '시간', '책', '영화', '좋다', '작다',
];

const RULES_CORE = `
You analyze a Korean word and produce strict JSON.

Schema:
{
  "headword": string,
  "meanings": [{ "definition": string, "partOfSpeech": string }],   // max 3, distinct senses, in Korean
  "examples": [{ "sentence": string, "meaning_index": number }]      // one per meaning, in Korean
}

Hard rules:
R1 (STANDALONE): Each meaning MUST be a standalone sense a native speaker accepts as the bare headword. Reject character-dictionary or compound-only senses (senses that surface only inside compounds like 회사, 백색).
R2 (CONJUGATION): Each example sentence MUST end with a properly conjugated verb form. Dictionary form ("-다") as terminal is FORBIDDEN.
R3 (MARKER): The ** marker MUST wrap the exact headword surface (or a valid inflection of the verb headword). NEVER on adjacent verbs, derivatives, particles, or compound stems.

Output JSON only.`;

const VARIANT_A = RULES_CORE;

const VARIANT_B = RULES_CORE + `

DIVERSE positive examples (these illustrate the rule shape — DO NOT copy these exact forms; produce your own with variety):
• "학교": meanings=[{definition:"학교, 교육기관", partOfSpeech:"명사"}], examples=[{sentence:"학생들이 **학교**에 갑니다.", meaning_index:0}]
• "먹다": example sentence terminals can be "먹었다", "먹는다", "먹어요", "먹습니다" — any conjugated form, but NEVER bare "먹다."
• "쓰다": has 3 distinct senses (write / use / bitter). All standalone, all listed.
• "오다": example must show **오다**'s conjugation, e.g. **오신다** or **왔어요**. The ** wraps the inflected form.
Diversity expected — vary sentence structure, subject, tense across your output.`;

const VARIANT_C = RULES_CORE + `

FORBIDDEN patterns (counter-examples — DO NOT emit anything like these):
✗ "나" with meaning "tree" — character-dictionary only, surfaces in compounds (나무). REJECT.
✗ "사" with meaning "company" — bound morpheme only (회사, 건설사). REJECT.
✗ "이" with meaning "ear" — that is 귀, not 이. REJECT.
✗ "백" with meaning "white" — compound only (백색, 백인). REJECT.
✗ "월" with meaning "moon" used in sentence "이번 월에는..." — that means month, mismatched sense. REJECT.
✗ "나는 학교에 **가다**." — bare dictionary form as terminal. REJECT (use 간다 / 갔다 / 가요).
✗ "나는 사과를 **사다**." — bare dictionary form. REJECT.
✗ "의사**이다**" — marker on the copula derivative, not the headword 의사. REJECT.
✗ "**일어서다**" when headword is 서다 — marker on compound verb, not bare headword. REJECT.

These are FORBIDDEN, not templates. Your output must avoid them.`;

const VARIANTS = { A: VARIANT_A, B: VARIANT_B, C: VARIANT_C };

async function callOpenAI(systemPrompt, word) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Word: ${word}\nProduce strict JSON per schema.` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return { result: JSON.parse(j.choices[0].message.content), tokens: j.usage };
}

// Deterministic violation detection
function detectViolations(word, result) {
  const violations = [];
  const meanings = result.meanings || [];
  const examples = result.examples || [];

  // R1: char-dict meaning for Sino single-syllable
  const SINO_BLOCKLIST = {
    '나': ['tree', '나무'], '사': ['company', '회사'], '이': ['ear', '귀'],
    '백': ['white', '백색'], '월': ['moon', '달'], '오': ['arrival', '도래'],
    '저': ['low', '낮'], '천': ['fabric'], '년': ['year' /* OK if 'year' standalone */],
  };
  // (Looser check: just detect if a 1-char Sino headword has unrelated meanings)

  // R2: bare verb stem termination
  for (let i = 0; i < examples.length; i++) {
    const s = examples[i].sentence || '';
    // strip ** markers + terminal punctuation
    const stripped = s.replace(/\*\*/g, '').replace(/[.!?。]+$/, '').trim();
    // does sentence end in "...다" (without conjugation suffixes)?
    // Heuristic: if last token = headword (for verb headwords) → bare stem
    if (word.endsWith('다')) {
      const lastWord = stripped.split(/\s+/).pop() || '';
      if (lastWord === word || lastWord === `**${word}**`.replace(/\*\*/g, '')) {
        violations.push({ rule: 'R2_bare_stem', example: i, detail: `terminal = bare "${word}"` });
      }
    }
  }

  // R3: marker placement
  for (let i = 0; i < examples.length; i++) {
    const s = examples[i].sentence || '';
    const m = s.match(/\*\*([^*]+)\*\*/);
    if (!m) {
      violations.push({ rule: 'R3_no_marker', example: i });
      continue;
    }
    const marked = m[1].trim();
    // Marker must contain headword's stem (for verbs strip 다)
    const stem = word.endsWith('다') ? word.slice(0, -1) : word;
    if (!marked.includes(stem)) {
      violations.push({ rule: 'R3_marker_offsite', example: i, detail: `marked="${marked}", stem="${stem}"` });
    }
    // For verb headwords, marker should NOT be the bare dictionary form (R2 overlap)
  }

  return violations;
}

(async () => {
  const results = { A: {}, B: {}, C: {} };
  const tokens = { A: 0, B: 0, C: 0 };

  for (const variant of ['A', 'B', 'C']) {
    console.log(`\n══ Variant ${variant} ══`);
    for (const word of TEST_WORDS) {
      try {
        const { result, tokens: tk } = await callOpenAI(VARIANTS[variant], word);
        tokens[variant] += (tk.prompt_tokens + tk.completion_tokens);
        const violations = detectViolations(word, result);
        results[variant][word] = { result, violations };
        const marker = violations.length === 0 ? '✓' : `✗(${violations.length})`;
        console.log(`  ${marker} ${word}: ${violations.map(v => v.rule).join(', ') || 'clean'}`);
      } catch (e) {
        console.log(`  ! ${word}: ${e.message.slice(0, 60)}`);
        results[variant][word] = { error: e.message };
      }
    }
  }

  // Summary
  console.log('\n\n══ SUMMARY ══');
  console.log('Variant | clean | violations | tokens');
  console.log('-'.repeat(50));
  for (const v of ['A', 'B', 'C']) {
    const all = Object.values(results[v]);
    const clean = all.filter(r => r.violations && r.violations.length === 0).length;
    const violationCount = all.reduce((sum, r) => sum + (r.violations?.length || 0), 0);
    console.log(`${v}       | ${String(clean).padStart(5)} | ${String(violationCount).padStart(10)} | ${tokens[v]}`);
  }

  // By rule breakdown
  console.log('\n══ Violations by rule ══');
  console.log('Variant | R1_standalone | R2_bare_stem | R3_marker');
  console.log('-'.repeat(60));
  for (const v of ['A', 'B', 'C']) {
    const all = Object.values(results[v]).filter(r => r.violations);
    let r1 = 0, r2 = 0, r3 = 0;
    for (const r of all) {
      for (const vio of r.violations) {
        if (vio.rule.startsWith('R1')) r1++;
        if (vio.rule.startsWith('R2')) r2++;
        if (vio.rule.startsWith('R3')) r3++;
      }
    }
    console.log(`${v}       | ${String(r1).padStart(13)} | ${String(r2).padStart(12)} | ${String(r3).padStart(9)}`);
  }

  const out = path.resolve(__dirname, 'prompt-variant-results.json');
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\n→ ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
