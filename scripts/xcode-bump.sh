#!/bin/bash
# Xcode Scheme PreAction wrapper for bump-version.mjs.
# Xcode launches with a minimal PATH (no nvm/brew), so set it up here.

set -e

# Resolve project root from this script's location.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Find a usable node: nvm default → homebrew → /usr/local.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" > /dev/null 2>&1 || true
fi
export PATH="$HOME/.nvm/versions/node/$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if ! command -v node > /dev/null 2>&1; then
  echo "[xcode-bump] node not found in PATH; skipping bump" >&2
  exit 0
fi

LOG="$PROJECT_ROOT/scripts/.xcode-bump.log"
{
  echo "---- $(date) ----"
  cd "$PROJECT_ROOT"
  node scripts/bump-version.mjs
} 2>&1 | tee -a "$LOG"
