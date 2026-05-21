# V1 word-lookup snapshot — 2026-05-13

This directory is a **safety snapshot** of the v1 word-lookup edge function
and its shared dependencies, captured before deploying word-lookup-v2.

## What's preserved here

```
word-lookup/index.ts         — v1 edge function (unchanged from production)
_shared/
  prompts.ts                 — v1 single-prompt system (unchanged)
  normalize.ts               — v1 post-processing pipeline (unchanged)
  cache.ts                   — v1 cache module (global_word_cache) (unchanged)
  disputes.ts                — Korea-position rules + INPUT_REDIRECTS (RESTORED)
  types.ts                   — WordLookupResult shape (unchanged)
  openai.ts                  — OpenAI client (unchanged)
  lexicon.ts                 — lexicon classification (unchanged)
  numerals.ts                — dual-numeral overrides (unchanged)
  limits.ts                  — rate limiting (unchanged)
  logging.ts                 — api_calls logging (unchanged)
```

## Important: what's DIFFERENT from current main tree

During v2 work, two shared files in the main tree (`_shared/`) were
modified. The archived copies in `_shared/` here have been **restored to v1
behavior**:

### disputes.ts
- **INPUT_REDIRECTS**: in the main tree this is now `{}` (empty); the
  archived copy has the original silent-redirect rules (일본해→동해,
  takeshima→Dokdo, 장백산→백두산, etc.).
- **SENSITIVE_LOOKUPS_BY_LANG + isSensitiveLookup + getSensitiveLookupHint**:
  these were added during v2 work. The archived copy KEEPS them — they are
  additive (v1 doesn't call them, so they don't affect v1 behavior).

### types.ts
- The `ipa?: string` field was added to `WordLookupResult` during v2 work.
  This is additive — v1 already handled missing `ipa` gracefully.

## What ACTUAL rollback insurance is

The truly safe rollback strategy is **architectural, not file-based**:

1. **Production v1 is preserved on Supabase Edge Functions** as long as we
   do NOT run `supabase functions deploy word-lookup`. The deployed bundle
   stays as-is regardless of local file changes.
2. **word-lookup-v2 deploys as a separate function** — the v2 deployment
   creates `/functions/v1/word-lookup-v2`, leaving `/functions/v1/word-lookup`
   untouched.
3. **Client opt-in via feature flag** — only when the client flag is set
   does the v2 endpoint receive traffic. To roll back, flip the flag off:
   100% of traffic returns to v1 with zero deployment.
4. **`global_word_cache` table is untouched** — v2 uses new tables
   (`word_entries`, `word_translations`). The v1 cache is preserved.

## How to use this snapshot

### Scenario A: roll back to v1 (recommended)
1. Set client feature flag → v1 endpoint
2. Done. No file changes needed. v1 production keeps running.

### Scenario B: redeploy v1 from this snapshot (if needed)
1. Stop v2 traffic (feature flag off)
2. Copy these files back over the main tree:
   - `word-lookup/index.ts` → `supabase/functions/word-lookup/index.ts`
   - `_shared/*.ts` → `supabase/functions/_shared/` (overwrite)
3. `supabase functions deploy word-lookup`
4. Note: copying `_shared/disputes.ts` back will REMOVE the v2 additions
   (SENSITIVE_LOOKUPS_BY_LANG etc.), but v1 doesn't use them so safe.

### Scenario C: leave v2 running, archive for reference only
Keep this directory as-is. Don't redeploy v1. Use as reference if questions
come up about prior behavior.

## Tables to back up at the DB layer (separate from this directory)

- `global_word_cache` — v1's cache; preserved automatically (v2 doesn't write to it)
- `api_calls` — preserved (v2 logs separately by endpoint)

No DB backup needed unless you plan to drop these tables. v1 data is safe.

## Generated at: 2026-05-13
