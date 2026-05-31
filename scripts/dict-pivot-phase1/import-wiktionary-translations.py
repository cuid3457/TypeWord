#!/usr/bin/env python3
"""Import multilingual translations from kaikki wiktextract JSONL into
wiktionary_translations.

Per kaikki entry, the `translations` field is an array like:
    [{"code": "ko", "lang": "Korean", "word": "개", "sense": "animal"}, ...]
We filter to our 8 target langs (ko/ja/zh-CN/en/es/fr/de/it) and flatten each
into one row of wiktionary_translations: (source_word, source_lang) →
(target_word, target_lang) with optional sense_hint + pos + etymology_number.

zh handling: kaikki uses 'zh' (generic Chinese) and 'cmn' (Mandarin), both of
which we map to our 'zh-CN' bucket. 'yue' / 'wuu' / other Chinese variants
are dropped — our app only supports zh-CN.

Usage:
  python3 import-wiktionary-translations.py en downloads/kaikki-en.jsonl
  python3 import-wiktionary-translations.py de downloads/kaikki-de.jsonl

Re-runnable: delete rows for the source_lang first, then re-import:
  DELETE FROM wiktionary_translations WHERE source_lang='en';
"""

from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
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

BATCH_SIZE = 1000
MAX_TRANSLATIONS_PER_ENTRY = 30  # cap pathological cases

# kaikki language code → our app's target_lang.
# 'zh' (generic Chinese) + 'cmn' (Mandarin) both map to zh-CN (our only Chinese variant).
LANG_MAP: dict[str, str] = {
    "ko": "ko",
    "ja": "ja",
    "zh": "zh-CN",
    "cmn": "zh-CN",
    "en": "en",
    "es": "es",
    "fr": "fr",
    "de": "de",
    "it": "it",
}

# Strip parentheticals / brackets / annotations from target_word so reverse
# lookup matches on the bare form. Wiktionary translations are normally clean
# but some have inline gloss like "Hund (m)" or "犬 (いぬ)".
PAREN_RE = re.compile(r"\s*[\(（\[【].*?[\)）\]】]\s*")
# Trim trailing punctuation. Keep CJK chars / Latin diacritics intact.
TRAIL_PUNCT_RE = re.compile(r"[\s,，、;；/／·・|｜.。\.]+$")


def clean_target_word(raw: str) -> str:
    if not raw:
        return ""
    s = raw.strip()
    s = PAREN_RE.sub(" ", s)
    s = TRAIL_PUNCT_RE.sub("", s).strip()
    # Some kaikki entries embed multiple variants separated by "/" — keep first.
    if "/" in s:
        s = s.split("/", 1)[0].strip()
    return s


# Script-validity check per target_lang.
# Wiktionary editors sometimes paste transliterations as the "word" field
# (e.g. zh translation = "хуадян" Cyrillic transliteration of 字典). These are
# noise for learners — a Korean user typing 사전 to find Chinese candidates
# expects 字典 not "цзыдянь". We require the target_word to be in the script
# block(s) appropriate for its target_lang. Punctuation/whitespace/hyphens
# allowed everywhere as connectives.
HANGUL_BLOCKS = (("가", "힯"), ("ᄀ", "ᇿ"), ("㄰", "㆏"))
KANA_BLOCKS = (("぀", "ゟ"), ("゠", "ヿ"), ("ㇰ", "ㇿ"))
CJK_BLOCKS = (("一", "鿿"), ("㐀", "䶿"), ("豈", "﫿"))
CJK_PUNCT = (("　", "〿"), ("＀", "￯"))

CONNECTORS = set(" -'·・〜~")


def _in_blocks(ch: str, blocks: tuple) -> bool:
    return any(lo <= ch <= hi for lo, hi in blocks)


def is_valid_for_target(target_lang: str, target_word: str) -> bool:
    if not target_word:
        return False
    for ch in target_word:
        if ch in CONNECTORS:
            continue
        if target_lang == "ko":
            if not _in_blocks(ch, HANGUL_BLOCKS):
                # Allow CJK kanji (인명/한자어) and standard punct
                if not (_in_blocks(ch, CJK_BLOCKS) or _in_blocks(ch, CJK_PUNCT)):
                    return False
        elif target_lang == "ja":
            if not (
                _in_blocks(ch, KANA_BLOCKS)
                or _in_blocks(ch, CJK_BLOCKS)
                or _in_blocks(ch, CJK_PUNCT)
            ):
                return False
        elif target_lang == "zh-CN":
            if not (_in_blocks(ch, CJK_BLOCKS) or _in_blocks(ch, CJK_PUNCT)):
                return False
        else:
            # Latin-script langs (en/es/fr/de/it): require Letter/Mark category.
            cat = unicodedata.category(ch)
            if not (cat.startswith("L") or cat.startswith("M")):
                return False
    return True


def post_batch(rows: list[dict]) -> None:
    body = json.dumps(rows).encode()
    req = Request(
        f"{REST_URL}/wiktionary_translations",
        data=body,
        headers=HEADERS,
        method="POST",
    )
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


def parse_entry(entry: dict, source_lang: str) -> list[dict]:
    """Extract translation rows from one kaikki entry, filtering to our 8 langs."""
    if entry.get("lang_code") != source_lang:
        return []

    src_word = (entry.get("word") or "").strip().lower()
    if not src_word:
        return []

    pos = entry.get("pos")
    ety = entry.get("etymology_number")

    translations = entry.get("translations") or []
    if not translations:
        return []

    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()  # dedup (target_lang, target_word) within one entry
    for t in translations:
        if not isinstance(t, dict):
            continue
        code = t.get("code") or t.get("lang_code")
        if not code:
            continue
        target_lang = LANG_MAP.get(code)
        if not target_lang:
            continue
        if target_lang == source_lang:
            continue  # self-translation noise
        raw = t.get("word")
        if not raw:
            continue
        target_word = clean_target_word(raw)
        if not target_word or len(target_word) > 80:
            continue
        if not is_valid_for_target(target_lang, target_word):
            continue
        key = (target_lang, target_word)
        if key in seen:
            continue
        seen.add(key)
        sense = t.get("sense")
        if isinstance(sense, str) and len(sense) > 200:
            sense = sense[:200]
        rows.append({
            "source_word": src_word,
            "source_lang": source_lang,
            "source_pos": pos,
            "source_etymology_number": ety,
            "target_lang": target_lang,
            "target_word": target_word,
            "sense_hint": sense if sense else None,
        })
        if len(rows) >= MAX_TRANSLATIONS_PER_ENTRY:
            break
    return rows


def import_lang(source_lang: str, jsonl_path: Path) -> None:
    print(f"importing {source_lang} translations from {jsonl_path.name} "
          f"({jsonl_path.stat().st_size / 1e9:.2f} GB)...", file=sys.stderr)
    batch: list[dict] = []
    total = 0
    seen_lines = 0
    entries_with_translations = 0
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
            rows = parse_entry(entry, source_lang)
            if not rows:
                continue
            entries_with_translations += 1
            batch.extend(rows)
            if len(batch) >= BATCH_SIZE:
                post_batch(batch)
                total += len(batch)
                batch.clear()
                if total % 50000 == 0:
                    print(
                        f"  {source_lang}: {total:,} rows imported "
                        f"({entries_with_translations:,} entries / "
                        f"{seen_lines:,} lines read)",
                        file=sys.stderr,
                    )
    if batch:
        post_batch(batch)
        total += len(batch)
    print(
        f"{source_lang} translations import complete — {total:,} rows "
        f"({entries_with_translations:,} entries with translations / "
        f"{seen_lines:,} lines read)",
        file=sys.stderr,
    )


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: import-wiktionary-translations.py <source_lang> <jsonl_path>", file=sys.stderr)
        sys.exit(1)
    source_lang = sys.argv[1]
    jsonl_path = Path(sys.argv[2])
    if not jsonl_path.is_absolute():
        jsonl_path = HERE / jsonl_path
    t0 = time.time()
    import_lang(source_lang, jsonl_path)
    print(f"{source_lang}: {time.time() - t0:.1f}s total", file=sys.stderr)


if __name__ == "__main__":
    main()
