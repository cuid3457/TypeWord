// Seed an in-app test wordlist from the EN case-routing audit output.
// -----------------------------------------------------------
// Reads scripts/audit/en-case-audit-2026-05-19.json, takes the NEW
// (case-routed) results for each word, translates example sentences to
// Korean via the production TRANSLATE_SENTENCE prompt, assembles full
// WordLookupResult objects, and inserts them as user_words rows under a
// dedicated "EN audit" book so the user can open it in the app and
// review side-by-side with their normal experience.
//
// Run:
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/audit/_seed_en_test_wordlist_2026-05-19.ts
//
// Side effects: ONE supabase book + ≤20 user_words rows under
// junesung07@gmail.com. No word_entries / word_translations cache touched
// (so production lookups remain unchanged — only the seeded wordlist
// shows the new prompt behavior). Re-running replaces the wordlist.
// -----------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

import {
  buildTranslateSentenceSystemPrompt,
  buildTranslateSentenceUserPrompt,
  type CanonicalExample,
  POS_BY_LANG,
} from "../../supabase/functions/_shared/prompts-v3.ts";

// Replicates stitch.ts's translatePos behavior so seeded result_json
// carries TARGET_LANG-localized POS terms ("수사"/"기호" instead of
// "numeral"/"symbol"). Production reaches the same outcome via
// stitch.ts; this script bypasses stitch so we do the mapping here.
function translatePos(posInSourceLang: string, targetLang: string): string {
  if (!posInSourceLang) return posInSourceLang;
  const target = posInSourceLang.trim();
  const targetList = (POS_BY_LANG[targetLang] ?? "").split("/");
  if (targetList.length === 0) return target;
  // Direct positional match: search every language's list for the term,
  // then map index → target language list. The canonical (English)
  // POS is the dominant input source in our seed flow.
  for (const list of Object.values(POS_BY_LANG)) {
    const terms = list.split("/");
    const idx = terms.indexOf(target);
    if (idx >= 0 && idx < targetList.length) return targetList[idx];
  }
  return target;
}

const TARGET_USER_EMAIL = "junesung07@gmail.com";
const BOOK_TITLE = "EN 케이스 분기 테스트 2026-05-19";
const BOOK_SOURCE_LANG = "en";
const TARGET_LANG = "ko";
const MODEL = "gpt-4.1-mini";

// Stable book id locked to the FIRST live seed (2026-05-19). Hardcoding
// rather than hash-deriving means re-runs update the existing book on
// the device in place instead of spawning a brand-new book with each
// run. (Earlier random-uuid runs orphaned books on devices because
// server-side deletes don't propagate to clients.)
const BOOK_ID = "8ccfae26-2423-45f9-8922-ddb6261cd0b2";

// Word ids: reuse the id already present on Supabase for the same word,
// or fall back to a stable hash if the word is being added fresh. This
// way the device upserts existing rows in place rather than seeing 20
// "new" rows on every re-seed.
function stableUuid(name: string): string {
  const hex = createHash("sha1").update(name).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

interface AuditEntry {
  word: string;
  expectedCase: string;
  classified: string;
  versions: {
    new: {
      quick: {
        headword?: string;
        ipa?: string;
        note?: string;
        confidence?: number;
        originalInput?: string;
        meanings?: { definition: string; partOfSpeech: string; relevanceScore?: number }[];
        meanings_translated?: { definition: string; partOfSpeech: string }[];
      };
      examples: { examples?: { sentence: string; meaning_index: number }[] } | null;
      synant: { synonyms?: string[]; antonyms?: string[] } | null;
      skippedSynAnt: boolean;
    };
  };
}

interface WordMeaning {
  definition: string;
  partOfSpeech: string;
  relevanceScore: number;
}
interface WordExample {
  sentence: string;
  translation: string;
  meaningIndex?: number;
}
interface WordLookupResult {
  headword?: string;
  ipa?: string;
  reading?: string | string[];
  meanings: WordMeaning[];
  synonyms?: string[];
  antonyms?: string[];
  examples?: WordExample[];
  confidence?: number;
  originalInput?: string;
  note?: "sentence" | "non_word" | "wrong_language" | "phrase_too_long";
}

async function callOpenAi(
  system: string,
  user: string,
  apiKey: string,
): Promise<unknown> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
  const j = await resp.json() as { choices: { message: { content: string } }[] };
  try {
    return JSON.parse(j.choices[0]?.message?.content ?? "{}");
  } catch {
    return {};
  }
}

async function translateExamples(
  word: string,
  examples: CanonicalExample[],
  translatedMeanings: { definition: string; partOfSpeech: string }[],
  apiKey: string,
): Promise<string[]> {
  if (examples.length === 0) return [];
  const sys = buildTranslateSentenceSystemPrompt(BOOK_SOURCE_LANG, TARGET_LANG);
  const usr = buildTranslateSentenceUserPrompt(
    word,
    BOOK_SOURCE_LANG,
    TARGET_LANG,
    examples,
    translatedMeanings,
  );
  const raw = await callOpenAi(sys, usr, apiKey) as { examples?: { translation?: string }[] };
  const out: string[] = [];
  for (let i = 0; i < examples.length; i++) {
    out.push(raw.examples?.[i]?.translation ?? "");
  }
  return out;
}

function buildResult(
  entry: AuditEntry,
  translations: string[],
): WordLookupResult {
  const q = entry.versions.new.quick;
  // Refusal path
  if (q.note === "sentence" || q.note === "non_word" || q.note === "wrong_language") {
    return {
      headword: q.headword ?? entry.word,
      originalInput: q.originalInput ?? entry.word,
      meanings: [],
      confidence: q.confidence,
      note: q.note,
    };
  }

  // Use meanings_translated as the visible meaning array (Korean target).
  // POS: translate the canonical EN POS deterministically (mirrors what
  // stitch.ts does in production); fall back to AI-translated POS when
  // the canonical isn't in our POS_BY_LANG positional table.
  const meanings: WordMeaning[] = (q.meanings_translated ?? []).map((mt, i) => {
    const canonicalPos = q.meanings?.[i]?.partOfSpeech ?? mt.partOfSpeech;
    const mappedPos = translatePos(canonicalPos, TARGET_LANG);
    const finalPos = mappedPos && mappedPos !== canonicalPos
      ? mappedPos
      : (mt.partOfSpeech ?? canonicalPos);
    return {
      definition: mt.definition,
      partOfSpeech: finalPos,
      relevanceScore: q.meanings?.[i]?.relevanceScore ?? 80,
    };
  });

  const rawEx = entry.versions.new.examples?.examples ?? [];
  const examples: WordExample[] = rawEx.map((ex, i) => ({
    sentence: ex.sentence,
    translation: translations[i] ?? "",
    meaningIndex: ex.meaning_index,
  }));

  const syn = entry.versions.new.synant?.synonyms ?? [];
  const ant = entry.versions.new.synant?.antonyms ?? [];

  return {
    headword: q.headword ?? entry.word,
    ipa: q.ipa,
    originalInput: q.originalInput ?? entry.word,
    confidence: q.confidence,
    meanings,
    examples: examples.length > 0 ? examples : undefined,
    synonyms: syn.length > 0 ? syn : undefined,
    antonyms: ant.length > 0 ? ant : undefined,
  };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !supabaseUrl || !serviceKey) {
    console.error("Missing env: need OPENAI_API_KEY, EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1) resolve user_id by email
  console.log(`Looking up user_id for ${TARGET_USER_EMAIL}...`);
  // auth.users not exposed in default schema, use admin API
  const { data: usersList, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (usersErr) throw usersErr;
  const targetUser = usersList.users.find((u) => u.email === TARGET_USER_EMAIL);
  if (!targetUser) {
    console.error(`User ${TARGET_USER_EMAIL} not found. Available users: ${usersList.users.map((u) => u.email).join(", ")}`);
    process.exit(1);
  }
  const userId = targetUser.id;
  console.log(`  user_id = ${userId}`);

  // 2) read audit JSON
  const auditPath = path.resolve(import.meta.dirname ?? __dirname, "en-case-audit-2026-05-19.json");
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8")) as AuditEntry[];
  console.log(`Loaded ${audit.length} audit entries.`);

  // 3) per-word: translate examples, build result_json
  const built: { word: string; result: WordLookupResult }[] = [];
  for (const entry of audit) {
    process.stdout.write(`  ${entry.word.padEnd(22)} ... `);
    try {
      const q = entry.versions.new.quick;
      const examples = entry.versions.new.examples?.examples ?? [];
      let translations: string[] = [];
      if (examples.length > 0 && q.meanings_translated) {
        translations = await translateExamples(
          q.headword ?? entry.word,
          examples,
          q.meanings_translated,
          apiKey,
        );
      }
      const result = buildResult(entry, translations);
      built.push({ word: entry.word, result });
      console.log(`ok (m=${result.meanings.length} ex=${result.examples?.length ?? 0}${result.note ? ` note=${result.note}` : ""})`);
    } catch (e) {
      console.log(`ERR: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  console.log(`Built ${built.length}/${audit.length} entries.`);

  // 4) upsert book — stable id means re-running updates in place rather
  // than creating a new row each time. Avoids ghost duplicates on the
  // device that picked up earlier seeds with random-id books.
  console.log(`Upserting book "${BOOK_TITLE}" (id=${BOOK_ID})...`);
  const nowIso = new Date().toISOString();
  const { error: bookErr } = await admin.from("books").upsert({
    id: BOOK_ID,
    user_id: userId,
    title: BOOK_TITLE,
    source_lang: BOOK_SOURCE_LANG,
    target_lang: TARGET_LANG,
    updated_at: nowIso,
  }, { onConflict: "id" });
  if (bookErr) throw bookErr;

  // 5) build word→id map from existing rows so we re-use the same ids
  // (avoids creating "new" user_words on every re-seed which would
  // double-count on the device).
  const { data: existingWords } = await admin
    .from("user_words")
    .select("id, word")
    .eq("book_id", BOOK_ID);
  const wordToExistingId = new Map<string, string>(
    (existingWords ?? []).map((w) => [w.word as string, w.id as string]),
  );

  console.log(`Upserting ${built.length} user_words rows...`);
  const rows = built.map((b) => ({
    id: wordToExistingId.get(b.word) ?? stableUuid(`${BOOK_ID}|word|${b.word}`),
    user_id: userId,
    book_id: BOOK_ID,
    word: b.word,
    reading_key: "",
    result_json: b.result,
    source_sentence: null,
    ease_factor: 2.5,
    interval_days: 0,
    next_review: null,
    review_count: 0,
    created_at: nowIso,
    updated_at: nowIso,
  }));
  const { error: wordsErr } = await admin.from("user_words").upsert(rows, { onConflict: "id" });
  if (wordsErr) throw wordsErr;
  console.log(`  upserted ${rows.length} rows (reused ${rows.filter((r) => wordToExistingId.has(r.word)).length} existing ids)`);

  // Prune any user_words still in this book that are no longer in the
  // audit list (rare — e.g. when the test word set is trimmed).
  const currentWordIds = new Set(rows.map((r) => r.id));
  const stragglers = (existingWords ?? []).filter((w) => !currentWordIds.has(w.id)).map((w) => w.id);
  if (stragglers.length > 0) {
    await admin.from("user_words").delete().in("id", stragglers);
    console.log(`  pruned ${stragglers.length} stragglers no longer in audit`);
  }

  console.log(``);
  console.log(`Done. Book id stable across re-runs: ${BOOK_ID}`);
  console.log(`Future re-runs update this book in place — no new books spawned.`);
  console.log(`If older ghost copies exist on the device from past random-id seeds,`);
  console.log(`long-press → delete them in the app library. Only ${BOOK_ID} is canonical.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
