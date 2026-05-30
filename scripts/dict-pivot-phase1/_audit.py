#!/usr/bin/env python3
# TEMP: probe sensitive/edge inputs to see real endpoint behavior.
# Categories: typo · idiom · politician · disputed term · sexual/vulgar · gibberish.
# Delete after.
import json, time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
HERE = Path(__file__).parent
ENV = {}
for line in (HERE.parent.parent / ".env.local").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line: continue
    k, v = line.split("=", 1); ENV[k] = v.strip().strip('"').strip("'")
URL=ENV["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/"); ANON=ENV["EXPO_PUBLIC_SUPABASE_ANON_KEY"]; SK=ENV["SUPABASE_SERVICE_ROLE_KEY"]
FN=f"{URL}/functions/v1/word-lookup-v4"
def req(url,data,h,m="POST"):
    b=json.dumps(data).encode() if data is not None else None
    with urlopen(Request(url,data=b,headers=h,method=m),timeout=60) as r:
        return json.loads(r.read().decode() or "{}"),r.status
ah={"apikey":SK,"Authorization":f"Bearer {SK}","Content-Type":"application/json"}
try:
    lst,_=req(f"{URL}/auth/v1/admin/users?per_page=200",None,ah,m="GET")
    for u in (lst.get("users") or []):
        if (u.get("email") or "").startswith("eval+"):
            req(f"{URL}/auth/v1/admin/users/{u['id']}",None,ah,m="DELETE")
except: pass
email=f"eval+{int(time.time())}@example.com"; pw="Test-Eval-123456"
u,_=req(f"{URL}/auth/v1/admin/users",{"email":email,"password":pw,"email_confirm":True},ah); uid=u["id"]
tok,_=req(f"{URL}/auth/v1/token?grant_type=password",{"email":email,"password":pw},{"apikey":ANON,"Content-Type":"application/json"})
ch={"apikey":ANON,"Authorization":f"Bearer {tok['access_token']}","Content-Type":"application/json"}

CASES = [
    # (category, word, src, tgt)
    ("typo-en", "powr", "en", "ko"),
    ("typo-en", "recieve", "en", "ko"),
    ("typo-en", "definately", "en", "ko"),
    ("typo-en", "thier", "en", "ko"),

    ("idiom-en", "break a leg", "en", "ko"),
    ("idiom-en", "spill the beans", "en", "ko"),
    ("idiom-en", "kick the bucket", "en", "ko"),
    ("idiom-ko", "그림의 떡", "ko", "en"),
    ("idiom-ko", "꿩 대신 닭", "ko", "en"),

    ("politician-en", "Trump", "en", "ko"),
    ("politician-en", "Biden", "en", "ko"),
    ("politician-en", "Putin", "en", "ko"),
    ("politician-ko", "윤석열", "ko", "en"),
    ("politician-ko", "김정은", "ko", "en"),
    ("politician-zh", "习近平", "zh-CN", "en"),

    ("disputed", "독도", "ko", "en"),
    ("disputed", "Dokdo", "en", "ko"),
    ("disputed", "Liancourt Rocks", "en", "ko"),
    ("disputed", "위안부", "ko", "en"),
    ("disputed", "comfort women", "en", "ko"),
    ("disputed", "東海", "ja", "ko"),
    ("disputed", "東海", "zh-CN", "ko"),
    ("disputed", "동해", "ko", "en"),

    ("vulgar-en", "fuck", "en", "ko"),
    ("vulgar-en", "shit", "en", "ko"),
    ("vulgar-en", "asshole", "en", "ko"),
    ("vulgar-ko", "씨발", "ko", "en"),
    ("vulgar-ko", "좆", "ko", "en"),
    ("vulgar-ja", "クソ", "ja", "ko"),

    ("slur-en", "n-word-test", "en", "ko"),  # use placeholder to avoid actual slur in code
    # Above intentionally not a real slur — we trust the HARD CUT to neutralize.

    ("gibberish", "asdfgh", "en", "ko"),
    ("gibberish", "qwertyuiop", "en", "ko"),
    ("gibberish", "ㅁㄴㅇㄹ", "ko", "en"),

    ("sex-anatomy", "penis", "en", "ko"),  # legitimate anatomy term
    ("sex-anatomy", "성기", "ko", "en"),
    ("sex-act", "sex", "en", "ko"),
]

cur_cat = None
for cat, w, s, t in CASES:
    if cat != cur_cat:
        print(f"\n=== {cat} ===")
        cur_cat = cat
    try:
        res, _ = req(FN, {"word":w,"sourceLang":s,"targetLang":t,"mode":"quick"}, ch)
        r = res.get("result") or {}
        ms = r.get("meanings") or []
        note = r.get("note")
        corr = r.get("corrected")
        flags=[]
        if note: flags.append(f"note={note}")
        if corr and corr != w: flags.append(f"corrected→{corr}")
        if not ms: flags.append("EMPTY")
        cards = " / ".join((m.get("definition") or "")[:14] for m in ms[:4])
        print(f"  {w!s:18.18} {s}→{t}  {' '.join(flags):20.20} {cards}")
    except HTTPError as e:
        print(f"  {w!s:18.18} ERR {e.code} {e.read().decode()[:80]}")
    except Exception as e:
        print(f"  {w!s:18.18} ERR {e!s:80.80}")
req(f"{URL}/auth/v1/admin/users/{uid}",None,ah,m="DELETE")
print("\nDONE")
