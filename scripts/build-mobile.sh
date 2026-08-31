#!/usr/bin/env bash
# Static export for the Capacitor shell.
#
# The editor API routes (app/api/*) are dev-only tools — they already
# refuse to run in production — but their POST handlers make `output:
# "export"` fail the build outright, so they are set aside for the
# duration of the export and always restored, even when the build dies.
set -euo pipefail
cd "$(dirname "$0")/.."

API_DIR="app/api"
STASH_DIR=".api-stash"

if [ -d "$STASH_DIR" ]; then
  echo "error: $STASH_DIR already exists — a previous build died before" >&2
  echo "restoring it; move it back to $API_DIR by hand first" >&2
  exit 1
fi

mv "$API_DIR" "$STASH_DIR"
restore() { mv "$STASH_DIR" "$API_DIR"; }
trap restore EXIT

BUILD_TARGET=mobile npx next build

echo
echo "Static bundle in out/ — now run: npx cap sync"
