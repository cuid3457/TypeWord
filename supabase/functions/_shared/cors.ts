// Shared CORS allow-list for edge functions. Single source of truth so a
// new production domain (e.g. moavoca.com) doesn't need to be added file
// by file. Mobile clients bypass CORS entirely; this list matters only
// for browser-based callers (web UI, dashboard tooling, etc.).
const ALLOWED_ORIGINS = new Set([
  "https://moavoca.com",
  "https://www.moavoca.com",
  "https://typeword.app",         // legacy domain (pre-rebrand) — kept until expiry
  "http://localhost:8081",        // expo dev (web mode)
  "http://localhost:19006",       // expo legacy web port
]);

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
