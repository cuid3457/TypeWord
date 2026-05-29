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
  find dist/app \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.map' \) -type f -print0 \
    | xargs -0 sed -i 's|assets/node_modules/|assets/_packages/|g'
fi

echo "[build-cf-pages] copying landing + legal pages to dist root"
cp index.html privacy.html terms.html business-info.html licenses.html _redirects _headers googlea7e926c78ec67b7e.html dist/

echo "[build-cf-pages] done. dist/ size:"
du -sh dist/ dist/app/ dist/app/assets/ 2>/dev/null || true
