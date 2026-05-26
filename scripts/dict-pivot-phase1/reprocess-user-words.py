#!/usr/bin/env python3
"""User_words에 실제 들어있는 단어들만 v4로 재처리.

흐름:
  1. user_words + books JOIN으로 distinct (word, source_lang, target_lang, reading_key) 추출
  2. word_entries에서 user_words에 없는 단어들 삭제 (캐시 정리)
  3. distinct 단어들을 v4 edge function으로 재호출 → DB 캐시 새로 채움
  4. user_words.result_json도 v4 결과로 업데이트
"""
from __future__ import annotations

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent

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
ANON_KEY = ENV["EXPO_PUBLIC_SUPABASE_ANON_KEY"]
SERVICE_KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]

REST_URL = f"{SUPABASE_URL}/rest/v1"
FN_URL = f"{SUPABASE_URL}/functions/v1/word-lookup-v4"

SERVICE_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}
ANON_HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
}


def http_get(url: str) -> bytes:
    req = Request(url, headers=SERVICE_HEADERS)
    with urlopen(req, timeout=30) as r:
        return r.read()


def fetch_user_words_distinct() -> list[dict]:
    """user_words + books JOIN으로 (word, source_lang, target_lang, reading_key) distinct."""
    out: list[dict] = []
    offset = 0
    page_size = 1000
    while True:
        url = (
            f"{REST_URL}/user_words"
            f"?select=word,reading_key,book:books!inner(source_lang,target_lang)"
            f"&limit={page_size}&offset={offset}"
        )
        data = json.loads(http_get(url))
        if not data:
            break
        for row in data:
            book = row.get("book") or {}
            src = book.get("source_lang")
            tgt = book.get("target_lang")
            if not src or not tgt:
                continue
            out.append({
                "word": row["word"],
                "reading_key": row.get("reading_key") or "",
                "source_lang": src,
                "target_lang": tgt,
            })
        if len(data) < page_size:
            break
        offset += page_size

    # Distinct (word, source_lang, target_lang, reading_key)
    seen: set[tuple[str, str, str, str]] = set()
    distinct: list[dict] = []
    for r in out:
        key = (r["word"], r["source_lang"], r["target_lang"], r["reading_key"])
        if key in seen:
            continue
        seen.add(key)
        distinct.append(r)
    return distinct


def delete_orphan_word_entries(user_word_set: set[tuple[str, str]]) -> int:
    """user_words에 없는 word_entries row 삭제. (word, word_lang) 기준."""
    url = f"{REST_URL}/word_entries?select=id,word,word_lang"
    rows = json.loads(http_get(url))
    to_delete: list[str] = []
    for r in rows:
        key = (r["word"], r["word_lang"])
        if key not in user_word_set:
            to_delete.append(r["id"])
    if not to_delete:
        return 0
    # 100개씩 batch delete (URL 길이 제한 회피)
    BATCH = 100
    for i in range(0, len(to_delete), BATCH):
        chunk = to_delete[i:i + BATCH]
        ids = ",".join(chunk)
        url = f"{REST_URL}/word_entries?id=in.({ids})"
        req = Request(url, headers=SERVICE_HEADERS, method="DELETE")
        urlopen(req, timeout=30).read()
    return len(to_delete)


def call_v4(word: str, source_lang: str, target_lang: str) -> dict:
    body = json.dumps({
        "word": word,
        "sourceLang": source_lang,
        "targetLang": target_lang,
    }).encode()
    req = Request(FN_URL, data=body, headers=ANON_HEADERS, method="POST")
    try:
        with urlopen(req, timeout=90) as r:
            return json.loads(r.read())
    except HTTPError as exc:
        return {"error": f"HTTP {exc.code}", "body": exc.read().decode(errors="replace")[:200]}


def update_user_words_result(word: str, source_lang: str, target_lang: str, result: dict) -> None:
    """user_words.result_json을 v4 결과로 업데이트.
    같은 word + 해당 source/target_lang book에 속하는 모든 row.
    """
    # books.id with this (source_lang, target_lang)
    books_url = (
        f"{REST_URL}/books?select=id"
        f"&source_lang=eq.{quote(source_lang)}"
        f"&target_lang=eq.{quote(target_lang)}"
    )
    books = json.loads(http_get(books_url))
    book_ids = [b["id"] for b in books]
    if not book_ids:
        return
    ids_str = ",".join(book_ids)
    url = (
        f"{REST_URL}/user_words?word=eq.{quote(word)}"
        f"&book_id=in.({ids_str})"
    )
    body = json.dumps({"result_json": result, "updated_at": "now()"}).encode()
    req = Request(url, data=body, headers={**SERVICE_HEADERS, "Prefer": "return=minimal"}, method="PATCH")
    urlopen(req, timeout=30).read()


def process_one(entry: dict) -> dict:
    word = entry["word"]
    src = entry["source_lang"]
    tgt = entry["target_lang"]
    t0 = time.time()
    try:
        resp = call_v4(word, src, tgt)
        if "error" in resp:
            return {"word": word, "src": src, "tgt": tgt, "status": "error", "msg": resp.get("error")}
        update_user_words_result(word, src, tgt, resp.get("result", {}))
        return {
            "word": word, "src": src, "tgt": tgt,
            "status": "ok",
            "cached": resp.get("cached"),
            "meanings_n": len(resp.get("result", {}).get("meanings", [])),
            "elapsed": time.time() - t0,
        }
    except Exception as exc:
        return {"word": word, "src": src, "tgt": tgt, "status": "exc", "msg": str(exc)}


def main() -> None:
    print("─── Step 1: distinct user_words 추출 ───", flush=True)
    distinct = fetch_user_words_distinct()
    print(f"  total distinct entries: {len(distinct)}", flush=True)

    user_word_set: set[tuple[str, str]] = {
        (e["word"], e["source_lang"]) for e in distinct
    }

    print("\n─── Step 2: word_entries 정리 ───", flush=True)
    n_del = delete_orphan_word_entries(user_word_set)
    print(f"  orphan word_entries deleted: {n_del}", flush=True)

    print("\n─── Step 3: v4 재처리 (병렬) ───", flush=True)
    n_ok = 0
    n_err = 0
    n_total = len(distinct)
    t_start = time.time()

    # 외부 API rate limit 고려: 동시 5 worker
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(process_one, e) for e in distinct]
        for i, fut in enumerate(as_completed(futures), 1):
            r = fut.result()
            if r["status"] == "ok":
                n_ok += 1
            else:
                n_err += 1
                if n_err <= 20:
                    print(f"  [err] {r['word']} ({r['src']}→{r['tgt']}): {r.get('msg','?')[:120]}", flush=True)
            if i % 50 == 0 or i == n_total:
                elapsed = time.time() - t_start
                rate = i / elapsed if elapsed else 0
                eta = (n_total - i) / rate if rate else 0
                print(
                    f"  progress {i}/{n_total}  ok={n_ok} err={n_err}  "
                    f"rate={rate:.1f}/s  eta={eta:.0f}s",
                    flush=True,
                )

    print(f"\n완료 — total={n_total} ok={n_ok} err={n_err} elapsed={time.time()-t_start:.0f}s", flush=True)


if __name__ == "__main__":
    main()
