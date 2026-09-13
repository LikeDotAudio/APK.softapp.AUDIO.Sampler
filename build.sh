#!/usr/bin/env bash
# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub

# ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
# https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
#
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
#
# Every visual representation in this project is an HOMAGE to classic hardware.
# There is no affiliation with, or endorsement by, any of the original designers
# or manufacturers; their layouts appear here only because they are familiar
# interfaces, and every name they are known by remains the property of its owner.
# ─────────────────────────────────────────────────────────────────────────────
# Compile the .jsx/.js sources into dist/app.js. Run this after editing anything
# under libControl/ so your local copy of the app matches your sources.
#
# The plugin tests under test/ run FIRST and a failure stops the build before
# anything is written, so a red test leaves the last good bundle in place rather
# than replacing it with a broken one. `npm test` runs them on their own.
#
# COMMIT THE BUNDLE. dist/app.js and dist/gui.js are TRACKED — `.gitignore`
# ignores the rest of dist/ and then names those two as exceptions, with the
# argument for it; read it there rather than here.
#
# Nothing rebuilds them for you. The only workflow in this repository is
# .github/workflows/ci.yml, whose own header says it verifies nothing on
# purpose: one FTPS session that uploads the files as they stand IN THE
# CHECKOUT. No build step runs there. So the bytes on https://apk.audio/ are
# the bytes somebody committed, and a session that edits a .jsx, runs this
# script and commits only the source ships yesterday's bundle.
#
# `npm run check` (build.mjs --check) hashes the sources against both bundles
# and says which is stale; the repository's own `npm run check:js` calls it.
# Run it before you push, because nothing downstream will.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules/@babel/core ]; then
  echo "Installing build dependencies (one time)…"
  npm install --silent
fi

node build.mjs "$@"
