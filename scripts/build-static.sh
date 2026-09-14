#!/usr/bin/env bash
# Static export of the game: the bundle the desktop shell wraps
# (desktop/), and what a plain static host serves.
#
# THE BUILD RUNS ON A COPY, NEVER ON THE LIVE TREE. The editor API routes
# (app/api/*) are dev-only tools — they already refuse to run in
# production — but their POST handlers make `output: "export"` fail the
# build outright, so they cannot be present while it runs. This script
# used to move them aside and put them back afterwards, and on Windows
# that `mv` fails the moment any `next dev` is up: Turbopack holds the
# directory open for its file watcher, and Windows will not rename a
# directory something has a handle on. A build that only works once every
# dev server on the machine is shut down is a build nobody runs.
#
# So the tree is mirrored into .static-stage/ (gitignored), app/api is
# deleted THERE, where nothing is watching it, and the export runs there.
# The live tree is never touched and dev servers never notice. The stage
# is kept between builds rather than made fresh each time, so webpack's
# cache under .static-stage/.next/cache survives and a rebuild is
# incremental; everything else in it is wiped and re-mirrored, so a file
# deleted from the source cannot linger in the bundle. node_modules is
# LINKED in, not copied — half a gigabyte, and copying it would be the
# slowest part of the build — as a directory junction on Windows (a real
# symlink there needs a privilege an ordinary shell does not have) and a
# symlink anywhere else.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
STAGE="$ROOT/.static-stage"

# MSYS rewrites any argument that starts with a slash into a Windows path,
# which turns `mklink /J` into `mklink J:\` — off for the whole script
export MSYS_NO_PATHCONV=1

on_windows() { case "$OSTYPE" in msys*|cygwin*) return 0 ;; *) return 1 ;; esac; }
winpath() { cygpath -w "$1"; }

mkdir -p "$STAGE/.next"

# Wipe the stage except the two things worth keeping: the link and the
# cache. THE LINK GOES FIRST, AND BY NAME. On Windows a junction is removed
# with rmdir, which drops the link and only the link; nothing here ever
# runs `rm -rf` on a path that could resolve to the real node_modules.
if [ -e "$STAGE/node_modules" ]; then
  if on_windows; then
    cmd /c rmdir "$(winpath "$STAGE/node_modules")"
  else
    rm "$STAGE/node_modules"
  fi
fi
find "$STAGE" -mindepth 1 -maxdepth 1 ! -name .next -exec rm -rf {} +
find "$STAGE/.next" -mindepth 1 -maxdepth 1 ! -name cache -exec rm -rf {} +

# The heads and the core are authored in docs/turret-concepts/ and served
# from public/foundry/ (scripts/sync-foundry-art.mjs); sync before the
# mirror so the bundle carries the sheet as it stands, not as it stood.
node scripts/sync-foundry-art.mjs

# The mirror: everything the build reads, nothing it generates. tar rather
# than rsync because Git Bash ships the one and not the other.
# .next-* GOES TOO, AND THAT ONE IS LOAD-BEARING. `npm run dev` builds
# into a directory per port (.next-3000, .next-3001 — desktop-dev.mjs
# sets NEXT_DIST_DIR), tsconfig.json names those directories in its
# `include`, and Next writes a generated type per route into each one.
# Copying them into the stage hands the export a type file importing
# app/api/balance/route.js — which the line below deletes on purpose — so
# the build dies on a dangling import that has nothing to do with the
# game. `--exclude=./.next` does NOT cover them: it is a literal path,
# not a prefix. QUOTED, so the shell leaves the glob for tar.
tar -cf - \
  --exclude=./node_modules --exclude=./.git --exclude=./.next --exclude='./.next-*' \
  --exclude=./out \
  --exclude=./desktop --exclude=./.playtest --exclude=./.claude \
  --exclude=./.static-stage --exclude=./.api-stash \
  . | tar -xf - -C "$STAGE"

# the whole point: the routes come out of the COPY
rm -rf "$STAGE/app/api"

if on_windows; then
  cmd /c mklink /J "$(winpath "$STAGE/node_modules")" "$(winpath "$ROOT/node_modules")" >/dev/null
else
  ln -s "$ROOT/node_modules" "$STAGE/node_modules"
fi

(cd "$STAGE" && BUILD_TARGET=static npx next build)

# The bundle lands where it always has: the shell loads <root>/out
# (desktop/src/main.ts) and a static host serves it from there.
rm -rf "$ROOT/out"
mv "$STAGE/out" "$ROOT/out"

echo
echo "Static bundle in out/"
