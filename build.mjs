// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// Every visual representation in this project is an HOMAGE to classic hardware.
// There is no affiliation with, or endorsement by, any of the original designers
// or manufacturers; their layouts appear here only because they are familiar
// interfaces, and every name they are known by remains the property of its owner.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build: compile every source in sources.json into one dist/app.js.
 *
 * The app used to ship its .jsx files raw and let Babel-standalone compile them
 * in the browser on every load — 2.4MB of compiler plus ~1.3s of CPU before a
 * single pad appeared. This does that work once, here.
 *
 *   node build.mjs              compile
 *   node build.mjs --check      exit 1 if either bundle is stale
 *   node build.mjs --check gui  one of them, by name
 *
 * A stale bundle also names the sources that are uncommitted right now, because
 * this bundle is one concatenation of 130 files shared by every session in this
 * checkout and the reader needs to know whether the red is theirs. PLAN-851.01.
 *
 * Sources stay as .jsx and are edited normally; only the output is generated.
 *
 * The test gate below runs test/check_case_floor.mjs, which is exactly what
 * `npm test` and check.sh's sampler lane run — the build gate and the check
 * lane are ONE assertion, floor included, not two that can drift apart.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { transformSync } from '@babel/core';

const SOURCES = JSON.parse(readFileSync('sources.json', 'utf8'));
const OUT = 'dist/app.js';

// The second bundle: the effect FACEPLATES, and nothing under them.
//
// APK:OS loads the Sampler's engines directly out of this tree — see
// Mixer/dsp/load-sampler-dsp.js — because a copy is a fork. It could not load
// the panels the same way: they are .jsx, and the shell has no compiler. So it
// drew its own, and the desk's reverb became four unlabelled sliders over a
// VARC 444 that has a real faceplate sitting right here.
//
// dist/app.js cannot be the answer. It carries the ENGINES too, and running
// them a second time in a window whose desk is already passing audio resets
// every unit and re-sizes every array against a pad count the desk had widened.
// So the panels get a bundle of their own, holding only what the engines do not
// already provide, and the shell loads it ON TOP of the DSP it already has.
//
// sources.gui.json must stay a SUBSEQUENCE of sources.json — same dependency
// order, fewer files — which check_mixer_dsp.mjs asserts.
const GUI_SOURCES = JSON.parse(readFileSync('sources.gui.json', 'utf8'));
const GUI_OUT = 'dist/gui.js';
const check = process.argv.includes('--check');

// WHICH bundle --check is asked about. Both are in the repository now and both
// are published — `dist/gui.js` because APK:OS loads the faceplates out of the
// checkout, `dist/app.js` because PLAN-364.01 put this app's own page on
// apk.audio — so the unnamed form is the one a gate wants, and check.sh runs
// it. The named form is kept for the case the argument was invented for: a
// tree that deliberately holds only one of the two.
//
//   node build.mjs --check        both, and what check.sh runs
//   node build.mjs --check gui    one of them, by name
//
// Named, never inferred from what happens to be on disk: "the file is not
// there" and "the file is stale" are the same picture to a lane that skips,
// and only one of them is somebody forgetting to build.
const checkOnly = process.argv[process.argv.indexOf('--check') + 1];
if (check && checkOnly !== undefined && !['app', 'gui'].includes(checkOnly)) {
  console.error(`✗ --check ${checkOnly} — the bundles are 'app' and 'gui'.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// The tests run BEFORE the compile, and a failure means no bundle.
//
// The alternative — build first, test separately, notice later — is how a
// broken bundle reaches the site: the deploy workflow's only gate is that
// `node build.mjs` exits zero, so if compiling is all this does, compiling is
// all that is ever checked. Anything that still parses gets shipped.
//
// So the gate lives here, where it cannot be walked around by running the
// build a different way. Every plugin's test pattern is under test/ and they
// take about a second between them.
//
//   node build.mjs --skip-tests   compile without the gate
//
// which exists for bisecting a bad commit and for nothing else. It prints a
// warning every time so it cannot quietly become the normal way to build.
//
// ONE RUNNER, ONE FLOOR. This spawns test/check_case_floor.mjs — the same thing
// `npm test` runs, and therefore the same thing check.sh's sampler lane runs —
// rather than `node --test` over its own directory listing. It used to do its
// own discovery with identical glob semantics and no floor under it, so the two
// entry points disagreed about what a green suite was: measured 2026-09-07 at
// HEAD, renaming `test/chopper.test.mjs` alone took the suite from 222 cases /
// 36 suites to 201 / 32 — `npm test` exited 1 and named the shortfall, and
// `node build.mjs` printed `✓ tests pass` and rewrote BOTH bundles. This is the
// runner that decides what ships, so it was the one with nothing under it.
//
// Do not put the second spawn back for speed. A build gate and a check lane
// that run different suites are two facts, and only one of them is on the site.
// ---------------------------------------------------------------------------
const FLOOR_RUNNER = 'test/check_case_floor.mjs';

const runTests = () => {
    if (process.argv.includes('--skip-tests')) {
        console.warn('⚠️  --skip-tests: compiling WITHOUT running the plugin tests.');
        return;
    }

    // NOT a skip. `if (!existsSync('test')) return;` stood here, and a test
    // directory renamed away compiled and shipped in silence — the extreme case
    // of the shortfall the floor exists to catch, waved through by the one gate
    // the deploy actually reads. A missing runner is a red build.
    if (!existsSync(FLOOR_RUNNER)) {
        console.error(`✗ ${FLOOR_RUNNER} is missing — there is no suite to run,`);
        console.error('  which is not the same fact as nothing being broken.');
        process.exit(1);
    }

    console.log('• running plugin tests…');
    // stdio inherited: the floor runner tees the test output through to its own
    // stdout as it arrives, so nothing is buffered away by going through it.
    // No arguments — it takes only --set-baseline, and lowering the floor is a
    // deliberate act, never a side effect of a build.
    const r = spawnSync(process.execPath, [FLOOR_RUNNER], { stdio: 'inherit' });

    if (r.error) {
        console.error(`✗ could not run the tests: ${r.error.message}`);
        process.exit(1);
    }
    if (r.status !== 0) {
        console.error('');
        console.error('✗ Tests failed, or the suite got smaller — dist/ was NOT rebuilt,');
        console.error('  so the last good bundle is untouched.');
        console.error('  Fix the failures above, or run with --skip-tests if you know why.');
        process.exit(r.status || 1);
    }
    console.log('✓ tests pass');
};

// A hash of every input; stamped into the bundle so --check can tell whether
// the committed output still matches the sources without recompiling blind.
const fingerprintOf = (files) => {
  const h = createHash('sha256');
  for (const f of files) h.update(f).update(readFileSync(f));
  return h.digest('hex').slice(0, 16);
};
const stamp = fingerprintOf(SOURCES);
const guiStamp = fingerprintOf(GUI_SOURCES);

// WHICH OF THIS BUNDLE'S SOURCES ARE UNCOMMITTED, and therefore whose the red is.
//
// Thirteen agent sessions run against one working tree and `dist/app.js` is one
// concatenation of every source, so the instant ANY session has an uncommitted
// file under `libControl/`, `--check` goes red for EVERYBODY — and the only
// command that clears it writes a bundle carrying that session's in-flight
// work. A session that reads the cross has to be able to tell "mine" from
// "somebody else's", and the stamp mismatch alone says neither. PLAN-851.01.
//
// `git` is asked once, for the whole source list, and a checkout that has no
// git (a tarball, a container without the binary) simply gets no extra line
// rather than a build that cannot run.
const dirtySources = (files) => {
  try {
    // `-z`, because every path in this checkout contains a colon and a space
    // and git quotes those in the human form — the reader would get
    // `"APK:PODS/…/SAMPLE and PLAY/libControl/x.jsx"` with the quotes in it.
    const out = execFileSync('git', ['status', '--porcelain', '-z', '--', ...files],
                             { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    // Paths come back relative to the repository root; this app's own prefix is
    // dropped so the list reads like `sources.json` does.
    const here = 'SAMPLE and PLAY/';
    return out.split('\0')
      .filter(Boolean)
      .map((entry) => entry.slice(3))
      .map((f) => (f.includes(here) ? f.slice(f.indexOf(here) + here.length) : f));
  } catch {
    return null;
  }
};

/// Say what the cross is ABOUT, in the terms the reader can act on.
const explainStale = (files) => {
  const dirty = dirtySources(files);
  if (dirty === null) {
    console.error('  (git could not be asked which sources are uncommitted)');
    return;
  }
  if (dirty.length === 0) {
    console.error('  Every source is committed, so this is a bundle that is simply older than '
                + 'them — rebuilding commits nobody else\'s work.');
    return;
  }
  const one = dirty.length === 1;
  console.error(`  ${dirty.length} of its sources ${one ? 'is' : 'are'} UNCOMMITTED right now, `
              + `and a rebuild would put ${one ? 'it' : 'them'} in the bundle:`);
  for (const f of dirty.slice(0, 10)) console.error(`    · ${f}`);
  if (dirty.length > 10) console.error(`    · …and ${dirty.length - 10} more`);
  console.error('  If none of those are yours, the red is not yours to clear: rebuilding would '
              + 'commit another session\'s work under your subject line.');
};

if (check) {
  // Both outputs, and a failure in either is a failure. A stale gui.js is the
  // quieter of the two: the app still runs, and it is only the shell's effect
  // panels that fall back to the generated grid, which looks like a panel
  // rather than like a build that was not run.
  let stale = 0;
  const wanted = [[OUT, stamp, 'OA_BUILD_STAMP', 'app', SOURCES],
                  [GUI_OUT, guiStamp, 'OA_GUI_BUILD_STAMP', 'gui', GUI_SOURCES]]
    .filter(([, , , name]) => checkOnly === undefined || name === checkOnly);
  for (const [out, want, mark, , files] of wanted) {
    if (!existsSync(out)) {
      console.error(`✗ ${out} is missing — run: ./build.sh`);
      stale++;
      continue;
    }
    if (!readFileSync(out, 'utf8').includes(`${mark}="${want}"`)) {
      console.error(`✗ ${out} is STALE — sources changed since it was built.`);
      console.error('  Run ./build.sh and commit the result.');
      explainStale(files);
      stale++;
      continue;
    }
    console.log(`✓ ${out} is up to date (${want})`);
  }
  process.exit(stale ? 1 : 0);
}

// Nothing is written until this returns.
runTests();

// Human-readable release stamp shown in the footer: VYYYYMMDD.HHMM in UTC.
//
// Taken from the last COMMIT that touched a source file, not from the clock.
// Wall-clock time made every machine produce a different bundle, so CI's
// rebuild-and-commit step (.github/workflows/build.yml) saw a diff on every
// run and pushed a "Build: recompile dist/" commit after each push, forever.
// Keyed to the sources, the same commit always builds the same bytes, and a
// push that changes no source leaves the stamp alone.
const p2 = (n) => String(n).padStart(2, '0');
const stampFrom = (date) =>
  `V${date.getUTCFullYear()}${p2(date.getUTCMonth() + 1)}${p2(date.getUTCDate())}`
  + `.${p2(date.getUTCHours())}${p2(date.getUTCMinutes())}`;

// ONE VERSION PER BUNDLE, NOT ONE PER RUN. A single stamp taken across every
// app source restamped `dist/gui.js` whenever an app-only file moved — 239 KB
// of tracked bundle going dirty with its content hash unchanged, in a checkout
// thirteen sessions share, for a change to a file the GUI bundle does not
// contain. Keying the clock to the last commit (above) fixed the every-run
// case; this fixes the every-app-edit case, which is the one PLAN-980.01
// measured: `1 1 dist/gui.js`, `OA_BUILD_VERSION` moved and
// `OA_GUI_BUILD_STAMP 02558f5effa161b4` did not.
//
// `sources.json` is NOT in the GUI list. It decides which files the APP bundle
// carries and cannot change a byte of the GUI one; `sources.gui.json` and this
// script can, and are.
const versionFor = (files) => {
  try {
    // %cI = committer date, ISO-8601. Limited to the compiled sources plus this
    // script, so a README or workflow edit does not bump the release stamp.
    const iso = execFileSync(
      'git', ['log', '-1', '--format=%cI', '--', ...files],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return iso ? stampFrom(new Date(iso)) : stampFrom(new Date());
  } catch {
    // No git (a source tarball, a stripped CI image) — fall back to build time.
    return stampFrom(new Date());
  }
};

const version = versionFor([...SOURCES, 'build.mjs', 'sources.json', 'sources.gui.json']);
const guiVersion = versionFor([...GUI_SOURCES, 'build.mjs', 'sources.gui.json']);

// ---------------------------------------------------------------------------
// The licence banner
//
// Every source file carries it, which is right: a file that gets copied out of
// this repo on its own should take its licence and its attribution with it.
// Ninety copies of the same ten lines inside ONE bundle is a different question
// — it is sixty kilobytes of identical text on every page load, and a reader
// who opens dist/app.js scrolls past the same notice ninety times.
//
// So the concatenation lifts it out of each file and the bundle carries one, at
// the top, where it is actually read. The MIT requirement is that the notice
// travels with the copy; it says nothing about saying it ninety times.
// ---------------------------------------------------------------------------
const BANNER_RE = /^\/\/ ─+ Sampler\.Like\.Audio ─+\r?\n(?:\/\/[^\n]*\r?\n)*?\/\/ ─+\r?\n\r?\n?/;

const BANNER = `/*
 * ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
 * https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
 *
 * MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
 *
 * Every visual representation in this project is an HOMAGE to classic hardware.
 * There is no affiliation with, or endorsement by, any of the original designers
 * or manufacturers; their layouts appear here only because they are familiar
 * interfaces, and every name they are known by remains the property of its owner.
 * ─────────────────────────────────────────────────────────────────────────────
 */`;

/**
 * Compile one list of sources into one bundle.
 *
 * `mark` is the global the stamp is written to, and it differs per bundle on
 * purpose: dist/app.js and dist/gui.js can both be in one window — APK:OS opens
 * the Pads in one display and the desk in another — and a shared stamp would
 * have the second load claim to be the first.
 */
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

const compile = (files, out, mark) => {
  const parts = [
    BANNER,
    '/* GENERATED by build.mjs — do not edit. Edit the .jsx/.js sources instead. */',
    `window.${mark}="${mark === 'OA_BUILD_STAMP' ? stamp : guiStamp}";`,
    // A DIFFERENT GLOBAL PER BUNDLE, for the reason the line above already
    // gives about the stamp: both bundles can be live in one window, and now
    // that their versions can legitimately differ, one shared name would make
    // the footer show whichever loaded last. `Footer.jsx` reads
    // `OA_BUILD_VERSION` and belongs to the app bundle, so the app keeps that
    // name and the GUI bundle takes its own.
    mark === 'OA_BUILD_STAMP'
      ? `window.OA_BUILD_VERSION="${version}";`
      : `window.OA_GUI_BUILD_VERSION="${guiVersion}";`,
    '(function(){"use strict";',
  ];

  let jsx = 0, plain = 0, bytesIn = 0;
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    bytesIn += raw.length;
    // Stripped here, emitted once above.
    const code = raw.replace(BANNER_RE, '');
    let out2 = code;
    if (file.endsWith('.jsx')) {
      out2 = transformSync(code, {
        filename: file,
        presets: [['@babel/preset-react', { runtime: 'classic' }]],
        compact: false,
        babelrc: false,
        configFile: false,
      }).code;
      jsx++;
    } else {
      plain++;
    }
    // Each file gets its own scope. Without this, top-level `const`s in different
    // files collide — several declare the same helper names, `workletEngine`
    // above all. Cross-file sharing is via window.* only.
    //
    // NOT what separate <script> tags gave: classic scripts share ONE top-level
    // lexical environment, so `const workletEngine` in the second file to declare
    // it throws "already been declared" and that file never runs. APK:OS loads
    // these sources directly rather than through this bundle and hit exactly
    // that — see Mixer/dsp/load-sampler-dsp.js, which applies this same wrapper
    // at load time.
    parts.push(`\n/* ---- ${file} ---- */`);
    parts.push('(function(){');
    parts.push(out2);
    parts.push('})();');
  }
  parts.push('})();');

  mkdirSync('dist', { recursive: true });
  const bundle = parts.join('\n');
  writeFileSync(out, bundle);

  console.log(`✓ ${out}  ${jsx} jsx + ${plain} js  ${kb(bytesIn)} in -> ${kb(bundle.length)} out  [${mark === 'OA_BUILD_STAMP' ? stamp : guiStamp}] ${mark === 'OA_BUILD_STAMP' ? version : guiVersion}`);
};

compile(SOURCES, OUT, 'OA_BUILD_STAMP');

// The faceplates alone, for a host that already has the engines. Built second
// so a failure here cannot leave dist/app.js half-written.
compile(GUI_SOURCES, GUI_OUT, 'OA_GUI_BUILD_STAMP');

// ---------------------------------------------------------------------------
// Precache manifest: everything the running machine can possibly need, so the
// service worker can hold the whole thing and never touch the network again.
// ---------------------------------------------------------------------------
// PRECACHE IS A VIEW OF `findable`, NOT A FOURTH QUESTION. It was its own
// four-wide literal — wav|mp3|ogg|flac — against a findable list of twenty, so
// an .aif, .m4a or .opus dropped into SampleLibrary/ was served by the site and
// never held offline: the one sound that fails when the visitor loses the
// network. The decision (PLAN-774.01): if the sound browser will FIND it and a
// pad will play it, the offline copy must exist, or "works offline" is a claim
// with a hole in it whose shape nobody can state.
//
// SIZE IS THE OTHER ARGUMENT AND IT IS NOT THIS LIST'S TO MAKE. A 70 MB sample
// should be excluded for being 70 MB, which is a fact about the file and not
// about its container; an extension list that means "and also not too big" is a
// budget written in the wrong units, and it was silently excluding four decodable
// formats to enforce a budget nobody had stated. The manifest prints its total
// below — that is where a budget goes when somebody wants one.
//
// READ, NOT RETYPED. libControl/MusicChart/oaWithoutContainer.js is the one file
// that holds the vocabulary and it is a browser IIFE over `window`, so it is
// evaluated here against a bare object exactly as test/containers.test.mjs does
// it. A copy here would be the eighth copy PLAN-705.01 removed.
const CONTAINER_FILE = 'libControl/MusicChart/oaWithoutContainer.js';
const vocabulary = {};
new Function('window', readFileSync(CONTAINER_FILE, 'utf8'))(vocabulary);
if (typeof vocabulary.oaIsFindableAudio !== 'function') {
  throw new Error(`${CONTAINER_FILE} no longer defines oaIsFindableAudio — `
    + 'the precache manifest cannot be built without the container vocabulary.');
}

const walk = (dir, hit = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, hit);
    else hit.push(p);
  }
  return hit;
};

const precache = [
  './',
  './index.html',
  './manifest.json',
  './dist/app.js',
  './dist/gui.js',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  ...walk('ICON and LOGO').map((p) => `./${p}`),
  ...(existsSync('SampleLibrary') ? walk('SampleLibrary') : [])
    .filter((p) => vocabulary.oaIsFindableAudio(p))
    .map((p) => `./${p.split('/').map(encodeURIComponent).join('/')}`),
];

writeFileSync('dist/precache.json', JSON.stringify(precache, null, 1));
const bytes = precache
  .filter((p) => p !== './')
  .reduce((a, p) => {
    try { return a + statSync(decodeURIComponent(p.slice(2))).size; } catch (e) { return a; }
  }, 0);
console.log(`✓ dist/precache.json  ${precache.length} entries, ${kb(bytes)} held in cache`);
