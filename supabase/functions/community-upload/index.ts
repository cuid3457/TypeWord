// Community wordlist create + edit — replaces direct PostgREST insert/update
// so we can run moderation before content goes public.
//
// Mode is decided by presence of `id` in payload:
//   • create mode (no id): full validation + insert via service_role
//   • edit mode (id given): owner check + moderation on new title/desc + UPDATE
//
// Flow:
//   1. Auth verify (JWT → user)
//   2. Validate payload shape + sizes
//   3. Keyword blocklist check (10 languages, fast-fail)
//   4. OpenAI Moderation API on title + description
//   5. Persist row via service_role (bypassing RLS — direct INSERT/UPDATE
//      revoked from authenticated as of migrations 20260509000003 / 4)
//   6. Return id
//
// Error codes (returned in body.code):
//   blocklist_match     — keyword matched
//   moderation_flagged  — OpenAI Moderation flagged
//   too_few_words       — < MIN_WORDS_FOR_UPLOAD (create only)
//   too_many_words      — > MAX_WORDS_FOR_UPLOAD (create only)
//   payload_too_large   — JSON body exceeds size cap
//   invalid_payload     — shape / type mismatch
//   not_found           — edit target id doesn't exist or not owned
//   unauthorized        — bad / missing JWT

import { createClient } from "npm:@supabase/supabase-js@^2.45.0";
import { contextualModerationCheck, moderateText } from "../_shared/moderation.ts";
import { checkBlocklist } from "../_shared/blocklist.ts";

const ALLOWED_ORIGINS = new Set([
  "https://moavoca.com",
  "https://www.moavoca.com",
  "https://typeword.app",
  "http://localhost:8081",
]);

const MIN_WORDS_FOR_UPLOAD = 5;
const MAX_WORDS_FOR_UPLOAD = 1000;
const MAX_TITLE_LEN = 80;
const MAX_DESCRIPTION_LEN = 300;
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB hard cap

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  };
}

function jsonResponse(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

interface UploadPayload {
  id?: unknown;          // present → edit mode
  title?: unknown;
  description?: unknown;
  source_lang?: unknown; // create-only
  target_lang?: unknown; // create-only
  uploader_name?: unknown; // create-only
  words?: unknown;       // create-only
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, cors);
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization", code: "unauthorized" }, cors);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !user) {
      return jsonResponse(401, { error: "Invalid session", code: "unauthorized" }, cors);
    }
    if (user.is_anonymous) {
      return jsonResponse(403, { error: "Anonymous users cannot upload", code: "anonymous_blocked" }, cors);
    }

    // ── Body size guard ───────────────────────────────────────────────
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: "Payload too large", code: "payload_too_large" }, cors);
    }

    let payload: UploadPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON", code: "invalid_payload" }, cors);
    }

    // ── Shape validation (shared between create + edit) ───────────────
    const editId = typeof payload.id === "string" && UUID_RE.test(payload.id) ? payload.id : null;
    const isEdit = !!editId;
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const description = typeof payload.description === "string" ? payload.description.trim() : "";

    if (!title) {
      return jsonResponse(400, { error: "Missing title", code: "invalid_payload" }, cors);
    }
    if (title.length > MAX_TITLE_LEN) {
      return jsonResponse(400, { error: `Title too long (max ${MAX_TITLE_LEN})`, code: "invalid_payload" }, cors);
    }
    if (description.length > MAX_DESCRIPTION_LEN) {
      return jsonResponse(400, { error: `Description too long (max ${MAX_DESCRIPTION_LEN})`, code: "invalid_payload" }, cors);
    }

    // Create-only fields
    let sourceLang = "";
    let targetLang = "";
    let uploaderName = "";
    let words: unknown[] = [];
    if (!isEdit) {
      sourceLang = typeof payload.source_lang === "string" ? payload.source_lang : "";
      targetLang = typeof payload.target_lang === "string" ? payload.target_lang : "";
      uploaderName = typeof payload.uploader_name === "string" ? payload.uploader_name.trim() : "";
      const wordsArr = Array.isArray(payload.words) ? payload.words : null;

      if (!sourceLang || !targetLang || !wordsArr) {
        return jsonResponse(400, { error: "Missing required fields", code: "invalid_payload" }, cors);
      }
      if (wordsArr.length < MIN_WORDS_FOR_UPLOAD) {
        return jsonResponse(400, { error: `Need at least ${MIN_WORDS_FOR_UPLOAD} words`, code: "too_few_words" }, cors);
      }
      if (wordsArr.length > MAX_WORDS_FOR_UPLOAD) {
        return jsonResponse(400, { error: `Max ${MAX_WORDS_FOR_UPLOAD} words per wordlist`, code: "too_many_words" }, cors);
      }
      words = wordsArr;
    }

    // ── Keyword blocklist (fast, local) ───────────────────────────────
    const titleBlock = checkBlocklist(title);
    if (!titleBlock.ok) {
      console.log("[community-upload] blocklist hit on title", { user: user.id, lang: titleBlock.lang });
      return jsonResponse(400, {
        error: "Title contains inappropriate language",
        code: "blocklist_match",
        field: "title",
      }, cors);
    }
    if (description) {
      const descBlock = checkBlocklist(description);
      if (!descBlock.ok) {
        console.log("[community-upload] blocklist hit on description", { user: user.id, lang: descBlock.lang });
        return jsonResponse(400, {
          error: "Description contains inappropriate language",
          code: "blocklist_match",
          field: "description",
        }, cors);
      }
    }

    // ── OpenAI Moderation API (categorical scoring) ───────────────────
    // Check title and description SEPARATELY so a short bad phrase isn't
    // diluted by surrounding benign text and pushed below the threshold.
    const titleVerdict = await moderateText(title);
    if (!titleVerdict.ok) {
      console.log("[community-upload] moderation flagged title", {
        user: user.id,
        topCategory: titleVerdict.topCategory,
      });
      return jsonResponse(400, {
        error: "Title flagged by moderation",
        code: "moderation_flagged",
        field: "title",
        category: titleVerdict.topCategory,
      }, cors);
    }
    if (description) {
      const descVerdict = await moderateText(description);
      if (!descVerdict.ok) {
        console.log("[community-upload] moderation flagged description", {
          user: user.id,
          topCategory: descVerdict.topCategory,
        });
        return jsonResponse(400, {
          error: "Description flagged by moderation",
          code: "moderation_flagged",
          field: "description",
          category: descVerdict.topCategory,
        }, cors);
      }
    }

    // ── Contextual check via gpt-4o-mini (catches euphemisms / leetspeak) ─
    const titleContextual = await contextualModerationCheck(title);
    if (!titleContextual.ok) {
      console.log("[community-upload] contextual rejected title", { user: user.id });
      return jsonResponse(400, {
        error: "Title flagged by moderation",
        code: "moderation_flagged",
        field: "title",
        category: "contextual",
      }, cors);
    }
    if (description) {
      const descContextual = await contextualModerationCheck(description);
      if (!descContextual.ok) {
        console.log("[community-upload] contextual rejected description", { user: user.id });
        return jsonResponse(400, {
          error: "Description flagged by moderation",
          code: "moderation_flagged",
          field: "description",
          category: "contextual",
        }, cors);
      }
    }

    // ── Persist via service_role (RLS direct write is revoked) ────────
    if (isEdit) {
      // Edit mode — verify ownership before update.
      const { data: existing, error: selErr } = await admin
        .from("community_wordlists")
        .select("user_id")
        .eq("id", editId!)
        .maybeSingle();
      if (selErr) {
        console.error("[community-upload] edit select failed:", selErr.message);
        return jsonResponse(500, { error: selErr.message, code: "db_error" }, cors);
      }
      if (!existing) {
        return jsonResponse(404, { error: "Wordlist not found", code: "not_found" }, cors);
      }
      if (existing.user_id !== user.id) {
        return jsonResponse(403, { error: "Not the owner", code: "forbidden" }, cors);
      }

      const { error: updErr } = await admin
        .from("community_wordlists")
        .update({ title, description: description || null })
        .eq("id", editId!);
      if (updErr) {
        console.error("[community-upload] edit update failed:", updErr.message);
        return jsonResponse(500, { error: updErr.message, code: "db_error" }, cors);
      }
      return jsonResponse(200, { ok: true, id: editId }, cors);
    }

    // Create mode
    const { data: inserted, error: insertError } = await admin
      .from("community_wordlists")
      .insert({
        user_id: user.id,
        uploader_name: uploaderName || null,
        title,
        description: description || null,
        source_lang: sourceLang,
        target_lang: targetLang,
        word_count: words.length,
        words,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[community-upload] insert failed:", insertError.message);
      return jsonResponse(500, { error: insertError.message, code: "db_error" }, cors);
    }

    return jsonResponse(200, { ok: true, id: inserted.id }, cors);
  } catch (err) {
    console.error("[community-upload] unhandled:", (err as Error).message);
    return jsonResponse(500, { error: (err as Error).message, code: "internal_error" }, cors);
  }
});
