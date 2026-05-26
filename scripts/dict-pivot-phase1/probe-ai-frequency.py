#!/usr/bin/env python3
"""AI가 각 의미별로 '현대 한국 일상 사용 빈도' score를 어떻게 매기는지 시각화.

각 한 글자 다의어에 대해 사전의 모든 의미를 AI에게 보여주고
sense별로 frequency_score (0-100) + 사용 context + standard alternative + 근거 요청.

목표: AI 판단의 정량적 근거 노출 + 임계값 후보 탐색.
"""
from __future__ import annotations

import json
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

HERE = Path(__file__).parent
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

KRDICT_KEY = ENV["KRDICT_API_KEY"]
OPENAI_KEY = ENV["OPENAI_API_KEY"]

BASE = "https://krdict.korean.go.kr/api"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Referer": "https://krdict.korean.go.kr/",
}


SYSTEM = """\
당신은 한국어 어휘 사용 빈도 분석가입니다.

주어진 한국어 단어 W의 사전 의미 목록 각각에 대해 다음을 추정합니다:

frequency_score (0~100):
- 100: 한국 사회의 일상 회화, 뉴스, 드라마, SNS, 교과서, 일반 도서 어디서나 매우 자주 등장
- 70~90: 자주 사용되는 의미
- 40~70: 가끔 마주칠 수 있음 (특정 맥락이나 매체)
- 10~40: 드물게 사용 (격식체, 학술, 전문, 일부 세대만)
- 0~10: 거의 안 쓰임 (사극, 고전, 시조, 매우 전문적)

common_contexts:
의미가 등장하는 주요 매체/상황 (예: "일상 회화", "뉴스", "교과서", "사극", "전문 도메인")

standard_alternative:
같은 의미를 더 흔히 표현하는 다른 한국어 단어가 있다면 그것 (없으면 빈 문자열)

reasoning:
점수 근거 한 줄

응답 JSON:
{
  "scores": [
    {
      "id": "...",
      "frequency_score": <0-100>,
      "common_contexts": [...],
      "standard_alternative": "...",
      "reasoning": "..."
    }
  ]
}\
"""


def krdict_search(word: str) -> list[ET.Element]:
    url = f"{BASE}/search?key={KRDICT_KEY}&q={quote(word)}&part=word&num=10&translated=y&trans_lang=1"
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=10) as r:
        return ET.fromstring(r.read()).findall("item")


def text(el) -> str:
    return (el.text or "").strip() if el is not None else ""


def parse_senses(items: list[ET.Element], word: str) -> list[dict]:
    out = []
    for it in items:
        w = text(it.find("word"))
        if w != word:
            continue
        sup_no = text(it.find("sup_no"))
        pos = text(it.find("pos"))
        grade = text(it.find("word_grade")) or "(no grade)"
        target_code = text(it.find("target_code"))
        for s in it.findall("sense"):
            sid = f"{target_code}:{text(s.find('sense_order'))}"
            en = ""
            for t in s.findall("translation"):
                tw = text(t.find("trans_word"))
                if tw:
                    en = tw
                    break
            out.append({
                "id": sid,
                "word": w,
                "sup_no": sup_no,
                "pos": pos,
                "grade": grade,
                "en": en,
                "ko_def": text(s.find("definition")),
            })
    return out


def ai_score(word: str, senses: list[dict]) -> dict:
    lines = []
    for s in senses:
        lines.append(
            f"- id={s['id']}  pos={s['pos']}  grade={s['grade']}  "
            f"sup_no={s['sup_no']}  EN={s['en']}  KO_def={s['ko_def']}"
        )
    body = json.dumps({
        "model": "gpt-4.1-mini",
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"W=\"{word}\"\n의미 목록:\n" + "\n".join(lines)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.0,
    }).encode()
    req = Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
    )
    with urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    return json.loads(resp["choices"][0]["message"]["content"])


def render(word: str, senses: list[dict], scores_resp: dict) -> None:
    score_map = {x["id"]: x for x in scores_resp.get("scores", [])}
    print(f"\n{'='*80}")
    print(f"  {word}")
    print(f"{'='*80}\n")
    print(f"  {'score':>5}  {'EN translation':<30}  {'grade':<8}  {'pos':<10}  ko_def (head)")
    print(f"  {'─'*5}  {'─'*30}  {'─'*8}  {'─'*10}  {'─'*50}")
    rows = []
    for s in senses:
        sc = score_map.get(s["id"], {})
        rows.append((sc.get("frequency_score", 0), s, sc))
    rows.sort(key=lambda r: -r[0])
    for score, s, sc in rows:
        en = (s["en"] or "")[:30]
        ko_def_head = s["ko_def"][:50]
        print(f"  {score:>5}  {en:<30}  {s['grade']:<8}  {s['pos']:<10}  {ko_def_head}")
        ctx = ", ".join(sc.get("common_contexts", []))
        alt = sc.get("standard_alternative", "")
        reason = sc.get("reasoning", "")
        print(f"         contexts: {ctx}")
        if alt:
            print(f"         standard alternative: {alt}")
        print(f"         reasoning: {reason}")
        print()


def main() -> None:
    words = sys.argv[1:] or ["이", "부", "차", "개", "배"]
    for word in words:
        items = krdict_search(word)
        senses = parse_senses(items, word)
        if not senses:
            print(f"\n[{word}] no senses")
            continue
        resp = ai_score(word, senses)
        render(word, senses, resp)
        time.sleep(0.3)


if __name__ == "__main__":
    main()
