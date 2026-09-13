// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: bundleSources.mjs
 * Purpose: Own the ONE answer to "which files, in which order" for both the
 *   test harness and the gate that checks it. `sources.json` is the record;
 *   nothing here re-types it.
 * Description: `build.mjs` concatenates every entry of `sources.json` into
 *   `dist/app.js` IN THAT ORDER, each file in its own IIFE, so cross-file
 *   sharing happens through `window.*` alone and the LAST definition of a name
 *   wins. A harness that loads a subset therefore does not merely test less —
 *   it composes a DIFFERENT window, in which a name can resolve to a twin the
 *   browser overwrites and the browser's winner is absent entirely.
 *
 *   THAT IS NOT HYPOTHETICAL. `BACKEND_SOURCES` was a literal array kept in
 *   step with `sources.json` by remembering to, and it had drifted to 28 of the
 *   57 `.js` entries — exactly half the audio layer. It loaded
 *   `oaDrumkitAudio.js` and not `oaRecordings.js`, so `window.oaEncodeWav`
 *   inside every test resolved to the twin that never ran in the browser, and
 *   it was the twin that worked. PLAN-646.01's defect — two export buttons
 *   throwing TypeError — was invisible to a green suite for its whole life.
 *   PLAN-703.01.
 *
 *   DERIVED, NOT LISTED, so it cannot drift again. A file added to
 *   `sources.json` joins the harness on the next run, or is refused by name in
 *   `HARNESS_EXCLUDES` with a reason. There is no third option and no silent
 *   subset.
 *
 *   ORDER IS LOAD-BEARING AND IS `sources.json`'s. `oaWithoutContainer.js` sits
 *   BELOW its consumers in that file, which is why PLAN-705.01 has them read
 *   the container lists off `window` at call time rather than at load time.
 *   Preserving the file's order is what keeps that arrangement honest; sorting
 *   or grouping this list would hide the very hazard it exists to reproduce.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every entry of `sources.json`, in the order `build.mjs` concatenates them. */
export const BUNDLE_SOURCES = JSON.parse(
    readFileSync(join(ROOT, 'sources.json'), 'utf8'),
);

/**
 * The mount point. `App.jsx` calls `ReactDOM.render` at load, so it is the file
 * that puts the app on a page — and there is no page in a test. Every component
 * it would mount is loaded; only the mounting is skipped.
 */
export const MOUNT_POINT = 'libControl/App/App.jsx';

/**
 * Every source but the mount point — the list the render suites open a warm
 * world with.
 *
 * ONE CONSTANT, NOT FIVE COPIES. `chopper`, `lenses`, `panels`,
 * `console-surface` and `emitLensExports` each carried an identical
 * `JSON.parse(readFileSync(sources.json)).filter(f => f !== App.jsx)`, so the
 * answer to "which files, in which order" had five places to drift from — the
 * exact arrangement PLAN-703.01 closed for `BACKEND_SOURCES` and left standing
 * here. PLAN-814.01.
 */
export const ALL_SOURCES = BUNDLE_SOURCES.filter((f) => f !== MOUNT_POINT);

/**
 * Bundle entries the backend world deliberately does not load, and why.
 *
 * A REASON PER ENTRY, because the previous arrangement's reason was a sentence
 * in a docstring ("the subset with no React in it") that turned out to be false
 * of every file it was keeping out: measured 2026-09-07, all 29 missing `.js`
 * files evaluate in this harness without throwing. Not one of them touches
 * `React` at module scope — the hooks only dereference it inside the function
 * they export. So the exclusion list for `.js` is EMPTY, and the 29 are in.
 *
 * `.jsx` is excluded by rule rather than by name: it needs a Babel pass and a
 * real React to render, which is what `createWarmWorld({ sources, React })`
 * and `ALL_SOURCES` above are for. Keyed by path, so a `.jsx` entry cannot end
 * up here by accident.
 */
export const HARNESS_EXCLUDES = Object.freeze({
    // (empty — every `.js` entry of sources.json loads)
});

/** True for a bundle entry the backend world is expected to evaluate. */
const isBackend = (f) => /\.js$/.test(f) && !(f in HARNESS_EXCLUDES);

/**
 * Every non-JSX source, in `sources.json` order — the audio layer as the
 * browser actually composes it.
 */
export const BACKEND_SOURCES = BUNDLE_SOURCES.filter(isBackend);

/**
 * Bundle entries accounted for by neither the harness nor a named exclusion.
 * The gate in `globals.test.mjs` holds this at zero; it is exported rather than
 * recomputed there so there is one definition of "accounted for".
 */
export const unaccountedSources = () => BUNDLE_SOURCES.filter(
    (f) => /\.js$/.test(f) && !BACKEND_SOURCES.includes(f) && !(f in HARNESS_EXCLUDES),
);
