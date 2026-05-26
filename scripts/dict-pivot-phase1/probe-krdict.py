#!/usr/bin/env python3
"""Probe krdict OpenAPI for Korean polysemy quality + 11-language translation coverage.

Tests the words that caused real bugs in our v3 prompt pipeline (see
[[project_session_handoff_2026-05-22]] — "이"→nostril hallucination, "부"→富 missing,
"이 개 샀다" counter error) plus several other notoriously polysemous Korean
words/expressions.

Output is laid out for native review by 대표님 — focus on:
  (a) does krdict cleanly separate sup_no (homograph) entries?
  (b) does word_grade (초급/중급/고급) reliably mark frequency?
  (c) is the built-in en/ja/zh/fr/es translation usable as-is?
  (d) any duplicates / odd entries we'd need to filter?
"""

from __future__ import annotations

import os
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional
from urllib.parse import quote
from urllib.request import Request, urlopen

HERE = Path(__file__).parent

# Load API key from .env without depending on python-dotenv
ENV_PATH = HERE / ".env"
ENV: dict[str, str] = {}
for line in ENV_PATH.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    ENV[k] = v

KEY = ENV["KRDICT_API_KEY"]

BASE = "https://krdict.korean.go.kr/api"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
HEADERS = {"User-Agent": UA, "Referer": "https://krdict.korean.go.kr/"}

# trans_lang codes (probed):
#  1=en  2=ja  3=fr  4=es  5=ar  6=mn  7=vi  8=th  9=id  10=ru  11=zh
LANG_CODES = {"en": 1, "ja": 2, "zh-CN": 11, "fr": 3, "es": 4}

# (word, why)
PROBES = [
    ("이",   "v3에서 nostril 환각 발생. 정답 = 치아 / louse / 사람(이 사람) / 자모 / 어미 / 접사"),
    ("부",   "v3에서 富 의미 누락. 정답 = 부(部) 부서 / 부(富) 부유 / 부(副) 부- / 등"),
    ("차",   "수많은 동음이의어 — 차(車)/차(茶)/차(次)/차(差)/접사 차-"),
    ("사",   "한자어 다음(多音) — 사(四)/사(事)/사(社)/사(死)/사(史)/사(私)/...등"),
    ("기",   "한자어 다음 — 기(器)/기(氣)/기(機)/기(旗)/기(基)/...등"),
    ("개",   "counter '개' + 짐승 '개(犬)' + 접사 '개-' — counter agreement 학습에 필요"),
    ("배",   "신체 배 + 배(船) + 배(梨) + 곱 배 (×) — 한국인이 잘 아는 다의어"),
    ("말",   "말(言) speech + 말(馬) horse + 말(末) end"),
    ("눈",   "눈(目) eye + 눈(雪) snow"),
    ("얼굴", "얼굴 face — single-meaning check 대조군"),
    ("야",   "감탄사 + 호격 조사 — 학습자 헷갈림"),
    ("잘",   "부사 잘(well) + 동음이의 잘(寢/sleep root)"),
    ("좋아", "구어/존댓말 학습 — 술어 활용 처리"),
    ("새벽", "복합어 보지 다의 없는 통상적 단어"),
    ("야하다", "register=비속/속어 표시되는지"),
]


def http_get(url: str) -> bytes:
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=10) as r:
        return r.read()


def text_of(el: Optional[ET.Element]) -> str:
    if el is None or el.text is None:
        return ""
    return el.text.strip()


def search(word: str, trans_lang: int) -> list[ET.Element]:
    """Run /api/search with translated glosses in the given language."""
    url = (
        f"{BASE}/search?key={KEY}&q={quote(word)}&part=word"
        f"&num=10&translated=y&trans_lang={trans_lang}"
    )
    raw = http_get(url)
    root = ET.fromstring(raw)
    return root.findall("item")


def render_entry(item: ET.Element, lang_label: str) -> list[str]:
    out: list[str] = []
    word = text_of(item.find("word"))
    sup_no = text_of(item.find("sup_no"))
    pos = text_of(item.find("pos"))
    grade = text_of(item.find("word_grade")) or "(no grade)"
    target_code = text_of(item.find("target_code"))
    out.append(f"  [{target_code}] {word}^{sup_no}  pos={pos}  grade={grade}")
    for sense in item.findall("sense"):
        order = text_of(sense.find("sense_order"))
        defn = text_of(sense.find("definition"))
        tline = []
        for t in sense.findall("translation"):
            tw = text_of(t.find("trans_word"))
            tlang = text_of(t.find("trans_lang"))
            if tw:
                tline.append(f"{tlang}={tw}")
        trans_str = "  ▸ " + " | ".join(tline) if tline else ""
        out.append(f"    {order}. {defn}{trans_str}")
    return out


def main() -> None:
    out_path = HERE / "results" / "krdict-probe.txt"
    out_path.parent.mkdir(exist_ok=True)
    log = open(out_path, "w", encoding="utf-8")

    def emit(line: str = "") -> None:
        print(line)
        log.write(line + "\n")

    emit("# krdict OpenAPI polysemy probe — 2026-05-23")
    emit("")
    emit(f"트랜스 lang 코드: {LANG_CODES}")
    emit("")

    for word, why in PROBES:
        emit(f"\n========== {word!r} ==========")
        emit(f"why: {why}")
        emit("")

        # First, do an English-translated search to get the list of homographs
        try:
            items_en = search(word, LANG_CODES["en"])
        except Exception as exc:  # noqa: BLE001
            emit(f"  ERROR fetching en: {exc}")
            continue
        emit(f"-- en (trans_lang=1) : {len(items_en)} item(s) --")
        for it in items_en:
            for line in render_entry(it, "en"):
                emit(line)

        # For one focal lookup, also pull ja + zh to see how the translation
        # layer differs by target language. We don't repeat for every word — that
        # would 5× the API quota — but we hit a few high-value ones.
        if word in ("이", "부", "차", "사", "개"):
            for lang_label in ("ja", "zh-CN"):
                time.sleep(0.2)
                try:
                    items = search(word, LANG_CODES[lang_label])
                except Exception as exc:  # noqa: BLE001
                    emit(f"  ERROR fetching {lang_label}: {exc}")
                    continue
                emit(f"-- {lang_label} (trans_lang={LANG_CODES[lang_label]}) : {len(items)} item(s) --")
                for it in items:
                    for line in render_entry(it, lang_label):
                        emit(line)
        time.sleep(0.2)

    log.close()
    print(f"\n→ written to {out_path}")


if __name__ == "__main__":
    main()
