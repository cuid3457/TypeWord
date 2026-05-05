# Curated Wordlist Population

Pre-generates content for `curated_wordlists` / `curated_words` so users can
add test prep / topic packs to their personal library without paying for
live OpenAI calls.

## Setup

1. Add the **service role key** to `.env.local` (uncomment + paste from
   Supabase Dashboard → Project Settings → API → `service_role` key):

   ```
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```

2. Install deps if not already:

   ```
   npm install dotenv
   ```

## Run

```bash
node scripts/curation/curate-wordlist.js scripts/curation/data/hsk-1.json
```

Re-running is safe — already-populated words are skipped unless `--force`
is passed.

## Adding a new wordlist

1. Create `data/<slug>.json` with the spec format described in the script
   header.
2. Run the script with that file.

## Scope A roadmap (initial content)

Already prepared:
- ✅ `hsk-1.json` — HSK Level 1 (150 official words, target: ko + en)

To add (use HSK Standard Course, TOPIK 등급별 어휘 가이드, AWL Coxhead 2000):
- HSK 2-6 (further 2,500 words)
- TOPIK 1-6 등급별 어휘 (~6,000 words)
- AWL Sublists 1-10 (570 academic English words)

## Cost estimate

Per word per target_lang ≈ $0.001-0.003 (gpt-4o-mini enrich call).
HSK 1 alone (150 words × 2 target langs) ≈ $0.50.
Full Scope A ≈ $80-120 one-time.

## Verification

After running, check via:

```sql
SELECT slug, source_lang, word_count FROM curated_wordlists ORDER BY display_order;
SELECT word, jsonb_object_keys(results_by_target_lang) AS target_lang
  FROM curated_words WHERE curated_wordlist_id = '<id>'
  LIMIT 10;
```

In the app: `+ 새 단어장` → `시험 대비 / 추천 단어장` → list should appear.
