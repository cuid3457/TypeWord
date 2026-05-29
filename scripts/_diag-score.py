#!/usr/bin/env python3
# Reproduce the SCORE-phase OpenAI call for 'power' to see why judged=0.
# Pulls power senses from wiktionary_entries, builds the same prompt the
# edge function uses, and prints the model's score response + id matching.
import json, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
ENV = {}
for line in (HERE.parent / ".env.local").read_text().splitlines():
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        ENV[k] = v.strip().strip('"').strip("'")

SB = ENV["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]
OAI = ENV["OPENAI_API_KEY"]

# 1. fetch power senses from DB (mirror wiktionary.ts sense_id construction)
req = urllib.request.Request(
    f"{SB}/rest/v1/wiktionary_entries?word=eq.power&lang=eq.en&select=pos,senses",
    headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
rows = json.loads(urllib.request.urlopen(req).read())
sense_lines = []
for entIdx, row in enumerate(rows):
    for sIdx, s in enumerate(row.get("senses", [])):
        sid = f"{entIdx}_{sIdx}:0"
        gloss = (s.get("gloss") or "")[:160]
        sense_lines.append(f"- id={sid}  POS={row.get('pos') or ''}  GRADE=  EN=  SOURCE_DEF={gloss}")
        if len(sense_lines) >= 24:
            break
    if len(sense_lines) >= 24:
        break

print(f"built {len(sense_lines)} sense lines. sample ids: {[l.split('  ')[0] for l in sense_lines[:3]]}")

SCORE_SYSTEM = """You are a vocabulary frequency analyst for language learners.
Given a headword W in SOURCE_LANG and its dictionary sense candidates, assign each sense a frequency_score (0-100).
Output strict JSON (no reasoning field):
{ "scores": [ { "id": "<sense_id>", "frequency_score": <0-100> } ] }"""

user = f"SOURCE_LANG=English\nW=\"power\"\nSense candidates:\n" + "\n".join(sense_lines)

body = json.dumps({
    "model": "gpt-4.1-mini", "temperature": 0,
    "messages": [{"role":"system","content":SCORE_SYSTEM},{"role":"user","content":user}],
    "response_format": {"type":"json_object"},
}).encode()
r = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body,
    headers={"Authorization":f"Bearer {OAI}","Content-Type":"application/json"})
resp = json.loads(urllib.request.urlopen(r).read())
content = json.loads(resp["choices"][0]["message"]["content"])
scores = content.get("scores", [])
print(f"\nmodel returned {len(scores)} scores")
returned_ids = {s['id'] for s in scores}
input_ids = {l.split('  ')[0].replace('- id=','') for l in sense_lines}
print(f"input ids sample:    {sorted(list(input_ids))[:4]}")
print(f"returned ids sample: {sorted(list(returned_ids))[:4]}")
matched = input_ids & returned_ids
print(f"ID MATCH: {len(matched)}/{len(input_ids)} input ids found in response")
kept = [s for s in scores if s.get('frequency_score',0) >= 30 and s['id'] in input_ids]
print(f"kept (score>=30 AND id matched): {len(kept)}")
for s in sorted(scores, key=lambda x: -x.get('frequency_score',0))[:8]:
    print(f"  {s['id']}: {s.get('frequency_score')}")
