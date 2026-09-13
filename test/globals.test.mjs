// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: globals.test.mjs
 * Purpose: No name in the bundle's one shared namespace may be DEFINED by two
 *   source files — PLAN-646.01, generalising the single case PLAN-572.01 fixed.
 * Description: `build.mjs` concatenates every entry of `sources.json` into one
 *   `dist/app.js`, each file in its own IIFE, so the only way two files can
 *   speak to each other is `window.*`. That makes `window` a namespace with no
 *   declaration and no collision error: two files assigning the same name is
 *   legal JavaScript, the later entry in `sources.json` wins silently, and the
 *   loser ships to the visitor as dead bytes.
 *
 *   TWICE NOW, AND THE SECOND ONE WAS NOT HARMLESS. PLAN-572.01 found
 *   `ScanalyzerView` written by a 384-line component and then by a one-line
 *   alias in the very next entry; the dead twin was equivalent, so it cost
 *   bytes. PLAN-646.01 found `oaEncodeWav` written by `oaDrumkitAudio.js`
 *   (`(audioBuffer) → ArrayBuffer`) and then by `oaRecordings.js`
 *   (`(channels, sampleRate) → Blob`). Those are two functions, not one — and
 *   `useSeqRenderer.js` was calling the survivor with the dead one's argument,
 *   so the sequencer's Loop and Stems exports threw `TypeError: Cannot read
 *   properties of undefined (reading 'length')` into a `catch` that only
 *   `console.error`s. Two user-facing export buttons did nothing at all.
 *
 *   ANCHORED AT COLUMN 0, WHICH IS THE WHOLE DESIGN. A DEFINITION is a
 *   module-level assignment; a RUNTIME assignment inside a function is shared
 *   state and is allowed to have many writers. `window.OA_SOUND_DIR` is the
 *   live example — `oaDrumkitStorage.js:297` and `useSoundBrowseState.js:185`
 *   both set it, both indented, both correct. An unanchored scan reports that
 *   pair as a fault forever, which is how a gate gets switched off.
 *
 *   NO BASELINE FILE. The count is zero and it was taken to zero in one
 *   sitting, so there is nowhere for the next collision to hide.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { BUNDLE_SOURCES, BACKEND_SOURCES, HARNESS_EXCLUDES, unaccountedSources }
    from './bundleSources.mjs';

const TESTDIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TESTDIR, '..');

/** Module-level `window.NAME =` (not `==`/`===`), in sources.json load order. */
const DEFINES = /^window\.([A-Za-z_$][\w$]*)\s*=(?!=)/gm;

/**
 * A file opening the source list for itself, rather than importing it.
 *
 * ASSEMBLED, NOT WRITTEN OUT, so this file can name what it looks for without
 * tripping its own gate — the same trick `chopper.test.mjs` uses for the alias
 * it forbids.
 */
const DIRECT_READ = new RegExp(
    String.raw`readFileSync\([^)]*` + ['sources', 'json'].join(String.raw`\.`),
);

/**
 * A spread of the source list followed by string literals, up to the closing
 * bracket: `[...BACKEND_SOURCES, 'a.js', 'b.js']`. Assembled from parts for the
 * same reason `DIRECT_READ` is — this file must not trip its own gate while
 * naming what it looks for.
 */
const REDUNDANT_APPEND = new RegExp(
    String.raw`\[\s*\.\.\.` + ['BACKEND', 'SOURCES'].join('_') + String.raw`\s*,([^\]]*)\]`,
    'g',
);

/** The paths a `[...BACKEND_SOURCES, …]` literal appends, as written. */
function appendedPaths(text) {
    const found = [];
    for (const match of text.matchAll(REDUNDANT_APPEND)) {
        for (const literal of match[1].matchAll(/['"]([^'"]+)['"]/g)) {
            found.push(literal[1]);
        }
    }
    return found;
}

const bundleSources = () => BUNDLE_SOURCES.filter((f) => /\.jsx?$/.test(f));

describe('the one shared namespace the bundle has', () => {
    test('no global is defined at module level by two source files', () => {
        const writers = new Map();
        for (const f of bundleSources()) {
            const src = readFileSync(join(ROOT, f), 'utf8');
            for (const m of src.matchAll(DEFINES)) {
                if (!writers.has(m[1])) writers.set(m[1], new Set());
                writers.get(m[1]).add(f);
            }
        }
        const collisions = [...writers]
            .filter(([, files]) => files.size > 1)
            .map(([name, files]) => `${name}: ${[...files].join(' then ')}`);

        assert.deepEqual(collisions, [],
            'a later entry in sources.json silently overwrites an earlier definition');
    });

    test('the scan can actually see a collision', () => {
        // A gate that cannot fail measures nothing. Two synthetic files, the
        // same name, and the scan must find them — otherwise the assertion
        // above is green because the regex matched nothing at all.
        const fixture = ['window.oaThing = 1;\n', 'window.oaThing = 2;\n'];
        const writers = new Map();
        fixture.forEach((src, i) => {
            for (const m of src.matchAll(DEFINES)) {
                if (!writers.has(m[1])) writers.set(m[1], new Set());
                writers.get(m[1]).add(`fixture-${i}.js`);
            }
        });
        assert.equal(writers.get('oaThing').size, 2);
    });

    test('an indented runtime assignment is not a definition', () => {
        // window.OA_SOUND_DIR, the false positive this anchoring exists for.
        const src = 'function pick(root) {\n    window.OA_SOUND_DIR = root;\n}\n';
        assert.deepEqual([...src.matchAll(DEFINES)], []);
    });
});

describe('the two WAV encoders, which were one name until PLAN-646.01', () => {
    const read = (f) => readFileSync(join(ROOT, f), 'utf8');

    test('neither encoder answers to the ambiguous name any more', () => {
        for (const f of bundleSources()) {
            assert.ok(!/\boaEncodeWav\b(?!From)/.test(read(f)),
                `${f} still names oaEncodeWav, which took two different signatures`);
        }
    });

    test('each encoder is defined exactly once, and by the file that owns it', () => {
        const definedIn = (name) => bundleSources()
            .filter((f) => new RegExp(`^window\\.${name}\\s*=(?!=)`, 'm').test(read(f)));

        assert.deepEqual(definedIn('oaEncodeWavFromBuffer'),
            ['libControl/SoundSynth/oaDrumkitAudio.js']);
        assert.deepEqual(definedIn('oaEncodeWavFromChannels'),
            ['libControl/SoundBrowser/oaRecordings.js']);
    });

    test('every caller passes the argument its encoder is named for', () => {
        // The defect in one assertion: an AudioBuffer reached the (channels,
        // sampleRate) form, whose `channels[0].length` threw. These three call
        // sites are the whole set; a fourth one is caught by the pair above.
        const callers = {
            'libControl/Sequencer/useSeqRenderer.js': /oaEncodeWavFromBuffer\((loopBuf|stemBuf)\)/g,
            'libControl/SoundBrowser/SoundRecorder.jsx': /oaEncodeWavFromChannels\(merged, rate\)/g,
        };
        for (const [f, re] of Object.entries(callers)) {
            assert.ok([...read(f).matchAll(re)].length > 0, `${f} lost its encoder call`);
        }
        assert.equal([...read('libControl/Sequencer/useSeqRenderer.js')
            .matchAll(/oaEncodeWavFromBuffer\(/g)].length, 2,
            'the sequencer exports a loop and a stem, and both go through the buffer form');
    });

    test('the buffer form encodes an AudioBuffer into a RIFF/WAVE header', () => {
        // Run the shipping source, not a copy of it: the file is evaluated the
        // way build.mjs would concatenate it, and the real function is called.
        const win = {};
        new Function('window', read('libControl/SoundSynth/oaDrumkitAudio.js'))(win);

        const frames = 100;
        const buf = {
            numberOfChannels: 2, length: frames, sampleRate: 48000,
            __c: [new Float32Array(frames), new Float32Array(frames)],
            getChannelData(i) { return this.__c[i]; },
        };
        buf.__c[0][0] = 1.0;
        buf.__c[1][0] = -1.0;

        const out = win.oaEncodeWavFromBuffer(buf);
        assert.ok(out instanceof ArrayBuffer, 'the buffer form returns an ArrayBuffer, not a Blob');
        assert.equal(out.byteLength, 44 + frames * 2 * 2);

        const dv = new DataView(out);
        const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
        assert.equal(tag(0), 'RIFF');
        assert.equal(tag(8), 'WAVE');
        assert.equal(dv.getUint16(22, true), 2, 'channel count');
        assert.equal(dv.getUint32(24, true), 48000, 'sample rate');
        assert.equal(dv.getInt16(44, true), 0x7FFF, 'full-scale positive clamps to +32767');
        assert.equal(dv.getInt16(46, true), -0x8000, 'full-scale negative clamps to -32768');
    });

    test('the channels form still refuses to take an AudioBuffer', () => {
        // The proof that these were never interchangeable. Handing the channels
        // form an AudioBuffer is exactly what useSeqRenderer.js did, and it is
        // still a TypeError — which is why the fix had to be two names and not
        // a coercion at one of them.
        const win = {};
        new Function('window', 'Blob', read('libControl/SoundBrowser/oaRecordings.js'))(
            win, class { constructor(p, o) { this.parts = p; this.type = (o || {}).type; } });

        const audioBuffer = {
            numberOfChannels: 2, length: 100, sampleRate: 48000,
            getChannelData() { return new Float32Array(100); },
        };
        assert.throws(() => win.oaEncodeWavFromChannels(audioBuffer), TypeError);

        const blob = win.oaEncodeWavFromChannels([new Float32Array(10), new Float32Array(10)], 44100);
        assert.equal(blob.type, 'audio/wav');
    });
});

describe('the window the harness composes is the window build.mjs builds', () => {
    // PLAN-703.01. The collision scan above proves no NAME has two writers.
    // This proves the tests are looking at the same set of writers the browser
    // is — which is the assumption the scan above, and every other case in this
    // suite, silently rests on.

    test('every .js entry of sources.json is loaded by the harness or excluded by name', () => {
        // A LITERAL LIST DRIFTED TO HALF THE BUNDLE, and nothing said so: on
        // 2026-09-07 `BACKEND_SOURCES` named 28 of the 57 `.js` entries, so
        // `window.oaEncodeWav` inside these tests resolved to the twin that
        // `build.mjs` overwrites — the one that worked — while the browser ran
        // the one that threw. There is no baseline file here on purpose. The
        // count is zero and it was taken to zero in one sitting.
        assert.deepEqual(unaccountedSources(), [],
            'a source in the bundle that the harness neither loads nor names a reason for');
    });

    test('an exclusion carries a reason, and only for a file in the bundle', () => {
        for (const [path, reason] of Object.entries(HARNESS_EXCLUDES)) {
            assert.ok(BUNDLE_SOURCES.includes(path),
                `${path} is excluded from the harness but is not in sources.json at all`);
            assert.ok(typeof reason === 'string' && reason.length > 20,
                `${path} is excluded with no reason worth reading`);
        }
    });

    test('the harness loads in sources.json order, because last definition wins', () => {
        // ORDER IS THE OTHER HALF OF THE DEFECT. `build.mjs` concatenates in
        // this order and the last `window.X =` wins, so a harness that loaded
        // the same files in a different order would compose a different window
        // from the same set. It would also break PLAN-705.01's arrangement,
        // where `oaWithoutContainer.js` sits BELOW its consumers and they read
        // the container lists off `window` at call time for that reason.
        const positions = BACKEND_SOURCES.map((f) => BUNDLE_SOURCES.indexOf(f));
        assert.ok(positions.every((n) => n >= 0), 'the harness loads a file not in the bundle');
        assert.deepEqual(positions, [...positions].sort((a, b) => a - b),
            'the harness loads the bundle out of build order');
    });

    test('nothing under test/ re-reads sources.json for itself', () => {
        // THE OTHER HALF OF THE SAME DEFECT. PLAN-703.01 made the HARNESS read
        // the record instead of retyping it, and left seven test files each
        // opening `sources.json` with their own readFileSync and their own
        // filter — including four identical copies of "every source but the
        // mount point". A second reader is a second thing to drift, and the
        // drift is invisible: a suite composing its own window is green about a
        // window the browser never builds. `bundleSources.mjs` is the one
        // reader; everything else imports from it. PLAN-814.01.
        //
        // The needle is assembled rather than written out, so this file does
        // not trip its own gate while naming what it looks for.
        const offenders = readdirSync(TESTDIR)
            .filter((f) => f.endsWith('.mjs') && f !== 'bundleSources.mjs')
            .filter((f) => DIRECT_READ.test(readFileSync(join(TESTDIR, f), 'utf8')));

        assert.deepEqual(offenders, [],
            'a test file reads the source list itself instead of importing bundleSources.mjs');
    });

    test('the direct-read scan can actually see a violation', () => {
        // A gate that cannot fail measures nothing — the third time this suite
        // makes that argument, and the reason all three are here.
        const violation = "const all = JSON.parse(readFileSync(join(ROOT, 'sources"
            + ".json'), 'utf8'));\n";
        assert.ok(DIRECT_READ.test(violation));
        assert.ok(!DIRECT_READ.test("import { BUNDLE_SOURCES } from './bundleSources.mjs';\n"));
    });

    test('no test file appends a path BACKEND_SOURCES already contains', () => {
        // THE THIRD LIST OF THIS SHAPE, AND IT CAME BACK INSIDE AN HOUR.
        // PLAN-814.01 deleted `CHOPPER_SOURCES` and `SCANNER_SOURCES` — each
        // `[...BACKEND_SOURCES, <a path already in BACKEND_SOURCES>]` — and
        // gated only the OTHER half of that defect, the direct read above. A
        // fresh `SCANNER_SOURCES` was written in `chromaFixture.mjs` during
        // that same session, and `padmeta.test.mjs` had been carrying the same
        // shape with three paths all along.
        //
        // WHAT IT COSTS is not a duplicate import: it is a world in which the
        // appended module is evaluated LAST, after every other source, instead
        // of at the index `build.mjs` concatenates it at. Last definition wins
        // in one shared namespace — that is the whole argument of the suite
        // above — so a suite built this way is green about a window the browser
        // never builds. It has been harmless three times running because those
        // particular modules are idempotent on a second evaluation, which is
        // luck and not a property anybody asserted. PLAN-814.02.
        const offenders = [];
        for (const file of readdirSync(TESTDIR).filter((f) => f.endsWith('.mjs'))) {
            for (const path of appendedPaths(readFileSync(join(TESTDIR, file), 'utf8'))) {
                if (BACKEND_SOURCES.includes(path)) {
                    offenders.push(`${file} appends ${path}, already `
                        + `BACKEND_SOURCES[${BACKEND_SOURCES.indexOf(path)}]`);
                }
            }
        }
        assert.deepEqual(offenders, [],
            'a test file re-appends a source the harness already loads, which moves it to '
            + 'the end of the world it composes');
    });

    test('the redundant-append scan can actually see a violation', () => {
        // A gate that cannot fail measures nothing — the fourth time this suite
        // makes that argument. The needle is the real defect's exact shape, and
        // the control is the same literal appending a path that genuinely is
        // NOT in the list, which is a sources.json finding and not this one.
        const real = BACKEND_SOURCES[0];
        const needle = `const S = [...BACKEND_` + `SOURCES,\n    '${real}',\n];`;
        assert.deepEqual(appendedPaths(needle), [real]);
        assert.ok(BACKEND_SOURCES.includes(real));

        const innocent = `const S = [...BACKEND_` + `SOURCES,\n    'not/in/the/list.js'];`;
        assert.deepEqual(appendedPaths(innocent), ['not/in/the/list.js']);
        assert.ok(!BACKEND_SOURCES.includes('not/in/the/list.js'));

        assert.deepEqual(appendedPaths('const S = BACKEND_' + 'SOURCES;'), []);
    });

    test('the gap scan can actually see a file that went missing', () => {
        // A gate that cannot fail measures nothing — the same argument the
        // collision scan above makes for itself. Drop one entry and the
        // accounting must notice; this is the shape the real defect had.
        const dropped = BACKEND_SOURCES[0];
        const shrunk = BACKEND_SOURCES.filter((f) => f !== dropped);
        const gap = BUNDLE_SOURCES.filter(
            (f) => /\.js$/.test(f) && !shrunk.includes(f) && !(f in HARNESS_EXCLUDES),
        );
        assert.deepEqual(gap, [dropped]);
    });
});
