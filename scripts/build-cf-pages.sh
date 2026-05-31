#!/usr/bin/env bash
# CF Pages build pipeline for moavoca.com
#
# Wraps the local-export + landing-merge dance with a critical workaround:
# Cloudflare Pages silently strips files under any path containing
# `node_modules/` during deploy, even when the directory is inside the
# build output. That kills Expo Web's static font + wasm assets which
# all live at `dist/app/assets/node_modules/...`. We rename the dir to
# a non-reserved name post-export and patch the bundle/HTML references.

set -euo pipefail

echo "[build-cf-pages] expo export…"
npx expo export -p web --output-dir dist/app

# Rename node_modules path → _packages so CF Pages will deploy the
# contents. The new name is a regular directory (no special meaning to
# CF Pages or to bundlers), and bundlers don't write hardcoded refs to
# the dir name anywhere else.
if [ -d "dist/app/assets/node_modules" ]; then
  echo "[build-cf-pages] rerouting assets/node_modules → assets/_packages"
  mv dist/app/assets/node_modules dist/app/assets/_packages

  # Patch every generated file that may reference the old path. JS
  # bundles, CSS sourcemaps, HTML SSR snapshots, and JSON manifests are
  # all candidates. Quoted-string occurrences only — anything that
  # mentions the literal substring `assets/node_modules/` gets rewritten.
  # Use perl for cross-platform in-place edit (BSD sed on macOS rejects
  # GNU `sed -i` syntax, so we sidestep sed entirely here).
  find dist/app \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.map' \) -type f -print0 \
    | xargs -0 perl -i -pe 's|assets/node_modules/|assets/_packages/|g'
fi

# Expo Web emits `<title data-rh="true"></title>` (react-helmet anchor)
# and fills it at runtime via per-route JS. Before JS hydrates the browser
# falls back to the hostname (e.g. "moavoca") as the tab title, which
# looks lowercase + unbranded. Inject "MoaVoca" as the default so the
# tab reads correctly on first paint; per-route titles still override
# once the app boots.
echo "[build-cf-pages] injecting default <title>MoaVoca</title>"
find dist/app -name '*.html' -type f -print0 \
  | xargs -0 perl -i -pe 's|<title data-rh="true"></title>|<title data-rh="true">MoaVoca</title>|g'

echo "[build-cf-pages] copying landing + legal pages to dist root"
cp index.html privacy.html terms.html business-info.html licenses.html data.html probability.html _redirects _headers googlea7e926c78ec67b7e.html robots.txt sitemap.xml og-image.png dist/

# Universal Link / App Link verification files. CF Pages drops dotfile
# directories (incl. .well-known) during deploy, so we ship them under a
# regular dist/well-known/ directory and rewrite the canonical
# /.well-known/* paths to it via _redirects. Apple swcd and Android's
# Digital Asset Links verifier see normal 200 JSON responses at the
# canonical URL — the rewrite is transparent.
echo "[build-cf-pages] copying well-known association files (dotless dir for CF Pages)"
mkdir -p dist/well-known
cp well-known/apple-app-site-association well-known/assetlinks.json dist/well-known/

echo "[build-cf-pages] done. dist/ size:"
du -sh dist/ dist/app/ dist/app/assets/ 2>/dev/null || true
