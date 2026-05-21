// Standard Webhooks v1 signature verification.
// Spec: https://www.standardwebhooks.com
//
// Used by Supabase Auth Hooks (e.g. send-email). The hook secret is
// configured in the Supabase dashboard → Auth → Hooks; Supabase signs each
// outbound request with it. Verifying the signature here gates the function
// against arbitrary callers — without this, anyone with the function URL
// can spoof Supabase's hook payload and trigger emails.

import { timingSafeEqual } from "./timing-safe.ts";

const TOLERANCE_SECONDS = 300; // 5-minute replay window

function base64UrlToBytes(b64: string): Uint8Array {
  // Standard base64 (not URL-safe) — Supabase emits standard base64.
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Verify a Standard Webhooks signature. Returns true iff the signature is
 * valid AND the timestamp is within the replay tolerance window. Caller
 * must pass the raw request body string (not parsed JSON), since the
 * signature is over the exact bytes the sender hashed.
 *
 * `secret` accepts either the raw base64 or the `whsec_…` prefixed form.
 */
export async function verifyStandardWebhook(
  headers: Headers,
  rawBody: string,
  secret: string,
): Promise<boolean> {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const skew = Math.abs(Date.now() / 1000 - tsNum);
  if (skew > TOLERANCE_SECONDS) return false;

  // Supabase emits secrets in `v1,whsec_<base64>` form; older Standard
  // Webhooks tooling uses `whsec_<base64>`. Strip whichever prefix is
  // present, then base64-decode the rest into the HMAC key bytes.
  const trimmed = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  let secretBytes: Uint8Array;
  try {
    secretBytes = base64UrlToBytes(trimmed);
  } catch {
    return false;
  }

  const signedContent = `${id}.${ts}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent),
  );
  const expected = bytesToBase64(new Uint8Array(mac));

  // Header may carry multiple signatures (key-rotation), space-separated,
  // each prefixed with a version tag like "v1,". We accept any match.
  const candidates = sigHeader.split(" ");
  for (const c of candidates) {
    const sig = c.startsWith("v1,") ? c.slice(3) : c;
    if (timingSafeEqual(sig, expected)) return true;
  }
  return false;
}
