#!/usr/bin/env python3
"""End-to-end prototype: 한 단어를 dict-first 파이프라인 전체에 통과시켜
학습자에게 노출될 최종 카드 형태로 출력.

흐름:
  Input "이"
    ↓ krdict search (en/ja/zh 3개 trans_lang 호출)
    ↓ Tier 1 deterministic 필터 (word exact + grade + pos)
    ↓ Tier 3 번역 그룹화 (en 번역값 동일한 entries 묶기)
    ↓ 학습 카드 출력
"""

from __future__ import annotations

import json
import sys
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

HERE = Path(__file__).parent

# load .env (local) + ../../.env.local (project) — local overrides project
ENV: dict[str, str] = {}
for env_path in [HERE.parent.parent / ".env.local", HERE / ".env"]:
    if not env_path.exists():
        continue
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        ENV[k] = v.strip().strip('"').strip("'")

KEY = ENV["KRDICT_API_KEY"]
OPENAI_KEY = ENV["OPENAI_API_KEY"]

BASE = "https://krdict.korean.go.kr/api"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Referer": "https://krdict.korean.go.kr/",
}

# Language codes (verified)
LANG = {"en": 1, "ja": 2, "zh-CN": 11}

# Tier 1 deterministic filter — 학습자 임계값 기준
# word exact match + word_grade ∈ {초급, 중급}
# 품사는 컷하지 않음 (counter "개^3 의존명사 초급" 등 학습 가치 있는 항목 보존)
# 고급/(no grade)는 학습자 마주칠 빈도가 너무 낮아 1차 컷.
# 더 미세한 borderline은 Tier 1.5 LLM-as-judge에서 처리.
ALLOWED_GRADE = {"초급", "중급"}


def fetch(word: str, trans_lang: int) -> list[ET.Element]:
    url = (
        f"{BASE}/search?key={KEY}&q={quote(word)}&part=word"
        f"&num=10&translated=y&trans_lang={trans_lang}"
    )
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=10) as r:
        return ET.fromstring(r.read()).findall("item")


def fetch_view(target_code: str, trans_lang: int) -> ET.Element | None:
    """Detailed view — needed for example sentences."""
    url = (
        f"{BASE}/view?key={KEY}&method=target_code&q={target_code}"
        f"&translated=y&trans_lang={trans_lang}"
    )
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=10) as r:
        root = ET.fromstring(r.read())
        return root.find("item")


def pick_example(item: ET.Element) -> str | None:
    """From a /view item, pull the first sentence-type example (문장 우선, 구 차선)."""
    sentence_examples: list[str] = []
    phrase_examples: list[str] = []
    for sense in item.iter("sense_info"):
        for ex in sense.findall("example_info"):
            etype = text(ex.find("type"))
            etext = text(ex.find("example"))
            if not etext:
                continue
            if etype == "문장":
                sentence_examples.append(etext)
            elif etype == "구":
                phrase_examples.append(etext)
    if sentence_examples:
        return sentence_examples[0]
    if phrase_examples:
        return phrase_examples[0]
    return None


def text(el: ET.Element | None) -> str:
    return (el.text or "").strip() if el is not None else ""


def parse_item(item: ET.Element, lang_label: str) -> dict:
    senses = []
    for s in item.findall("sense"):
        trans = None
        for t in s.findall("translation"):
            tw = text(t.find("trans_word"))
            tdfn = text(t.find("trans_dfn"))
            if tw:
                trans = {"word": tw, "dfn": tdfn}
                break
        senses.append(
            {
                "order": text(s.find("sense_order")),
                "def_ko": text(s.find("definition")),
                "trans": trans,
            }
        )
    return {
        "target_code": text(item.find("target_code")),
        "word": text(item.find("word")),
        "sup_no": text(item.find("sup_no")),
        "pos": text(item.find("pos")),
        "grade": text(item.find("word_grade")) or "(no grade)",
        "senses": senses,
        "_lang_label": lang_label,
    }


# 사전 정의문에 등장하는 명시적 register 마커 — 학습 카드에서 무조건 제외.
# 정책: 일반 욕설·멸칭은 노출 (성인 학습자 타겟 + 12+/Teen 등급)
# 컷하는 것: archaic / 지역 한정 / 매우 전문어 정도만.
REGISTER_DROP_MARKERS = [
    "옛말",              # archaic
    "옛것",
    "고어",
    "북한어",
    "북한식",
    "방언",
    "사투리",
    "전문어",             # 매우 전문 도메인
]


def has_drop_register_marker(definition: str) -> str | None:
    for m in REGISTER_DROP_MARKERS:
        if m in definition:
            return m
    return None


def passes_filter(entry: dict, query: str) -> tuple[bool, str]:
    """Tier 1 deterministic filter — word exact match만.
    grade·pos·register 같은 학습 가치 판단은 Tier 1.5 AI judge로 일임."""
    if entry["word"] != query:
        return False, f"word mismatch ({entry['word']})"
    return True, ""


# ── Tier 1.5: AI judge — score-based ──
# 룰은 추상으로만 (구체 단어 예시 X — [[feedback_prompting_no_examples]])
FREQ_THRESHOLD = 30  # score ≥ 30 만 keep

AI_SCORE_SYSTEM = """\
당신은 한국어 어휘 사용 빈도 분석가입니다.

주어진 한국어 단어 W의 사전 의미 후보 각각에 대해 frequency_score (0~100)를 추정합니다.

- 100: 한국 사회의 일상 회화·뉴스·드라마·SNS·교과서·일반 도서 어디서나 매우 자주 등장
- 70~90: 자주 사용
- 40~70: 가끔 마주칠 수 있음 (특정 맥락이나 매체)
- 10~40: 드물게 사용 (격식체·학술·전문 등)
- 0~10: 거의 안 쓰임 (사극·고전·시조·매우 전문 도메인)

**score 0~1로 강하게 컷할 카테고리**:
- 인종차별, 민족 멸칭, 혐오 표현, 성희롱, 외설, 성적 표현, 극단적 모욕
- 어휘적 의미가 아닌 문법 메타 (자모 이름, 활용형 안내, 조사·어미·접사의 문법 기능 설명)

일반 욕설·비속어·멸칭(인종차별·혐오·성희롱이 아닌)은 학습 가치 있음 → score는 일상 빈도대로.

같은 의미 영역에 더 흔히 쓰이는 표준 단어가 있으면 점수를 낮추되, 그 단어가 학습자에게도 익숙한지 함께 고려합니다.

응답 JSON:
{
  "scores": [
    {
      "id": "<sense_id>",
      "frequency_score": <0-100>,
      "reasoning": "한 줄 근거"
    }
  ]
}\
"""


AI_TRANSLATION_OVERRIDE_SYSTEM = """\
당신은 한국어→영어 번역 보강 도우미입니다.

각 의미에 대해 사전이 제공한 영어 번역(EN 필드)을 점검합니다.
영어 번역이 한국어 발음을 그대로 로마자로 옮긴 음역(영어 사전에 등재되어 있지 않고 영어로 의미를 설명하지 않는 경우)이면, 한국어 정의(KO_def)를 바탕으로 의미가 명확한 영어 표현으로 대체합니다.

영어 번역이 이미 정상 의미 단어이면 빈 문자열을 둡니다.

음역 판별 신호:
- 영어 번역이 한국어 표제어의 발음을 그대로 옮긴 한두 음절
- 영어 사전에 그 형태로 등재되지 않은 표기
- 영어 화자가 그 영어만 보고는 의미를 알 수 없음

응답 JSON:
{
  "overrides": [
    {"id": "<sense_id>", "translation_override": "<보강 영어 또는 빈 문자열>"}
  ]
}\
"""


# 이하 기존 AI_JUDGE_SYSTEM (cross-validate 흐름) 은 score 방식으로 대체됨
_LEGACY_AI_JUDGE_SYSTEM = """\
당신은 한국어 어휘 학습 앱의 의미 큐레이션 도우미입니다.

[작업 1 — 학습 가치 선별]
주어진 표제어 W의 사전 의미 후보 중, 한국어 학습자(입문~중급)가 일상 회화·뉴스· \
교과서·매체에서 실제 마주칠 가능성이 있는 의미만 선택합니다.

판단 원칙:
- 사전이 부여한 등급(초급/중급/고급)은 보조 신호일 뿐 절대적이지 않습니다. \
등급이 높아도 일상 회화에서 자주 쓰이면 유지하고, 등급이 낮아도 격식체·문어·전문 영역에 한정되면 제외합니다.
- 기초 어휘 카테고리(숫자, 색, 방향, 시간 표현, 신체 부위, 흔히 쓰는 단위, 기본 동작 등)에 해당하면 \
학습 우선순위가 높습니다.
- 단어가 단독으로는 잘 안 쓰여도, 학습자가 흔히 만나는 관용 표현·복합 구문(수량+단위, 정도 부사+단위, \
대조 구문 등)의 핵심 요소로 자주 등장한다면 학습 가치 있음으로 유지합니다. \
학습자가 그 구문을 보고 의미를 찾으려 할 때 dictionary에 없으면 학습 단절이 일어납니다.
- 수의 곱·비율·배수·정도를 나타내는 단위 의미는 일상 대화·뉴스·교과서에서 매우 흔하게 사용되며, \
사전이 그 의미를 격식체나 고급으로 분류했더라도 학습 가치는 높습니다. 반드시 유지합니다.
- 동일 의미 영역에 더 일반적으로 사용되는 동의어가 명백히 존재해 학습자가 그 단어로 마주칠 가능성이 낮다면 제외합니다.
- 격식체·문어체에 한정되는 단위(고문서·신문 헤드라인·공식문서 외에는 잘 안 쓰이는 단위) 의미는 제외합니다.
- 현대 한국에서 같은 의미를 표준으로 표현하는 다른 단어가 이미 자리잡고 있고, \
해당 의미는 고전 문학·시조·사극·역사 텍스트나 특수 의식·전통 행사에서만 자연스럽게 등장한다면 제외합니다. \
사전 정의문에 "일상 회화에서 자주" 같은 표현이 있어도 그것이 현대의 실제 사용을 반영한다고 \
가정하지 말고, 동시대 매체(뉴스·드라마·SNS·교과서·일반 도서)에서 그 의미로 그 단어가 자연스럽게 \
쓰이는지 판단하십시오.
- 어휘적 의미가 아닌 문법 메타(자모 이름, 활용형 안내, 어미, 조사 같은 기능 형태소)는 제외합니다.
- 슬랭, 비속어, 차별어, 성적 표현, 매우 전문적인 도메인 용어(특정 분야의 게임·예술·과학 용어)는 제외합니다.

[작업 2 — 영어 번역 보강]
사전이 제공한 영어 번역이 음역(한국어 발음을 그대로 로마자로 옮긴 표기)이면 \
영어 화자가 그 의미를 즉시 이해할 수 있는 영어 표현으로 대체합니다.

음역 판별 방법: 제공된 영어 번역이 표준 영어 사전에 등재되어 있고 단어의 의미를 영어 텍스트로 \
설명하는 단어인가? 영어 사전에 없거나(예: 영어 단어가 아닌 한국어 발음 표기), 또는 \
하이픈으로 한국어 발음 음절을 연결한 형태(예: 두 음절 한국어 단어의 로마자 표기)라면 음역으로 판단합니다. \
이 경우 한국어 정의(KO_def)를 기반으로 의미가 명확히 전달되는 영어 번역을 새로 생성합니다.

이미 의미가 명확한 영어 번역이 있으면 그대로 둡니다.

응답은 반드시 JSON 형식으로:
{
  "kept": ["<id>", "..."],
  "reasons": {"<id>": "유지 또는 제외 이유 한 줄"},
  "translation_overrides": {"<id>": "보강된 영어 번역 (음역 보강이 필요한 sense만, 그 외 생략)"}
}\
"""


JUDGE_MODEL = "gpt-4.1-mini"  # score 기반은 mini로 충분


def _openai_call(messages: list[dict], temperature: float = 0.0) -> dict:
    body = json.dumps({
        "model": JUDGE_MODEL,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": temperature,
    }).encode()
    req = Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    content = resp["choices"][0]["message"]["content"]
    return json.loads(content)


# ── Stage 1: AI 자유 generate (사전 정보 일체 제공 X) ──
AI_GENERATE_SYSTEM = """\
당신은 한국어 어휘 학습 앱의 의미 큐레이터입니다.

주어진 한국어 표제어 W에 대해, 현재(2026년) 한국에서 일상 회화·뉴스·드라마·SNS·교과서· \
일반 도서·실용서에서 자연스럽게 사용되는 의미를 열거합니다.

포함하지 않는 것:
- 사극, 고전 문학, 시조, 역사 문헌, 전통 의례에서만 자연스러운 의미
- 인종차별, 민족 멸칭, 혐오 표현, 성희롱, 성적 표현, 외설, 극단적 모욕
- 매우 전문적인 도메인 용어(특정 분야 게임·예술·과학 등)
- 어휘 단위가 아닌 문법 요소(자모 이름, 활용형, 어미, 조사 같은 기능 형태소)
- 같은 의미 영역에 더 일반적인 표준 단어가 있어 거의 안 쓰이는 의미

포함할 것 (정책 명시):
- 일반 욕설, 비속어, 멸칭, 비격식 표현은 학습 가치가 있으면 포함 (인종차별·혐오·성희롱이 아닌 한)

응답은 반드시 JSON 형식으로:
{
  "meanings": [
    {"en": "<영어 번역>", "summary_ko": "<10자 이내 한국어 간략>"}
  ]
}\
"""


def ai_generate_meanings(word: str) -> list[dict]:
    """Stage 1 — AI가 사전 없이 자유로 의미 enumerate."""
    resp = _openai_call([
        {"role": "system", "content": AI_GENERATE_SYSTEM},
        {"role": "user", "content": f"W=\"{word}\""},
    ])
    return resp.get("meanings", [])


# ── Stage 2: AI가 자유 생성과 사전 senses 매칭 ──
AI_MATCH_SYSTEM = """\
한국어 어휘 학습 앱의 sense 매칭 도우미입니다.

입력:
- 단어 W
- 'generated': 현대 한국에서 일상 사용되는 의미라고 별도 판단된 목록
- 'dict_senses': 사전이 제공한 의미 목록 (각 sense에 영어 번역과 한국어 간략 의미)

작업: 각 dict_senses 항목을 generated 항목과 매칭합니다.
- generated에 명확히 대응하는 의미가 있으면 keep (그 dict sense는 현대 일상에서 쓰임)
- generated에 대응이 없으면 drop (그 dict sense는 현대 일상 외에서만 쓰여 generated에 빠진 것)
- 매칭은 영어 번역만 비교하지 말고 의미가 같은지 종합 판단 (예: 같은 한국어 단어의 다른 한자 어원이라도 \
의미가 동일하면 매칭)

영어 번역이 한국어 발음을 그대로 옮긴 음역인 dict sense의 경우, generated의 의미를 가져와 새 영어 번역으로 대체합니다.

응답 JSON:
{
  "kept": ["<dict_sense_id>", ...],
  "translation_overrides": {"<dict_sense_id>": "<보강된 영어 번역>"},
  "reasons": {"<dict_sense_id>": "유지/제외 이유 한 줄"}
}\
"""


def ai_match_to_dict(word: str, generated: list[dict], entries: list[dict]) -> tuple[set[str], dict[str, str], dict[str, str]]:
    gen_lines = []
    for g in generated:
        gen_lines.append(f"- EN={g.get('en','')}  KO={g.get('summary_ko','')}")
    dict_lines = []
    for ent in entries:
        for s in ent["senses"]:
            sid = f"{ent['target_code']}:{s['order']}"
            en = s["trans"].get("en", "")
            dict_lines.append(f"- id={sid}  EN={en}  KO_def={s['def_ko'][:60]}")
    user = (
        f"W=\"{word}\"\n\n"
        f"generated (현대 일상 의미):\n" + "\n".join(gen_lines) + "\n\n"
        f"dict_senses:\n" + "\n".join(dict_lines)
    )
    resp = _openai_call([
        {"role": "system", "content": AI_MATCH_SYSTEM},
        {"role": "user", "content": user},
    ])
    return (
        set(resp.get("kept", [])),
        resp.get("reasons", {}),
        resp.get("translation_overrides", {}),
    )


AI_BORDERLINE_SYSTEM = """\
한국어 어휘 학습 앱의 borderline 판정 도우미입니다.

다음 dict_sense가 'AI가 별도로 자유 생성한 의미 목록'에 매칭되지 않았습니다.
이는 두 가지 가능성이 있습니다:
(a) 정말 현대 한국에서 거의 안 쓰는 의미 (고전·사극·전문어·archaic·매우 격식체 등) → drop
(b) 자유 generate 단계에서 누락된 일상 의미 → keep

판단 기준 — 현재(2026년) 한국의 일상 회화·뉴스·드라마·SNS·교과서·일반 도서에서, \
한국어 단어 W가 이 영어 의미로 자연스럽게 등장하는가?

사전 정의문에 '일상' 같은 표현이 있어도 사전 작성 당시 평가일 뿐이며, 현재 실제 사용을 \
의미하지 않을 수 있으니 자체 판단하십시오. 같은 의미 영역에 표준 단어가 따로 있고 W는 \
거의 안 쓰는 경우 drop.

추가 컷 기준:
- 인종차별·민족 멸칭·혐오 표현·성희롱·외설·극단적 모욕에 해당 → drop
- 어휘적 의미가 아닌 문법 요소(자모 이름, 활용형, 어미, 조사 같은 기능 형태소) → drop
- 일반 욕설·비속어·멸칭은 학습 가치 평가만 (현대 일상에 등장하면 keep)

응답 JSON:
{
  "verdict": "keep" 또는 "drop",
  "reason": "한 줄 이유"
}\
"""


def ai_judge_borderline(word: str, ent: dict, sense: dict) -> tuple[bool, str]:
    en = sense["trans"].get("en", "")
    ko_def = sense["def_ko"][:80]
    user = f"W=\"{word}\"\nsense: EN={en}  KO_def={ko_def}"
    resp = _openai_call([
        {"role": "system", "content": AI_BORDERLINE_SYSTEM},
        {"role": "user", "content": user},
    ])
    return resp.get("verdict", "drop") == "keep", resp.get("reason", "")


def ai_judge_senses(word: str, entries: list[dict]) -> tuple[set[str], dict[str, str], dict[str, str]]:
    """Two-call judge:
    Call 1 — score 매기기 (translation 보지 않음)
    Call 2 — keep된 sense들에 대해서만 음역 보강 (별도 호출)
    """
    # Call 1: score (self-consistency: 3회 호출 → median)
    lines = []
    for ent in entries:
        for s in ent["senses"]:
            sid = f"{ent['target_code']}:{s['order']}"
            en = s["trans"].get("en", "")
            lines.append(
                f"- id={sid}  pos={ent['pos']}  grade={ent['grade']}  "
                f"sup_no={ent['sup_no']}  EN={en}  KO_def={s['def_ko']}"
            )
    user = f"W=\"{word}\"\n의미 목록:\n" + "\n".join(lines)

    # Single call (v12 방식) — temperature=0 결정성
    resp = _openai_call(
        [{"role": "system", "content": AI_SCORE_SYSTEM}, {"role": "user", "content": user}],
        temperature=0.0,
    )
    scores: dict[str, dict] = {x["id"]: x for x in resp.get("scores", [])}

    kept_ids: set[str] = set()
    reasons: dict[str, str] = {}
    kept_sense_payloads: list[tuple[str, dict, dict]] = []
    for ent in entries:
        for s in ent["senses"]:
            sid = f"{ent['target_code']}:{s['order']}"
            sc = scores.get(sid, {})
            score = sc.get("frequency_score", 0)
            reasoning = sc.get("reasoning", "")
            reasons[sid] = f"[score={score}] {reasoning}"
            if score >= FREQ_THRESHOLD:
                kept_ids.add(sid)
                kept_sense_payloads.append((sid, ent, s))
    print(f"  [Call 1: score] threshold={FREQ_THRESHOLD}, kept {len(kept_ids)}/{len(scores)}")

    # Call 2: translation override (only kept senses)
    overrides: dict[str, str] = {}
    if kept_sense_payloads:
        override_lines = []
        for sid, ent, s in kept_sense_payloads:
            en = s["trans"].get("en", "")
            override_lines.append(f"- id={sid}  EN={en}  KO_def={s['def_ko'][:80]}")
        user2 = f"W=\"{word}\"\n의미 목록:\n" + "\n".join(override_lines)
        resp2 = _openai_call([
            {"role": "system", "content": AI_TRANSLATION_OVERRIDE_SYSTEM},
            {"role": "user", "content": user2},
        ])
        for item in resp2.get("overrides", []):
            sid = item.get("id")
            ov = (item.get("translation_override") or "").strip()
            if sid and ov:
                overrides[sid] = ov
        print(f"  [Call 2: translation_override] checked {len(kept_sense_payloads)}, overrode {len(overrides)}")
    return kept_ids, reasons, overrides


def apply_ai_judge(
    entries: list[dict], word: str
) -> tuple[list[dict], dict[str, str], dict[str, str]]:
    """Filter senses + apply EN translation overrides. Drop entries w/ 0 surviving senses."""
    # Tier 1.4 — deterministic marker 컷 (archaic / 지역 한정 / 매우 전문어)
    # 사전이 정의문에 명시한 라벨은 신뢰 가능. AI에 던지기 전에 미리 컷.
    pre_filtered: list[dict] = []
    pre_reasons: dict[str, str] = {}
    for ent in entries:
        kept_senses = []
        for s in ent["senses"]:
            marker = has_drop_register_marker(s["def_ko"])
            sid = f"{ent['target_code']}:{s['order']}"
            if marker:
                pre_reasons[sid] = f"[deterministic] marker={marker}"
                continue
            kept_senses.append(s)
        if kept_senses:
            pre_filtered.append({**ent, "senses": kept_senses})
    print(f"  [Tier 1.4] deterministic marker 컷: senses {sum(len(e['senses']) for e in entries)} → {sum(len(e['senses']) for e in pre_filtered)}")
    if pre_reasons:
        for sid, r in pre_reasons.items():
            print(f"    ❌ {sid}: {r}")
    kept_ids, reasons, overrides = ai_judge_senses(word, pre_filtered)
    reasons.update(pre_reasons)
    entries = pre_filtered
    out: list[dict] = []
    for ent in entries:
        surviving = []
        for s in ent["senses"]:
            sid = f"{ent['target_code']}:{s['order']}"
            if sid not in kept_ids:
                continue
            if sid in overrides and overrides[sid].strip():
                new_s = dict(s)
                new_s["trans"] = {**s["trans"], "en": overrides[sid].strip(),
                                  "_en_original": s["trans"].get("en", "")}
                surviving.append(new_s)
            else:
                surviving.append(s)
        if surviving:
            out.append({**ent, "senses": surviving})
    return out, reasons, overrides


def merge_translations(entries_by_lang: dict[str, list[dict]]) -> list[dict]:
    """Combine en/ja/zh entries by target_code so each surviving entry has all 3 langs."""
    merged: dict[str, dict] = {}
    for lang_label, entries in entries_by_lang.items():
        for ent in entries:
            tc = ent["target_code"]
            if tc not in merged:
                merged[tc] = {
                    "target_code": tc,
                    "word": ent["word"],
                    "sup_no": ent["sup_no"],
                    "pos": ent["pos"],
                    "grade": ent["grade"],
                    "senses_by_order": {},  # order -> {def_ko, trans: {en, ja, zh-CN}}
                }
            for s in ent["senses"]:
                row = merged[tc]["senses_by_order"].setdefault(
                    s["order"],
                    {"def_ko": s["def_ko"], "trans": {}},
                )
                if s["trans"]:
                    row["trans"][lang_label] = s["trans"]["word"]
    # flatten
    out = []
    for tc, m in merged.items():
        senses = [
            {"order": o, **r}
            for o, r in sorted(m["senses_by_order"].items(), key=lambda x: int(x[0] or 0))
        ]
        out.append({**m, "senses": senses, "senses_by_order": None})
    return out


def group_by_en_translation(entries: list[dict]) -> list[dict]:
    """Tier 3 — group entries whose sense[0].en translation is the same."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for ent in entries:
        # group key = lowercased first English gloss of first sense
        en = (ent["senses"][0]["trans"].get("en") or "").strip().lower()
        groups[en].append(ent)
    # produce output: each group = one card
    cards = []
    for en_key, ents in groups.items():
        # collect all senses (def_ko + all-lang translations) under this group
        all_senses = []
        for ent in ents:
            for s in ent["senses"]:
                all_senses.append(
                    {
                        "sense_id": f"{ent['target_code']}:{s['order']}",
                        "def_ko": s["def_ko"],
                        "pos": ent["pos"],
                        "trans": s["trans"],
                        "from_entry": f"{ent['word']}^{ent['sup_no']} ({ent['pos']}, {ent['grade']})",
                    }
                )
        cards.append({"en_key": en_key, "senses": all_senses})
    # sort: larger group first (more entries in group = more learner-relevant)
    cards.sort(key=lambda c: -len(c["senses"]))
    return cards


def main(word: str = "이") -> None:
    print(f"\n{'=' * 60}")
    print(f"  End-to-end dict-first pipeline prototype")
    print(f"  Input: {word!r}")
    print(f"{'=' * 60}\n")

    # ── Tier 2: dictionary lookup ──
    print(f"[Tier 2] krdict 호출 × 3 (en/ja/zh-CN)")
    by_lang: dict[str, list[dict]] = {}
    for label, code in LANG.items():
        items = fetch(word, code)
        by_lang[label] = [parse_item(it, label) for it in items]
        print(f"  - trans_lang={code} ({label}): {len(items)} raw entries")
        time.sleep(0.2)

    merged = merge_translations(by_lang)
    print(f"\n  → merged {len(merged)} unique target_codes\n")

    # ── Tier 1: deterministic — word exact match만 ──
    print(f"[Tier 1] deterministic 필터 (word=={word!r} only)")
    survivors_t1 = []
    for ent in merged:
        ok, reason = passes_filter(ent, word)
        label = f"{ent['word']}^{ent['sup_no']} ({ent['pos']}, {ent['grade']})"
        mark = "✅ keep" if ok else f"❌ skip ({reason})"
        print(f"  {mark}  {label}")
        if ok:
            survivors_t1.append(ent)
    print(f"\n  → {len(merged)} → {len(survivors_t1)} 통과\n")

    # ── Tier 1.5: AI judge ──
    print(f"[Tier 1.5] AI judge (gpt-4.1-mini) — 학습 가치 선별 + 음역 보강")
    survivors, reasons, overrides = apply_ai_judge(survivors_t1, word)
    sense_pre = sum(len(e["senses"]) for e in survivors_t1)
    sense_post = sum(len(e["senses"]) for e in survivors)
    print(f"  → senses {sense_pre} → {sense_post}, entries {len(survivors_t1)} → {len(survivors)}")
    for sid, reason in reasons.items():
        kept_mark = "✅" if any(
            f"{e['target_code']}:{s['order']}" == sid for e in survivors for s in e["senses"]
        ) else "❌"
        override_note = f"  [EN→ {overrides[sid]!r}]" if sid in overrides else ""
        print(f"  {kept_mark} {sid}: {reason}{override_note}")
    print()

    # ── Tier 3: group by translation ──
    print(f"[Tier 3] 번역 그룹화 (en 번역값 동일한 entries 묶기)")
    cards = group_by_en_translation(survivors)
    print(f"  → {len(survivors)} entries → {len(cards)} 학습 카드\n")

    # ── Tier 4: 그룹 대표 entry로 예문 1개씩 pull (view API) ──
    print(f"[Tier 4] 그룹별 예문 fetch (view API × {len(cards)})")
    for grp in cards:
        # representative = first sense's source entry (the smallest sup_no within group)
        # we keep a back-pointer in survivors via target_code; recover from the first sense
        # — pick the target_code of the first sense's source label
        # Simpler: re-find from `survivors` the entry whose word^sup_no matches first sense.
        first_src = grp["senses"][0]["from_entry"]  # e.g. "이^5 (대명사, 초급)"
        rep = None
        for ent in survivors:
            label = f"{ent['word']}^{ent['sup_no']} ({ent['pos']}, {ent['grade']})"
            if label == first_src:
                rep = ent
                break
        assert rep is not None
        view_item = fetch_view(rep["target_code"], LANG["en"])
        grp["example"] = pick_example(view_item) if view_item is not None else None
        print(f"  - {grp['en_key']!r} ← target_code={rep['target_code']}  example={'O' if grp['example'] else 'X'}")
        time.sleep(0.2)

    # ── DB 저장 구조 (서버 내부, AI 컨텍스트용) ──
    print(f"\n{'─' * 64}")
    print(f"  [서버 DB] AI 컨텍스트용 메타 저장 (사용자 미노출)")
    print(f"{'─' * 64}\n")

    for i, grp in enumerate(cards, 1):
        en = grp["en_key"]
        print(f"  [{i}] EN={en}")
        ja_all = sorted({s["trans"].get("ja", "") for s in grp["senses"] if s["trans"].get("ja")})
        zh_all = sorted({s["trans"].get("zh-CN", "") for s in grp["senses"] if s["trans"].get("zh-CN")})
        if ja_all: print(f"       JA cache: {' / '.join(ja_all)}")
        if zh_all: print(f"       ZH cache: {' / '.join(zh_all)}")
        print(f"       KO 의미 ({len(grp['senses'])}):")
        for s in grp["senses"]:
            print(f"         - {s['def_ko']}")
            print(f"             └─ from {s['from_entry']}")
        print(f"       예문: {grp.get('example') or '(사전 예문 없음 — LLM fallback)'}")
        print()

    # ── 사용자 단어 카드 (한국어→영어) ──
    print(f"{'─' * 64}")
    print(f"  [사용자 카드] 한국어 → 영어 단어장")
    print(f"{'─' * 64}\n")

    import re
    def _extract_score(reason_str: str) -> int:
        m = re.search(r"\[score=(\d+)\]", reason_str or "")
        return int(m.group(1)) if m else 0

    def _grp_max(grp: dict) -> int:
        ss = [_extract_score(reasons.get(s.get("sense_id", ""), "")) for s in grp["senses"]]
        return max(ss) if ss else 0

    # 카드를 score 내림차순 정렬
    cards.sort(key=lambda c: -_grp_max(c))
    # 그룹 내 sense들도 score 내림차순 정렬
    for grp in cards:
        grp["senses"].sort(
            key=lambda s: -_extract_score(reasons.get(s.get("sense_id", ""), ""))
        )

    print(f"  ┌─────────────────────────────────────────────────────────")
    print(f"  │  {word}")
    print(f"  ├─────────────────────────────────────────────────────────")
    for i, grp in enumerate(cards, 1):
        max_score = _grp_max(grp)
        print(f"  │")
        print(f"  │  {i}. {grp['en_key']}   [score={max_score}]")
        if len(grp["senses"]) > 1:
            for s in grp["senses"]:
                sc = _extract_score(reasons.get(s.get("sense_id", ""), ""))
                short_def = s["def_ko"][:55]
                print(f"  │       └─ [score={sc}] {short_def}")
        if grp.get("example"):
            print(f"  │     예: {grp['example']}")
    print(f"  │")
    print(f"  └─────────────────────────────────────────────────────────\n")


if __name__ == "__main__":
    words = sys.argv[1:] or ["이"]
    for w in words:
        main(w)
