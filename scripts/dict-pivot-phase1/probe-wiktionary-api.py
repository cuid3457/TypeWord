#!/usr/bin/env python3
"""Probe freedictionaryapi.com for polysemy quality across EN + 4 Latin languages.

Output is meant for human native review: print each word's senses cleanly grouped
by entry/POS, so 대표님 can judge whether the dictionary handles polysemy better
than the current LLM pipeline.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from typing import Optional

BASE = "https://freedictionaryapi.com/api/v1/entries"

# (lang, word, why-this-word)
PROBES = [
    ("en", "set",   "extreme polyseme — ~400 senses in OED"),
    ("en", "run",   "extreme polyseme — verb/noun"),
    ("en", "bank",  "river-bank vs financial bank"),
    ("en", "light", "noun illumination / adj weight / verb ignite"),
    ("es", "banco", "bank / bench / pew"),
    ("es", "carta", "letter / playing card / menu"),
    ("es", "vela",  "candle / sail / wake (vigil)"),
    ("fr", "voler", "to fly / to steal"),
    ("fr", "louer", "to rent / to praise"),
    ("fr", "livre", "book / pound (currency)"),
    ("de", "Bank",  "bench / bank (financial)"),
    ("de", "Schloss", "lock / castle"),
    ("de", "Gericht", "court / dish (meal)"),
    ("it", "corso", "course / main avenue / past part. of 'correre'"),
    ("it", "lingua", "tongue / language"),
    ("it", "campo", "field / camp"),
]


UA = "MoaVoca-PhasedictProbe/1.0 (junesung07@gmail.com)"


def fetch(lang: str, word: str) -> Optional[dict]:
    url = f"{BASE}/{lang}/{word}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as exc:  # noqa: BLE001
        return {"_error": str(exc)}


def render(lang: str, word: str, payload: Optional[dict]) -> None:
    header = f"{lang}: {word!r}"
    print(f"\n=== {header} ===")
    if not payload or payload.get("_error"):
        print(f"  ERROR: {payload.get('_error') if payload else 'no payload'}")
        return
    entries = payload.get("entries", [])
    print(f"  entries={len(entries)}")
    for i, ent in enumerate(entries):
        pos = ent.get("partOfSpeech")
        senses = ent.get("senses", [])
        print(f"  [{i}] POS={pos} | senses={len(senses)}")
        for j, s in enumerate(senses[:6]):
            tags = ",".join(s.get("tags", []))
            df = s.get("definition", "")
            tag_str = f" ({tags})" if tags else ""
            print(f"      {j+1}.{tag_str} {df}")


def main() -> None:
    results = {}
    for lang, word, _why in PROBES:
        results[(lang, word)] = fetch(lang, word)
        render(lang, word, results[(lang, word)])

    # Save raw JSON for later review
    out = {f"{l}:{w}": v for (l, w), v in results.items()}
    with open(sys.argv[1] if len(sys.argv) > 1 else "results/freedict-probe.json", "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
