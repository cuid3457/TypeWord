// sync-user-words
// -----------------------------------------------------------
// Server-side bulk refresh of a logged-in user's user_words rows
// against the v2 canonical cache (word_entries + word_translations).
//
// Replaces the per-word lookupV2 loop that the client used in
// userWordsSyncService. That loop took 5-15 minutes for ~300 words;
// this RPC does the same work in ~1-3 seconds because:
//   • Reads are batched (one query per table per source_lang).
//   • Stitching happens in-process (no extra round-trip per word).
//   • Updates are written in parallel via supabase-js.
//
// After this function patches the server-side user_words.result_json
// (+ updated_at), the client's existing syncAll → pullWords mechanism
// downloads the diff to local on the next sync cycle. No extra client
// changes needed for the pull side.
//
// Auth: REQUIRES a user JWT (not service-role). The function only
// touches rows belonging to the authenticated user.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

import {
  PROMPT_VERSION_V2,
  type WordEntry,
  type WordTranslation,
} from "../_shared/cache-v2.ts";
import { stitchAndNormalize } from "../_shared/stitch.ts";

const ALLOWED_ORIGINS = new Set([
  "https://moavoca.com", "https://www.moavoca.com",
  "http://localhost:8081", "http://localhost:19006", "http://localhost:4173",
  "https://typeword.app", "https://www.typeword.app",
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

let _corsHeaders: Record<string, string> = {};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ..._corsHeaders },
  });
}

function getAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

interface BookCtx {
  id: string;
  source_lang: string;
  target_lang: string | null;
}

interface UserWordRow {
  id: string;
  book_id: string;
  word: string;
  reading_key: string | null;
  result_json: unknown;
  updated_at: string;
}

interface EntryRow {
  id: string;
  word: string;
  word_lang: string;
  headword: string;
  ipa: string | null;
  reading: string[] | null;
  confidence: number;
  note: string | null;
  original_input: string | null;
  meanings: unknown[];
  synonyms: string[];
  antonyms: string[];
  examples: unknown[];
  has_enrich: boolean;
  model: string;
  prompt_version: string;
  updated_at: string;
}

interface TranslationRow {
  id: string;
  word_entry_id: string;
  target_lang: string;
  meanings_translated: unknown[];
  examples_translated: unknown[];
  model: string;
  prompt_version: string;
  updated_at: string;
}

Deno.serve(async (req: Request) => {
  _corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: _corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "Missing Authorization header" }, 401);

  // SECURITY: do NOT trust the JWT's `sub` or `role` payload — those are
  // base64-decoded without signature verification. A forged JWT with
  // `role:"service_role"` previously slipped through. Use Supabase's
  // getUser() (verifies signature) for user tokens; constant-time-compare
  // against the env secret for service-role.
  const envSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  function timingSafeEq(a: string, b: string): boolean {
    if (a.length !== b.length || a.length === 0) return false;
    const ae = new TextEncoder().encode(a);
    const be = new TextEncoder().encode(b);
    let diff = 0;
    for (let i = 0; i < ae.byteLength; i++) diff |= ae[i] ^ be[i];
    return diff === 0;
  }
  const isServiceRole = envSecret.length > 0 && timingSafeEq(jwt, envSecret);

  const admin = getAdmin();

  let userId: string | undefined;
  if (isServiceRole) {
    // Admin scripts / cache-refresh tools must pass explicit user_id.
    try {
      const body = (await req.clone().json()) as Record<string, unknown>;
      if (typeof body.user_id === "string") userId = body.user_id;
    } catch { /* no body */ }
  } else {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data?.user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }
    userId = data.user.id;
  }
  if (!userId) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }
  const started = Date.now();

  // ── 1. Read all user_words for this user ──
  const { data: userWords, error: uwErr } = await admin
    .from("user_words")
    .select("id, book_id, word, reading_key, result_json, updated_at")
    .eq("user_id", userId);
  if (uwErr) return jsonResponse({ error: `read user_words: ${uwErr.message}` }, 500);
  if (!userWords || userWords.length === 0) {
    return jsonResponse({ refreshed: 0, total: 0, durationMs: Date.now() - started });
  }

  // ── 2. Read books to get source/target lang context ──
  const bookIds = Array.from(new Set(userWords.map((w: UserWordRow) => w.book_id).filter(Boolean)));
  const { data: books, error: bErr } = await admin
    .from("books")
    .select("id, source_lang, target_lang")
    .in("id", bookIds);
  if (bErr) return jsonResponse({ error: `read books: ${bErr.message}` }, 500);
  const bookMap = new Map<string, BookCtx>();
  for (const b of (books ?? []) as BookCtx[]) bookMap.set(b.id, b);

  // ── 3. Bulk fetch word_entries (current prompt_version only). ──
  // Group by source_lang for batched IN queries.
  const wordsByLang = new Map<string, Set<string>>();
  for (const uw of userWords as UserWordRow[]) {
    const book = bookMap.get(uw.book_id);
    if (!book) continue;
    const set = wordsByLang.get(book.source_lang) ?? new Set();
    set.add(uw.word.trim().toLowerCase());
    wordsByLang.set(book.source_lang, set);
  }

  const entriesByKey = new Map<string, EntryRow>(); // `${lang}|${word}` -> entry
  // Chunk into batches of 100. 500 was the previous setting but for CJK
  // multi-byte words encoded as UUIDs (or for translation_id batches), the
  // resulting URL exceeded the Edge Function HTTP client limit and failed
  // silently. 100 keeps the URL safely under ~4KB.
  const ENTRY_CHUNK = 100;
  for (const [lang, wordSet] of wordsByLang.entries()) {
    const words = Array.from(wordSet);
    for (let i = 0; i < words.length; i += ENTRY_CHUNK) {
      const slice = words.slice(i, i + ENTRY_CHUNK);
      const { data: entries, error } = await admin
        .from("word_entries")
        .select(
          "id, word, word_lang, headword, ipa, reading, confidence, note, original_input, meanings, synonyms, antonyms, examples, has_enrich, model, prompt_version, updated_at",
        )
        .eq("word_lang", lang)
        // Accept both legacy v2/v3 (v7-2026-05-17) and current v4 (dict-first-v4) entries.
        // v4 entries use a different meanings shape and must skip stitch (see stitching block below).
        .in("prompt_version", [PROMPT_VERSION_V2, "dict-first-v4"])
        .in("word", slice);
      if (error) {
        console.warn(`word_entries batch ${lang}: ${error.message}`);
        continue;
      }
      for (const e of (entries ?? []) as EntryRow[]) {
        entriesByKey.set(`${lang}|${e.word}`, e);
      }
    }
  }

  // ── 4. Bulk fetch word_translations for fetched entry IDs. ──
  const entryIds = Array.from(new Set(Array.from(entriesByKey.values()).map((e) => e.id)));
  const targetLangs = Array.from(new Set(
    (books ?? []).map((b: BookCtx) => b.target_lang).filter((t): t is string => !!t),
  ));
  const translationsByKey = new Map<string, TranslationRow>(); // `${entry_id}|${target}`
  // Chunk size: 500 UUIDs in an IN() filter exceeds the Edge Function's
  // HTTP client URL length limit (each UUID = 36 chars + comma, ~19KB URL).
  // 100 keeps the URL under ~4KB which is safely within HTTP limits.
  const TRANS_CHUNK = 100;
  for (let i = 0; i < entryIds.length; i += TRANS_CHUNK) {
    const slice = entryIds.slice(i, i + TRANS_CHUNK);
    const { data: trans, error } = await admin
      .from("word_translations")
      .select(
        "id, word_entry_id, target_lang, meanings_translated, examples_translated, model, prompt_version, updated_at",
      )
      .in("word_entry_id", slice)
      .in("target_lang", targetLangs)
      // Same dual filter as entries — accept both v3 and v4 translations.
      .in("prompt_version", [PROMPT_VERSION_V2, "dict-first-v4"]);
    if (error) {
      console.warn(`word_translations batch ${i}: ${error.message}`);
      continue;
    }
    for (const t of (trans ?? []) as TranslationRow[]) {
      translationsByKey.set(`${t.word_entry_id}|${t.target_lang}`, t);
    }
  }

  // ── 5. Determine which user_words are stale + stitch new result ──
  interface Update {
    id: string;
    result_json: unknown;
  }
  const updates: Update[] = [];
  for (const uw of userWords as UserWordRow[]) {
    const book = bookMap.get(uw.book_id);
    if (!book) continue;
    const wordKey = uw.word.trim().toLowerCase();
    const entry = entriesByKey.get(`${book.source_lang}|${wordKey}`);
    if (!entry) continue; // server doesn't have this word at current version — skip

    const translation = book.target_lang
      ? translationsByKey.get(`${entry.id}|${book.target_lang}`) ?? null
      : null;

    // Stale check: server canonical (entry + optional translation) is
    // newer than the server-side user_words row. Using user_words.updated_at
    // as the watermark since cache_synced_at is a local-only column.
    const entryMs = new Date(entry.updated_at).getTime();
    const transMs = translation ? new Date(translation.updated_at).getTime() : 0;
    const maxServerMs = Math.max(entryMs, transMs);
    const userWordMs = new Date(uw.updated_at).getTime();
    if (userWordMs >= maxServerMs) continue;

    // v4 (dict-first-v4) bypasses stitch — the translation row is already in
    // user-facing shape (WordMeaning[] + WordExample[]). Apply the v4 path
    // whenever EITHER the entry or the translation is v4. Mixed cases (v3
    // entry + v4 translation patched by process-report) must NOT go through
    // stitch — stitch would read entry.examples (stale v3 canonical) and
    // overwrite the fresh v4 translation.
    const transV4 = (translation?.prompt_version ?? "") === "dict-first-v4";
    const entryV4 = entry.prompt_version === "dict-first-v4";
    if (entryV4 || transV4) {
      const result = {
        headword: entry.headword ?? entry.word,
        reading: entry.reading ?? undefined,
        ipa: entry.ipa ?? undefined,
        meanings: translation?.meanings_translated ?? [],
        examples: translation?.examples_translated ?? [],
        confidence: entry.confidence ?? undefined,
      };
      updates.push({ id: uw.id, result_json: result });
      continue;
    }

    // v3 legacy — Stitch with the shared pipeline.
    const stitchedResult = stitchAndNormalize(
      entry as unknown as WordEntry,
      (translation as unknown as WordTranslation | null) ?? null,
      book.target_lang ?? book.source_lang,
    );
    updates.push({ id: uw.id, result_json: stitchedResult });
  }

  // ── 6. Apply updates. Parallel updates via supabase-js (.update()). ──
  // user_words RLS won't let us bulk-upsert without all fields; sequential
  // single-row .update() calls scoped by id are safe and fast enough.
  let refreshed = 0;
  const failed: string[] = [];
  const CHUNK = 20;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    const results = await Promise.all(slice.map(async (u) => {
      const { error } = await admin
        .from("user_words")
        .update({ result_json: u.result_json, updated_at: new Date().toISOString() })
        .eq("id", u.id)
        .eq("user_id", userId);
      if (error) {
        failed.push(`${u.id.slice(0, 8)}: ${error.message}`);
        return false;
      }
      return true;
    }));
    refreshed += results.filter(Boolean).length;
  }

  return jsonResponse({
    total: userWords.length,
    stale: updates.length,
    refreshed,
    failed: failed.length,
    failedSample: failed.slice(0, 5),
    durationMs: Date.now() - started,
  });
});
