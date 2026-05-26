#!/usr/bin/env python3
"""Probe CC-CEDICT for Chinese polysemy quality.

CC-CEDICT entry format (per line):
  traditional simplified [pinyin] /meaning1/meaning2/.../

We probe traditional + simplified for well-known polysemes and print the
collected senses, plus the HSK level (if cross-referenced — note CC-CEDICT
itself has no frequency tags, so this is a known gap).
"""
from __future__ import annotations

import re
from pathlib import Path

HERE = Path(__file__).parent
CEDICT_PATH = HERE / "downloads" / "cedict.txt"

LINE_RX = re.compile(r"^(\S+) (\S+) \[(.+?)\] (.+)$")

# (simplified, traditional, why)
PROBES = [
    ("行", "行",   "go / line / row / OK / profession (multi-reading: xing/hang)"),
    ("长", "長",   "long / long-time / chief (multi-reading: cháng/zhǎng)"),
    ("重", "重",   "heavy / again / serious (multi-reading: zhòng/chóng)"),
    ("好", "好",   "good / very / love-to (multi-reading: hǎo/hào)"),
    ("会", "會",   "can / meet / society / moment"),
    ("打", "打",   "extreme polyseme — hit/play/fetch/dozen"),
    ("生", "生",   "raw / give birth / student / produce"),
    ("大", "大",   "big / very / much-older (大姐/大学)"),
    ("意思", "意思", "meaning / opinion / gift / interesting"),
    ("东西", "東西", "east-west / thing (different readings same chars)"),
    ("方便", "方便", "convenient / opportunity / euphemism for using toilet"),
]


def load() -> list[dict]:
    entries: list[dict] = []
    with CEDICT_PATH.open() as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            m = LINE_RX.match(line)
            if not m:
                continue
            trad, simp, pinyin, glosses = m.groups()
            senses = [g for g in glosses.split("/") if g]
            entries.append({"trad": trad, "simp": simp, "pinyin": pinyin, "senses": senses})
    return entries


def find(entries: list[dict], simp: str, trad: str) -> list[dict]:
    return [e for e in entries if e["simp"] == simp or e["trad"] == trad]


def render(simp: str, trad: str, matches: list[dict]) -> None:
    label = simp if simp == trad else f"{simp} (trad: {trad})"
    print(f"\n=== {label} ===")
    if not matches:
        print("  (no CC-CEDICT entry)")
        return
    print(f"  matched {len(matches)} entries")
    for i, e in enumerate(matches):
        print(f"  [{i}] {e['simp']} [{e['pinyin']}]  ({len(e['senses'])} senses)")
        for j, s in enumerate(e["senses"][:6]):
            print(f"      {j+1}. {s}")
        if len(e["senses"]) > 6:
            print(f"      ... and {len(e['senses'])-6} more")


def main() -> None:
    entries = load()
    print(f"CC-CEDICT loaded — {len(entries):,} entries")

    for simp, trad, _ in PROBES:
        render(simp, trad, find(entries, simp, trad))


if __name__ == "__main__":
    main()
