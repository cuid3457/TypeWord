// Edge Function: process-report
// -----------------------------------------------------------
// Phase 8 — AI judge + auto-fix loop for user reports.
//
// Trigger: scheduled (pg_cron every ~5 min) OR direct invoke on new report.
// Processes unprocessed content_reports:
//   1. Aggregate reports by (word, source_lang, target_lang)
//   2. AI judge (gpt-4.1 full, twice for consistency) — VALID/BORDERLINE/INVALID
//   3. If VALID + ≥2 reports + consistent → regenerate (gpt-4.1)
//      then auto-apply OR queue for moderator review
//   4. If BORDERLINE / single report → queue for moderator
//   5. If INVALID → reject + bump reporter's invalid count
//   6. Mark reports processed
//
// Conservative defaults — moderator review preferred over auto-apply
// until the judge's accuracy is empirically validated.
// -----------------------------------------------------------

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import { timingSafeEqual } from "../_shared/timing-safe.ts";

const ENDPOINT = "process-report";
const JUDGE_MODEL = "gpt-4.1";          // strong reasoning for judgment
const REGEN_MODEL = "gpt-4.1";          // premium model for the corrected regeneration
const VERIFY_MODEL = "gpt-4.1";         // independent post-regen verifier
// Token pricing (gpt-4.1 full — applies to all three roles)
const JUDGE_PRICE_IN = 2.00 / 1_000_000;
const JUDGE_PRICE_OUT = 8.00 / 1_000_000;

// Auto-apply gate: VALID + ≥ this confidence + verifier APPROVED + report
// quorum (multiple independent reporters reaching the same conclusion).
// Conservative defaults — a coordinated brigade of 2 accounts can convince
// gpt-4.1 by carefully phrasing reports. Requiring 3 raises the bar.
// Both confidence numbers (judge + verify) must clear the threshold.
const AUTO_APPLY_MIN_CONFIDENCE = 95;
const AUTO_APPLY_MIN_REPORTS = 3;

const ALLOWED_ORIGINS = new Set([
  "https://moavoca.com",
  "https://www.moavoca.com",
  "https://typeword.app",
  "http://localhost:8081",
]);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

let _admin: SupabaseClient | null = null;
function getAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _admin;
}

interface ContentReport {
  id: string;
  user_id: string | null;
  word: string;
  reason: string;
  description: string | null;
  source_lang: string | null;
  target_lang: string | null;
  context: string;
  created_at: string;
}

const JUDGE_SYSTEM = `You are a STRICT, CONSERVATIVE auditor for a language-learning vocabulary entry. A user reported this entry. Decide carefully — DEFAULT TO INVALID when unsure.

Most user reports are WRONG. Reasons users report incorrectly:
- They misunderstand the source language
- They are pedantic but technically wrong
- They are testing the system
- They are malicious (random rejection)

A REPORT is VALID only when a NATIVE SPEAKER of the source language would clearly agree there's an obvious error — not a stylistic preference, not a minor wording choice.

Step-by-step (think carefully BEFORE deciding):
1. Read the current entry (meanings, examples, translation).
2. Read the user's report (reason + description).
3. Simulate a native speaker of the SOURCE language reading the entry.
4. Ask: "Would a typical native speaker, looking at this, say this is CLEARLY wrong?"
   - Wrong meaning that no native uses? VALID.
   - Wrong grammar that breaks the sentence? VALID.
   - Marker on the wrong word? VALID.
   - "I would phrase it slightly differently" → INVALID (subjective).
   - "This is less common than X" → INVALID (still attested).
5. Consider whether the user is misunderstanding rather than catching a real error.

Output strict JSON:
{
  "verdict": "VALID" | "BORDERLINE" | "INVALID",
  "confidence": 0-100,
  "reasoning": "<step-by-step in 2-3 sentences>",
  "specificIssue": "<the exact obvious error, or empty>",
  "userMightBeWrongBecause": "<if INVALID, why the user might be wrong>"
}

DEFAULT: when uncertain, return INVALID with low confidence. Only return VALID when a native speaker would CLEARLY say the entry is wrong.`;

function jsonResponse(body: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

interface JudgeOutput {
  verdict: "VALID" | "BORDERLINE" | "INVALID";
  confidence: number;
  reasoning: string;
  specificIssue: string;
  userMightBeWrongBecause: string;
}

const REGEN_SYSTEM = `You are a careful editor for a language-learning vocabulary entry. The current entry has been confirmed to contain a specific error (see issue field). Produce a CORRECTED entry that fixes ONLY that error and leaves everything else unchanged.

Rules:
- Preserve the JSON shape of the input exactly. Same keys, same array lengths where possible.
- Fix only the specific issue identified — do NOT "improve" unrelated parts.
- Preserve correct existing content (good meanings stay, good examples stay).
- If the issue affects a single meaning or example, regenerate ONLY that slot; keep others verbatim.
- For SOURCE_LANG / TARGET_LANG purity: definitions stay in target_lang, headword/examples stay in source_lang.
- Markers (** ... **): wrap the headword surface only.
- Output strict JSON in the same shape as the input.

Return: { "corrected": <object same shape as input>, "changeNote": "<one sentence describing what changed>" }`;

const VERIFY_SYSTEM = `You are an independent verifier for a vocabulary entry fix. You receive the ORIGINAL entry, the REPORTED issue, and the CORRECTED entry. Decide whether the correction is appropriate.

A correction is APPROVED only when ALL hold:
1. The specific reported issue is genuinely fixed.
2. No OTHER content was damaged (good meanings/examples preserved).
3. The correction is in the right languages (source_lang content stays in source_lang, target_lang content stays in target_lang).
4. Marker placement is correct in the corrected version (markers on headword surface, not adjacent material).
5. JSON shape is preserved (same keys, plausible array lengths).

If any of the above fails → REJECTED.

Output strict JSON: { "verdict": "APPROVED" | "REJECTED", "confidence": 0-100, "reasoning": "<2-3 sentences>" }

DEFAULT: when uncertain, REJECT with low confidence. Only APPROVE when the fix is unambiguously a clear improvement.`;

interface RegenOutput {
  corrected: Record<string, unknown>;
  changeNote: string;
}

interface VerifyOutput {
  verdict: "APPROVED" | "REJECTED";
  confidence: number;
  reasoning: string;
}

async function callRegen(
  word: string,
  sourceLang: string,
  targetLang: string,
  currentEntry: Record<string, unknown>,
  judgeIssue: string,
  openaiKey: string,
): Promise<{ output: RegenOutput; cost: number }> {
  const userMessage = JSON.stringify({
    source_lang: sourceLang,
    target_lang: targetLang,
    headword: word,
    current_entry: currentEntry,
    issue_to_fix: judgeIssue,
  }, null, 2);

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: REGEN_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: REGEN_SYSTEM },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`Regen OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json();
  const usage = j.usage ?? {};
  const cost = (usage.prompt_tokens ?? 0) * JUDGE_PRICE_IN + (usage.completion_tokens ?? 0) * JUDGE_PRICE_OUT;
  const output = JSON.parse(j.choices[0].message.content) as RegenOutput;
  return { output, cost };
}

async function callVerify(
  word: string,
  sourceLang: string,
  targetLang: string,
  original: Record<string, unknown>,
  corrected: Record<string, unknown>,
  judgeIssue: string,
  openaiKey: string,
): Promise<{ output: VerifyOutput; cost: number }> {
  const userMessage = JSON.stringify({
    source_lang: sourceLang,
    target_lang: targetLang,
    headword: word,
    reported_issue: judgeIssue,
    original_entry: original,
    corrected_entry: corrected,
  }, null, 2);

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VERIFY_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: VERIFY_SYSTEM },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`Verify OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json();
  const usage = j.usage ?? {};
  const cost = (usage.prompt_tokens ?? 0) * JUDGE_PRICE_IN + (usage.completion_tokens ?? 0) * JUDGE_PRICE_OUT;
  const output = JSON.parse(j.choices[0].message.content) as VerifyOutput;
  return { output, cost };
}

async function callJudge(
  word: string,
  sourceLang: string,
  targetLang: string,
  reports: ContentReport[],
  currentEntry: Record<string, unknown>,
  openaiKey: string,
): Promise<{ output: JudgeOutput; cost: number }> {
  const userMessage = JSON.stringify({
    source_lang: sourceLang,
    target_lang: targetLang,
    headword: word,
    current_entry: currentEntry,
    user_reports: reports.map((r) => ({
      reason: r.reason,
      description: r.description ?? "",
    })),
  }, null, 2);

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`Judge OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json();
  const usage = j.usage ?? {};
  const cost = (usage.prompt_tokens ?? 0) * JUDGE_PRICE_IN + (usage.completion_tokens ?? 0) * JUDGE_PRICE_OUT;
  const output = JSON.parse(j.choices[0].message.content) as JudgeOutput;
  return { output, cost };
}

// Aggregate unprocessed reports by (word, source_lang, target_lang).
// Skips reports without lang info (legacy reports — moderator review only).
async function aggregateReports(admin: SupabaseClient): Promise<Map<string, ContentReport[]>> {
  const { data: reports, error } = await admin
    .from("content_reports")
    .select("id, user_id, word, reason, description, source_lang, target_lang, context, created_at")
    .is("processed_at", null)
    .not("source_lang", "is", null)
    .not("target_lang", "is", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`fetch reports: ${error.message}`);

  const groups = new Map<string, ContentReport[]>();
  for (const r of reports ?? []) {
    const key = `${r.word}::${r.source_lang}::${r.target_lang}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r as ContentReport);
  }
  return groups;
}

interface EntrySource {
  data: Record<string, unknown>;
  source: "curated" | "word_entries";
  // Meta for applying patches back. Either:
  //  - curated: { curatedWordId } — we'll write results_by_target_lang[targetLang]
  //  - word_entries: { wordEntryId, translationId? } — we'll write meanings/examples + translations
  meta: {
    curatedWordId?: string;
    wordEntryId?: string;
    translationId?: string;
  };
}

async function fetchCurrentEntry(
  admin: SupabaseClient,
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<EntrySource | null> {
  // Try curated_words first (for known curated wordlist hits).
  const { data: curated } = await admin
    .from("curated_words")
    .select("id, results_by_target_lang")
    .eq("word", word)
    .limit(1)
    .maybeSingle();
  if (curated?.results_by_target_lang?.[targetLang]) {
    return {
      data: curated.results_by_target_lang[targetLang],
      source: "curated",
      meta: { curatedWordId: curated.id },
    };
  }
  // Fall back to word_entries + word_translations (user free search).
  const { data: entry } = await admin
    .from("word_entries")
    .select("id, headword, meanings, examples")
    .eq("word", word)
    .eq("word_lang", sourceLang)
    .maybeSingle();
  if (!entry) return null;
  const { data: tr } = await admin
    .from("word_translations")
    .select("id, meanings_translated, examples_translated")
    .eq("word_entry_id", entry.id)
    .eq("target_lang", targetLang)
    .maybeSingle();
  return {
    data: { entry, translation: tr },
    source: "word_entries",
    meta: { wordEntryId: entry.id as string, translationId: tr?.id as string | undefined },
  };
}

async function applyFix(
  admin: SupabaseClient,
  src: EntrySource,
  corrected: Record<string, unknown>,
  targetLang: string,
): Promise<void> {
  if (src.source === "curated" && src.meta.curatedWordId) {
    // curated_words.results_by_target_lang is a JSONB keyed by target_lang.
    // Read current, splice in corrected, write back.
    const { data: curated } = await admin
      .from("curated_words")
      .select("results_by_target_lang")
      .eq("id", src.meta.curatedWordId)
      .maybeSingle();
    const results = (curated?.results_by_target_lang as Record<string, unknown>) ?? {};
    results[targetLang] = corrected;
    const { error } = await admin
      .from("curated_words")
      .update({ results_by_target_lang: results })
      .eq("id", src.meta.curatedWordId);
    if (error) throw new Error(`patch curated_words: ${error.message}`);
    return;
  }
  if (src.source === "word_entries" && src.meta.wordEntryId) {
    // Corrected shape mirrors fetchCurrentEntry's word_entries return:
    // { entry: { meanings, examples, ... }, translation: { meanings_translated, examples_translated } }
    const correctedEntry = (corrected.entry ?? {}) as Record<string, unknown>;
    const correctedTrans = (corrected.translation ?? {}) as Record<string, unknown>;

    const entryPatch: Record<string, unknown> = {};
    if (Array.isArray(correctedEntry.meanings)) entryPatch.meanings = correctedEntry.meanings;
    if (Array.isArray(correctedEntry.examples)) entryPatch.examples = correctedEntry.examples;
    if (Object.keys(entryPatch).length > 0) {
      const { error: e1 } = await admin
        .from("word_entries")
        .update(entryPatch)
        .eq("id", src.meta.wordEntryId);
      if (e1) throw new Error(`patch word_entries: ${e1.message}`);
    }

    if (src.meta.translationId) {
      const trPatch: Record<string, unknown> = {};
      if (Array.isArray(correctedTrans.meanings_translated)) trPatch.meanings_translated = correctedTrans.meanings_translated;
      if (Array.isArray(correctedTrans.examples_translated)) trPatch.examples_translated = correctedTrans.examples_translated;
      if (Object.keys(trPatch).length > 0) {
        const { error: e2 } = await admin
          .from("word_translations")
          .update(trPatch)
          .eq("id", src.meta.translationId);
        if (e2) throw new Error(`patch word_translations: ${e2.message}`);
      }
    }
    return;
  }
  throw new Error(`applyFix: unsupported source/meta combination`);
}

async function processGroup(
  admin: SupabaseClient,
  word: string,
  sourceLang: string,
  targetLang: string,
  reports: ContentReport[],
  openaiKey: string,
): Promise<{ status: string; fixId?: string }> {
  // Skip already-queued same word+lang fixes (avoid duplicate work).
  const { data: existing } = await admin
    .from("report_fixes")
    .select("id, status")
    .eq("word", word)
    .eq("source_lang", sourceLang)
    .eq("target_lang", targetLang)
    .in("status", ["pending_review", "auto_applied", "manually_applied"])
    .maybeSingle();
  if (existing) return { status: "skipped_existing", fixId: existing.id };

  // Fetch current entry + provenance metadata for downstream patch.
  const entrySource = await fetchCurrentEntry(admin, word, sourceLang, targetLang);
  if (!entrySource) return { status: "no_entry" };
  const currentEntry = entrySource.data;

  // Run judge twice for consistency.
  const r1 = await callJudge(word, sourceLang, targetLang, reports, currentEntry, openaiKey);
  const r2 = await callJudge(word, sourceLang, targetLang, reports, currentEntry, openaiKey);
  const judgeAgrees = r1.output.verdict === r2.output.verdict;
  const finalVerdict = judgeAgrees ? r1.output.verdict
    : (r1.output.confidence >= r2.output.confidence ? r1.output.verdict : r2.output.verdict);
  const finalConfidence = Math.min(r1.output.confidence, r2.output.confidence);
  const judgeCost = r1.cost + r2.cost;
  const specificIssue = (r1.output.specificIssue || r2.output.specificIssue || "").trim();

  // Decision flow:
  //   INVALID → rejected (no regen)
  //   BORDERLINE → pending_review (no regen)
  //   VALID → regen → verify (×2) → auto_applied OR pending_review (if verify rejects)
  let status: string = "pending_review";
  let regenResult: Record<string, unknown> | null = null;
  let regenCost = 0;
  let verifyVerdict: string | null = null;
  let verifyConfidence: number | null = null;
  let verifyReasoning: string | null = null;
  let applyError: string | null = null;

  if (finalVerdict === "INVALID") {
    status = "rejected";
  } else if (finalVerdict === "VALID") {
    try {
      // Regenerate the corrected entry.
      const regen = await callRegen(word, sourceLang, targetLang, currentEntry, specificIssue, openaiKey);
      regenResult = regen.output.corrected;
      regenCost = regen.cost;

      // Independent verifier × 2 — both must APPROVE.
      const v1 = await callVerify(word, sourceLang, targetLang, currentEntry, regenResult, specificIssue, openaiKey);
      const v2 = await callVerify(word, sourceLang, targetLang, currentEntry, regenResult, specificIssue, openaiKey);
      regenCost += v1.cost + v2.cost;
      const bothApprove = v1.output.verdict === "APPROVED" && v2.output.verdict === "APPROVED";
      verifyVerdict = bothApprove ? "APPROVED" : "REJECTED";
      verifyConfidence = Math.min(v1.output.confidence, v2.output.confidence);
      verifyReasoning = `${v1.output.reasoning}\n[2nd] ${v2.output.reasoning}`;

      if (
        bothApprove
        && finalConfidence >= AUTO_APPLY_MIN_CONFIDENCE
        && verifyConfidence >= AUTO_APPLY_MIN_CONFIDENCE
        && reports.length >= AUTO_APPLY_MIN_REPORTS
      ) {
        try {
          await applyFix(admin, entrySource, regenResult, targetLang);
          status = "auto_applied";
        } catch (e) {
          applyError = e instanceof Error ? e.message : String(e);
          status = "pending_review";
        }
      } else {
        status = "pending_review";
      }
    } catch (e) {
      // Regen / verify call failed — leave for manual review.
      applyError = e instanceof Error ? e.message : String(e);
      status = "pending_review";
    }
  }

  // Insert into report_fixes
  const reviewerNoteParts: string[] = [];
  if (verifyVerdict) reviewerNoteParts.push(`verify=${verifyVerdict} (conf=${verifyConfidence})`);
  if (verifyReasoning) reviewerNoteParts.push(verifyReasoning);
  if (applyError) reviewerNoteParts.push(`apply_error: ${applyError}`);
  const reviewerNote = reviewerNoteParts.length > 0 ? reviewerNoteParts.join("\n") : null;

  const { data: inserted, error: insertError } = await admin
    .from("report_fixes")
    .insert({
      word, source_lang: sourceLang, target_lang: targetLang,
      report_ids: reports.map((r) => r.id),
      report_count: reports.length,
      judge_verdict: finalVerdict,
      judge_confidence: finalConfidence,
      judge_reasoning: `${r1.output.reasoning}\n[2nd] ${r2.output.reasoning}`,
      judge_model: `${JUDGE_MODEL}-x2`,
      original_result: currentEntry,
      regen_result: regenResult,
      regen_model: regenResult ? `${REGEN_MODEL}+verify-x2` : null,
      status,
      applied_at: status === "auto_applied" ? new Date().toISOString() : null,
      reviewer_note: reviewerNote,
      judge_cost_usd: judgeCost,
      regen_cost_usd: regenCost > 0 ? regenCost : null,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`insert fix: ${insertError.message}`);

  // Mark reports processed.
  await admin
    .from("content_reports")
    .update({ processed_at: new Date().toISOString() })
    .in("id", reports.map((r) => r.id));

  // Update reporter trust counters.
  for (const r of reports) {
    if (!r.user_id) continue;
    const isValid = finalVerdict === "VALID";
    await admin.rpc("increment_report_counters", {
      p_user_id: r.user_id,
      p_valid_delta: isValid ? 1 : 0,
      p_invalid_delta: isValid ? 0 : 1,
    }).catch(() => { /* RPC missing — silent. Not critical. */ });
  }

  return { status, fixId: inserted.id };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // Internal-only function: invoked by pg_cron (10-min schedule) with a
  // shared secret. Without this gate, anyone holding the public anon key
  // could trigger paid LLM work (judge x2 + regen + verify x2 per report
  // group). The cron migration sends `Authorization: Bearer ${SECRET}`;
  // the secret is stored in Supabase secrets, NOT a JWT.
  const expectedSecret = Deno.env.get("PROCESS_REPORT_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!expectedSecret || !timingSafeEqual(authHeader, `Bearer ${expectedSecret}`)) {
    return jsonResponse({ error: "unauthorized" }, 401, cors);
  }

  try {
    const admin = getAdmin();
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const groups = await aggregateReports(admin);
    const results: Array<Record<string, unknown>> = [];
    for (const [key, reports] of groups) {
      const [word, sourceLang, targetLang] = key.split("::");
      try {
        const r = await processGroup(admin, word, sourceLang, targetLang, reports, openaiKey);
        results.push({ word, sourceLang, targetLang, reportCount: reports.length, ...r });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ word, sourceLang, targetLang, error: message });
      }
    }
    return jsonResponse({ processed: results.length, results }, 200, cors);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message }, 500, cors);
  }
});
