// Web-only safety net for stale-deploy chunk-load failures.
//
// After a CF Pages deploy, hashed chunk URLs change. Users with a tab
// already loaded carry an entry bundle whose dynamic-import map points
// to dead chunk URLs. Any `await import(...)` against a dead chunk
// rejects with "Loading module … failed" (or a `text/html` parse error
// when the SPA fallback rewrite returns index.html). State reset in a
// try/catch can't fix it — the broken mapping lives in loaded JS. The
// only repair is to fetch the fresh entry bundle, i.e. window.reload().
//
// Two surfaces:
//   - isChunkLoadError(err): detect the pattern, used by per-call-site
//     catches that want to choose between "show error UI" and "reload".
//   - installChunkLoadReloadGuard(): global unhandledrejection listener
//     that catches anything not handled at the call site, with a
//     single-shot guard against reload loops if the chunk is truly
//     broken (not just stale).
//
// No-op on native. Native bundles are shipped intact with the app.

import { Platform } from 'react-native';

const RELOAD_SENTINEL = 'mv_chunk_reload';

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!msg) return false;
  return /Loading module .* failed/i.test(msg)
    || /ChunkLoadError/.test(msg)
    || /Failed to fetch dynamically imported module/i.test(msg)
    || /error loading dynamically imported module/i.test(msg)
    // SPA fallback returns text/html for missing JS, browser surfaces
    // as a MIME / unexpected-token parse error before module eval.
    || /Unexpected token '<'/.test(msg)
    || /expected .* MIME type/i.test(msg);
}

// Trigger a hard reload, but only once per session. If the chunk is
// genuinely missing (not a stale deploy), reloading repeatedly would
// trap the user — sessionStorage flag breaks the loop and falls back
// to surfacing the error normally on the second hit.
export function reloadForStaleChunk(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(RELOAD_SENTINEL) === '1') return false;
    window.sessionStorage.setItem(RELOAD_SENTINEL, '1');
  } catch {
    // sessionStorage may be unavailable (privacy mode). Skip the guard
    // rather than block the reload — a one-time loop is preferable to
    // a stuck error screen.
  }
  window.location.reload();
  return true;
}

let installed = false;

export function installChunkLoadReloadGuard(): void {
  if (installed || Platform.OS !== 'web' || typeof window === 'undefined') return;
  installed = true;

  // Anything that boots successfully clears the sentinel so a future
  // stale-deploy in the same tab can reload again.
  try {
    if (document.readyState === 'complete') {
      window.sessionStorage.removeItem(RELOAD_SENTINEL);
    } else {
      window.addEventListener('load', () => {
        try { window.sessionStorage.removeItem(RELOAD_SENTINEL); } catch {}
      }, { once: true });
    }
  } catch {}

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      reloadForStaleChunk();
    }
  });

  window.addEventListener('error', (event) => {
    // Script load errors (e.g. dynamic import of HTML masquerading as
    // JS) surface here when not wrapped in a promise catch.
    if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
      reloadForStaleChunk();
    }
  });
}
