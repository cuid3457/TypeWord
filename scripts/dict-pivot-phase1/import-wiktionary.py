#!/usr/bin/env python3
"""Import kaikki.org wiktextract JSONL into the wiktionary_entries table.

One kaikki line = one (word, pos, etymology) entry. We keep only the fields
the learning app needs (gloss, examples, tags, ipa, pos) and drop the heavy
wiktextract extras (translations, related, derived, hyphenation, …) so each
DB row stays small.

Usage:
  python3 import-wiktionary.py en downloads/kaikki-en.jsonl
  python3 import-wiktionary.py fr downloads/kaikki-fr.jsonl

Re-runnable: the table has no unique constraint, so to re-import a language
first delete its rows:  DELETE FROM wiktionary_entries WHERE lang='en';
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

HERE = Path(__file__).parent

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
MAX_EXAMPLES = 2          # cap examples per sense (storage)
MAX_SENSES = 12           # cap senses per entry (rare runaway entries)


def post_batch(rows: list[dict]) -> None:
    body = json.dumps(rows).encode()
    req = Request(f"{REST_URL}/wiktionary_entries", data=body, headers=HEADERS, method="POST")
    for attempt in range(3):
        try:
            with urlopen(req, timeout=180) as r:
                r.read()
            return
        except HTTPError as exc:
            resp = exc.read().decode(errors="replace")
            if attempt == 2:
                raise RuntimeError(f"HTTP {exc.code}: {resp[:500]}") from exc
            time.sleep(2)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)


def parse_entry(entry: dict, lang_code: str) -> dict | None:
    if entry.get("lang_code") != lang_code:
        return None
    word = (entry.get("word") or "").strip()
    if not word:
        return None

    # First IPA pronunciation, if present.
    ipa = None
    for snd in entry.get("sounds", []) or []:
        if snd.get("ipa"):
            ipa = snd["ipa"]
            break

    senses_out: list[dict] = []
    is_lemma = False
    for s in entry.get("senses", []) or []:
        glosses = s.get("glosses") or s.get("raw_glosses")
        if not glosses:
            continue
        gloss = glosses[-1]  # kaikki nests broad→specific; last is most precise
        examples = [
            e["text"] for e in (s.get("examples") or [])
            if isinstance(e, dict) and e.get("text")
        ][:MAX_EXAMPLES]
        tags = s.get("tags") or []
        if "form_of" not in s and "alt_of" not in s:
            is_lemma = True
        senses_out.append({"gloss": gloss, "examples": examples, "tags": tags})
        if len(senses_out) >= MAX_SENSES:
            break

    if not senses_out:
        return None

    return {
        "word": word.lower(),
        "lang": lang_code,
        "pos": entry.get("pos"),
        "ipa": ipa,
        "etymology_number": entry.get("etymology_number"),
        "is_lemma": is_lemma,
        "senses": senses_out,
    }


def import_lang(lang_code: str, jsonl_path: Path) -> None:
    print(f"importing {lang_code} from {jsonl_path.name} "
          f"({jsonl_path.stat().st_size / 1e9:.2f} GB)...", file=sys.stderr)
    batch: list[dict] = []
    total = 0
    seen_lines = 0
    with jsonl_path.open() as f:
        for line in f:
            seen_lines += 1
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            row = parse_entry(entry, lang_code)
            if row is None:
                continue
            batch.append(row)
            if len(batch) >= BATCH_SIZE:
                post_batch(batch)
                total += len(batch)
                batch.clear()
                if total % 20000 == 0:
                    print(f"  {lang_code}: {total:,} rows imported "
                          f"({seen_lines:,} lines read)", file=sys.stderr)
    if batch:
        post_batch(batch)
        total += len(batch)
    print(f"{lang_code} import complete — {total:,} rows "
          f"({seen_lines:,} lines read)", file=sys.stderr)


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: import-wiktionary.py <lang_code> <jsonl_path>", file=sys.stderr)
        sys.exit(1)
    lang_code = sys.argv[1]
    jsonl_path = Path(sys.argv[2])
    if not jsonl_path.is_absolute():
        jsonl_path = HERE / jsonl_path
    t0 = time.time()
    import_lang(lang_code, jsonl_path)
    print(f"{lang_code}: {time.time() - t0:.1f}s total", file=sys.stderr)


if __name__ == "__main__":
    main()
