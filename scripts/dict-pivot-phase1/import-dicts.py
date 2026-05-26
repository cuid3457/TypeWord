#!/usr/bin/env python3
"""Import JMdict + CC-CEDICT into Supabase Postgres tables.

Uses PostgREST endpoint with SUPABASE_SERVICE_ROLE_KEY (RLS bypass).

JMdict source: jmdict-simplified all-languages JSON (already in downloads/)
CC-CEDICT source: cedict.txt (already in downloads/)

Inserts in batches of 500 rows.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

HERE = Path(__file__).parent
DOWNLOADS = HERE / "downloads"

ENV: dict[str, str] = {}
for env_path in [HERE.parent.parent / ".env.local"]:
    if not env_path.exists():
        continue
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        ENV[k] = v.strip().strip('"').strip("'")

SUPABASE_URL = ENV["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]

REST_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

BATCH_SIZE = 500


def post_batch(table: str, rows: list[dict]) -> None:
    body = json.dumps(rows).encode()
    req = Request(f"{REST_URL}/{table}", data=body, headers=HEADERS, method="POST")
    try:
        with urlopen(req, timeout=120) as r:
            r.read()
    except HTTPError as exc:
        body_resp = exc.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {exc.code} on {table}: {body_resp[:500]}") from exc


def import_jmdict() -> None:
    path = next(DOWNLOADS.glob("jmdict-all-*.json"))
    print(f"loading {path.name} ({path.stat().st_size / 1e6:.1f} MB)...", file=sys.stderr)
    with path.open() as f:
        data = json.load(f)

    words = data.get("words", [])
    print(f"JMdict — {len(words):,} entries", file=sys.stderr)

    batch: list[dict] = []
    total = 0
    for w in words:
        kanji_forms = [k["text"] for k in w.get("kanji", [])]
        kana_forms = [k["text"] for k in w.get("kana", [])]
        is_common = any(k.get("common", False) for k in w.get("kanji", []) + w.get("kana", []))
        batch.append({
            "jmdict_seq": int(w["id"]),
            "kanji_forms": kanji_forms,
            "kana_forms": kana_forms,
            "is_common": is_common,
            "data": w,  # 전체 sense + gloss multi-lang
        })
        if len(batch) >= BATCH_SIZE:
            post_batch("jmdict_entries", batch)
            total += len(batch)
            batch.clear()
            if total % 5000 == 0:
                print(f"  jmdict imported {total:,}/{len(words):,}", file=sys.stderr)
    if batch:
        post_batch("jmdict_entries", batch)
        total += len(batch)
    print(f"JMdict import complete — {total:,} rows", file=sys.stderr)


def import_cedict() -> None:
    path = DOWNLOADS / "cedict.txt"
    print(f"loading {path.name} ({path.stat().st_size / 1e6:.1f} MB)...", file=sys.stderr)
    line_rx = re.compile(r"^(\S+) (\S+) \[(.+?)\] (.+)$")

    batch: list[dict] = []
    total = 0
    skipped_dups: dict[tuple, int] = {}
    seen: set[tuple[str, str, str]] = set()
    with path.open() as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            m = line_rx.match(line)
            if not m:
                continue
            trad, simp, pinyin, glosses = m.groups()
            senses = [g for g in glosses.split("/") if g]
            key = (simp, trad, pinyin)
            if key in seen:
                skipped_dups[key] = skipped_dups.get(key, 0) + 1
                continue
            seen.add(key)
            batch.append({
                "traditional": trad,
                "simplified": simp,
                "pinyin": pinyin,
                "senses": senses,
            })
            if len(batch) >= BATCH_SIZE:
                post_batch("cedict_entries", batch)
                total += len(batch)
                batch.clear()
                if total % 5000 == 0:
                    print(f"  cedict imported {total:,}", file=sys.stderr)
    if batch:
        post_batch("cedict_entries", batch)
        total += len(batch)
    print(f"CC-CEDICT import complete — {total:,} rows (skipped {sum(skipped_dups.values())} dupes)", file=sys.stderr)


def main() -> None:
    targets = sys.argv[1:] or ["jmdict", "cedict"]
    for t in targets:
        t0 = time.time()
        if t == "jmdict":
            import_jmdict()
        elif t == "cedict":
            import_cedict()
        else:
            print(f"unknown target: {t}", file=sys.stderr)
            sys.exit(1)
        print(f"{t}: {time.time() - t0:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
