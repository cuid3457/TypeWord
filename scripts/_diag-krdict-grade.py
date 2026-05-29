#!/usr/bin/env python3
# Inspect krdict entries for a word: per-entry word_grade + senses + en gloss.
# Goal: see whether word_grade is a usable frequency signal (e.g. glass 杯 =
# no-grade/archaic, pear = beginner).
import json, re, urllib.request, sys
from pathlib import Path
from urllib.parse import quote

HERE = Path(__file__).parent
ENV = {}
for p in [HERE / "dict-pivot-phase1" / ".env", HERE.parent / ".env.local"]:
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                ENV.setdefault(k, v.strip().strip('"').strip("'"))

KEY = ENV["KRDICT_API_KEY"]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
HEADERS = {"User-Agent": UA, "Referer": "https://krdict.korean.go.kr/", "Accept": "*/*"}

def tag(block, t):
    m = re.search(rf"<{t}>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))</{t}>", block)
    return (m.group(1) or m.group(2) or "").strip() if m else ""

def blocks(s, t):
    return re.findall(rf"<{t}>[\s\S]*?</{t}>", s)

word = sys.argv[1] if len(sys.argv) > 1 else "배"
url = (f"https://krdict.korean.go.kr/api/search?key={KEY}&q={quote(word)}"
       f"&part=word&num=20&advanced=y&method=exact&translated=y&trans_lang=1")
xml = urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS)).read().decode()
items = blocks(xml, "item")
print(f"q={word} total={tag(xml,'total')} items={len(items)}\n")
for it in items:
    w = tag(it, "word")
    if w != word:
        print(f"  (skip word='{w}')")
        continue
    tc = tag(it, "target_code"); sup = tag(it, "sup_no"); grade = tag(it, "word_grade") or "(none)"
    print(f"■ {w}#{sup} tc={tc} grade={grade}")
    for s in blocks(it, "sense"):
        defi = tag(s, "definition")[:50]
        tw = tag(blocks(s, "translation")[0], "trans_word") if blocks(s, "translation") else ""
        print(f"    [{tag(s,'sense_order')}] {tw} — {defi}")
