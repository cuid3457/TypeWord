#!/usr/bin/env python3
"""Probe JMdict-simplified for Japanese polysemy quality.

Loads the full all-languages JSON once, then prints clean sense breakdowns for a
set of well-known polysemous Japanese words/kanji-readings. Output is laid out
for native review by 대표님 — focus is on (a) does it nail multiple meanings,
(b) does it carry useful frequency/usage tags, (c) what languages have built-in
glosses (we expect at minimum en, plus some es/fr/de/it from JMdict contributors).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
DICT_PATH = HERE / "downloads" / "jmdict-all-3.6.2.json"

# (word, kana_optional, why)
PROBES = [
    ("生",   None,  "extreme polyseme — life/raw/birth/student/grow"),
    ("大",   None,  "big / great / very (prefix)"),
    ("中",   None,  "middle / inside / among / China"),
    ("生きる", "いきる", "to live (specific kana entry)"),
    ("行く", "いく",  "to go (also disambig vs 行う)"),
    ("行",   None,  "go / line / row / journey / column"),
    ("掛ける", "かける", "extreme polysemy — hang/multiply/spend/sit/start"),
    ("引く", "ひく",  "to pull / to draw / to subtract / to catch (cold)"),
    ("見る", "みる",  "to see / to look / to watch / to judge"),
    ("手",   None,  "hand / way / type / labor"),
    ("時計", "とけい", "clock — simpler, just to see normal polysemy"),
    ("やばい", None,  "modern slang/colloquial — does JMdict carry these tags?"),
]


def load() -> dict:
    print(f"loading {DICT_PATH.name} ({DICT_PATH.stat().st_size/1e6:.1f} MB)...", file=sys.stderr)
    with DICT_PATH.open() as f:
        return json.load(f)


def find(data: dict, word: str, kana: str | None) -> list:
    matches = []
    for w in data.get("words", []):
        kanji_forms = [k["text"] for k in w.get("kanji", [])]
        kana_forms = [k["text"] for k in w.get("kana", [])]
        if word in kanji_forms or word in kana_forms:
            if kana is None or kana in kana_forms:
                matches.append(w)
    return matches


def render(word: str, kana: str | None, entries: list) -> None:
    label = f"{word}" + (f" ({kana})" if kana else "")
    print(f"\n=== {label} ===")
    if not entries:
        print("  (no JMdict entries found)")
        return
    for ei, ent in enumerate(entries):
        kanji = ",".join(k["text"] for k in ent.get("kanji", []))
        kana_list = ",".join(k["text"] for k in ent.get("kana", []))
        common = any(k.get("common") for k in ent.get("kanji", []) + ent.get("kana", []))
        senses = ent.get("sense", [])
        print(f"  Entry [{ei}] kanji=[{kanji}] kana=[{kana_list}] common={common} | senses={len(senses)}")
        # show language gloss coverage on this entry
        lang_seen: set[str] = set()
        for s in senses:
            for g in s.get("gloss", []):
                lang_seen.add(g.get("lang", "?"))
        print(f"             gloss langs: {sorted(lang_seen)}")
        for si, s in enumerate(senses[:8]):
            pos = ",".join(s.get("partOfSpeech", []))
            misc = ",".join(s.get("misc", []))
            field = ",".join(s.get("field", []))
            tags = ", ".join(t for t in (pos, misc, field) if t)
            # only show English glosses for compactness
            en_glosses = [g["text"] for g in s.get("gloss", []) if g.get("lang") == "eng"][:3]
            print(f"      {si+1}. [{tags}] {' / '.join(en_glosses)}")
        if len(senses) > 8:
            print(f"      ... and {len(senses)-8} more senses")


def main() -> None:
    data = load()
    word_count = len(data.get("words", []))
    print(f"JMdict loaded — {word_count:,} word entries, langs={data.get('languages')}", file=sys.stderr)

    for word, kana, _ in PROBES:
        matches = find(data, word, kana)
        render(word, kana, matches)


if __name__ == "__main__":
    main()
