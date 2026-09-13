// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: containers.test.mjs
 * Purpose: The audio container vocabulary is TWO lists in ONE file, held to the
 *   order `droppable ≡ findable ⊆ nameable` — PLAN-705.01.
 * Description: The app asks three different questions about a file extension:
 *   what a directory walk will FIND, what a drop will ACCEPT, and what gets
 *   STRIPPED off a sound's name. They were three hand-maintained lists in seven
 *   copies and no two of the three agreed, so:
 *
 *     · `.mov` was findable and droppable and NOT nameable — the exporter wrote
 *       `Take 3.mov.PEAK`, with the container in the middle of the name.
 *     · `.opus`, `.oga` and `.wave` were findable and NOT droppable — a file the
 *       browser listed was refused by the pad it was dragged onto.
 *     · `.aifc` was nameable and NOT findable, while `oaDecodeAudio` carries a
 *       hand-written AIFC parser because Chromium has none. The app could decode
 *       a format it could not find.
 *
 *   THE CONTAINMENT IS THE POINT, NOT THE MEMBERSHIPS. Any extension that is
 *   findable and not nameable IS the `Take 3.mov.PEAK` bug — it does not need to
 *   be predicted, it needs to be impossible. So the first suite asserts the
 *   order rather than a spelling, and a format added to findable alone turns it
 *   red without anybody having to remember why.
 *
 *   THE SECOND SUITE IS WHY THERE WERE SEVEN COPIES. A regex literal is cheap to
 *   retype, and four `AUDIO_RE` copies drifted from the naming list while
 *   staying byte-identical to each other — `check_doc_forks`-style equality
 *   would have called them healthy. So this counts the alternation literals in
 *   THE WHOLE APP -- build.mjs, sw.js and this suite included, `dist/` and
 *   `vendor/` aside -- and requires that both live in oaWithoutContainer.js.
 *   There is no baseline file: the count is two and there is nowhere for a
 *   third to hide.
 *
 *   IT WALKED ONLY libControl/ UNTIL PLAN-774.01, because that is where the
 *   seven copies had been, and two more were sitting just outside it: the
 *   precache filter in build.mjs, four containers wide against a findable list
 *   of twenty, so an AIFF dropped into SampleLibrary/ was served online and
 *   missing offline; and an assertion in chopper.test.mjs that hand-typed six
 *   of the twenty-three nameable containers, and therefore passed a pad label
 *   reading `Take 3.mov — Slice 1`. A gate that walks less than the thing it
 *   guards is a gate with a doorway beside it. Both now read the vocabulary.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { BUNDLE_SOURCES } from './bundleSources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER_FILE = 'libControl/MusicChart/oaWithoutContainer.js';

/**
 * Load the vocabulary the way the bundle does — one IIFE, one shared `window`,
 * nothing else present. Deliberately NOT through harness.mjs: this file owns no
 * audio, and a sandbox with one source in it cannot pass because something else
 * happened to define the same global.
 */
function loadVocabulary() {
    const src = readFileSync(join(ROOT, CONTAINER_FILE), 'utf8');
    const window = {};
    new Function('window', src)(window);
    return window;
}

/** The alternation out of `/\.(a|b|c)$/i` as a lower-case Set. */
function extsOf(re) {
    const m = /^\\\.\(([^)]+)\)\$$/.exec(re.source);
    assert.ok(m, `not the expected \\.(a|b|c)$ shape: ${re.source}`);
    return new Set(m[1].toLowerCase().split('|'));
}

/** Every .js/.jsx under libControl/, relative to the app root. */
function libControlSources(dir = join(ROOT, 'libControl'), out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) libControlSources(p, out);
        else if (/\.jsx?$/.test(name)) out.push(relative(ROOT, p));
    }
    return out;
}

/**
 * WHAT IS NOT GENERATED AND NOT SOMEBODY ELSE'S — every .js/.jsx/.mjs the app
 * root holds, `dist/` and `vendor/` and `node_modules/` aside.
 *
 * `dist/` is compiled FROM libControl, so it carries a copy of every list by
 * construction and asserting on it would be asserting on the compiler.
 * `vendor/` is React. Everything else is ours: the build script, the service
 * worker and the test suite included, because the two copies this walk was
 * widened to catch (PLAN-774.01) were in build.mjs and in a test.
 */
const NOT_OURS = new Set(['dist', 'vendor', 'node_modules', '.git']);
function appSources(dir = ROOT, out = []) {
    for (const name of readdirSync(dir)) {
        if (NOT_OURS.has(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) appSources(p, out);
        else if (/\.(?:jsx?|mjs)$/.test(name)) out.push(relative(ROOT, p));
    }
    return out;
}

describe('the container vocabulary is ordered, not merely present', () => {
    const w = loadVocabulary();

    test('all three questions are answerable, and by this one file', () => {
        assert.ok(w.OA_AUDIO_CONTAINER instanceof RegExp, 'OA_AUDIO_CONTAINER');
        assert.ok(w.OA_AUDIO_FINDABLE instanceof RegExp, 'OA_AUDIO_FINDABLE');
        assert.equal(typeof w.oaIsFindableAudio, 'function');
        assert.equal(typeof w.oaIsDroppableAudio, 'function');
        assert.equal(typeof w.oaWithoutContainer, 'function');
    });

    test('neither regex is global — a shared /g instance lies every second call', () => {
        for (const [name, re] of [['OA_AUDIO_CONTAINER', w.OA_AUDIO_CONTAINER],
                                  ['OA_AUDIO_FINDABLE', w.OA_AUDIO_FINDABLE]]) {
            assert.equal(re.global, false, `${name} must not carry /g`);
            assert.equal(re.test('kick.wav'), re.test('kick.wav'), `${name} is stateful`);
        }
    });

    test('findable ⊆ nameable — anything else IS the Take 3.mov.PEAK bug', () => {
        const findable = extsOf(w.OA_AUDIO_FINDABLE);
        const nameable = extsOf(w.OA_AUDIO_CONTAINER);
        const orphans = [...findable].filter((e) => !nameable.has(e));
        assert.deepEqual(orphans, [],
            `findable but not nameable — these keep their extension in every name ` +
            `the app gives them, exactly as .mov did: ${orphans.join(', ')}`);
    });

    test('every findable extension really is stripped off a name', () => {
        for (const ext of extsOf(w.OA_AUDIO_FINDABLE)) {
            assert.equal(w.oaWithoutContainer(`Take 3.${ext}`), 'Take 3',
                `.${ext} survives naming — the exporter would write Take 3.${ext}.PEAK`);
            assert.ok(w.oaIsFindableAudio(`Take 3.${ext}`), `.${ext} is not findable`);
        }
    });

    test('nameable is a STRICT superset, and the extras are the undecodables', () => {
        const findable = extsOf(w.OA_AUDIO_FINDABLE);
        const extras = [...extsOf(w.OA_AUDIO_CONTAINER)].filter((e) => !findable.has(e)).sort();
        // Nothing in this repository decodes these — not Chromium, and not the
        // hand-written AIFF/AIFC parser in oaDrumkitAudio.js — so nothing walks
        // to them. A name that arrives already carrying one still loses it.
        assert.deepEqual(extras, ['caf', 'w64', 'wma']);
        for (const ext of extras) {
            assert.equal(w.oaWithoutContainer(`Kick.${ext}`), 'Kick');
            assert.equal(w.oaIsFindableAudio(`Kick.${ext}`), false);
        }
    });

    test('.aifc is findable — this repo carries its decoder', () => {
        // oaDrumkitAudio.js parses FORM/AIFC by hand "because Chromium can't".
        const decoder = readFileSync(join(ROOT, 'libControl/SoundSynth/oaDrumkitAudio.js'), 'utf8');
        assert.match(decoder, /'AIFC'/, 'the AIFC branch of oaDecodeAudio has gone');
        assert.ok(w.oaIsFindableAudio('Strings.aifc'),
            'the app decodes AIFC but the sound browser cannot list one');
    });
});

describe('droppable ≡ findable, plus the OS', () => {
    const w = loadVocabulary();
    const file = (name, type = '') => ({ name, type });

    test('a drop accepts exactly what a walk finds', () => {
        for (const ext of extsOf(w.OA_AUDIO_FINDABLE)) {
            assert.ok(w.oaIsDroppableAudio(file(`Take 3.${ext}`)),
                `.${ext} is listed by the browser and refused by the pad`);
        }
    });

    test('the three that the old drop filter refused', () => {
        // Measured members of findable \ droppable before PLAN-705.01. An OS
        // that hands over no MIME type made each of these a dead drop.
        for (const ext of ['opus', 'oga', 'wave', 'avi', 'm4v', '3gp', 'flv']) {
            assert.ok(w.oaIsDroppableAudio(file(`Loop.${ext}`)), `.${ext}`);
        }
    });

    test('the OS is asked first, so an unknown container with an audio type is taken', () => {
        assert.ok(w.oaIsDroppableAudio(file('mystery.xyz', 'audio/basic')));
        assert.equal(w.oaIsDroppableAudio(file('notes.txt', 'text/plain')), false);
        assert.equal(w.oaIsDroppableAudio(file('clip.mkv', 'video/x-matroska')), true);
        assert.equal(w.oaIsDroppableAudio(null), false);
        assert.equal(w.oaIsDroppableAudio(undefined), false);
    });

    test('a name is still a name — the dot that is not a container survives', () => {
        // PLAN-573.01 / PLAN-602.01: `Kick 90.5 Loop` came back as `Kick 90`.
        assert.equal(w.oaWithoutContainer('Kick 90.5 Loop'), 'Kick 90.5 Loop');
        assert.equal(w.oaWithoutContainer(''), '');
        assert.equal(w.oaWithoutContainer(null), '');
        assert.equal(w.oaIsFindableAudio(null), false);
        assert.equal(w.oaIsFindableAudio('Kick 90.5 Loop'), false);
    });
});

describe('there is one copy of each list, and this is what stops the eighth', () => {
    // A regex literal alternating three or more audio container extensions.
    // Anchored on the alternation itself rather than on the name `AUDIO_RE`,
    // because the four copies that drifted were byte-identical to each other and
    // only one of them was even called that.
    //
    // THE TAIL IS OPTIONAL, AND THAT IS THE SECOND THING THIS PATTERN LEARNT.
    // It used to require the alternation be closed by `)$/`, which is how the
    // precache filter in build.mjs was written -- but chopper.test.mjs closed
    // its copy with a word boundary instead, and so a list of six containers
    // sat inside the very suite that guards the vocabulary, invisible to this
    // scan, passing a pad label that still carried `.mov` (PLAN-774.01). A list
    // is a list wherever it is anchored.
    //
    // AND THE LITERALS ARE NOT QUOTED ANYWHERE IN THIS FILE, deliberately: a
    // comment that spells one out is a copy of the vocabulary, and this test
    // catches its own prose. Both offenders are described in words above.
    const ALTERNATION = /\/\\\.\((?:[a-z0-9+]+\|){2,}[a-z0-9+]+\)(?:\$|\\b)?\/[gimsuy]*/g;

    test('both alternations live in oaWithoutContainer.js and nowhere else', () => {
        const found = [];
        for (const rel of appSources()) {
            const src = readFileSync(join(ROOT, rel), 'utf8');
            for (const m of src.matchAll(ALTERNATION)) {
                // `.peak|json` sidecars are a different population and only two wide.
                if (/wav|mp3|aiff?|flac|ogg/i.test(m[0])) found.push([rel, m[0]]);
            }
        }
        const files = [...new Set(found.map(([f]) => f))].sort();
        assert.deepEqual(files, [CONTAINER_FILE],
            `an audio container list has been retyped outside ${CONTAINER_FILE}:\n` +
            found.map(([f, m]) => `    ${f}  ${m}`).join('\n'));
        assert.equal(found.length, 2, 'exactly two lists: findable and nameable');
    });

    test('every consumer asks the helper rather than a literal', () => {
        const consumers = {
            'libControl/SoundBrowser/gatherAll.js': 'oaIsFindableAudio',
            'libControl/SoundBrowser/gatherMatching.js': 'oaIsFindableAudio',
            'libControl/SoundBrowser/useSoundBrowseState.js': 'oaIsFindableAudio',
            'libControl/App/App.jsx': 'oaIsDroppableAudio',
            'libControl/Pads/Pad.jsx': 'oaIsDroppableAudio',
        };
        for (const [rel, helper] of Object.entries(consumers)) {
            const src = readFileSync(join(ROOT, rel), 'utf8');
            assert.match(src, new RegExp(`window\\.${helper}\\(`),
                `${rel} no longer routes through window.${helper}`);
        }
    });

    test('nobody binds the vocabulary at module load — sources.json order forbids it', () => {
        // oaWithoutContainer.js sits BELOW its consumers in sources.json, so a
        // top-level `const X = window.OA_AUDIO_FINDABLE` would bind undefined.
        const self = BUNDLE_SOURCES.indexOf(CONTAINER_FILE);
        assert.ok(self >= 0, `${CONTAINER_FILE} is not in sources.json`);
        for (const rel of libControlSources()) {
            const src = readFileSync(join(ROOT, rel), 'utf8');
            if (rel === CONTAINER_FILE) continue;
            assert.doesNotMatch(src, /^(?:const|let|var)\s+\w+\s*=\s*window\.(OA_AUDIO_FINDABLE|OA_AUDIO_CONTAINER|oaIsFindableAudio|oaIsDroppableAudio)\b/m,
                `${rel} binds the vocabulary at module load; it must be read at call time`);
        }
    });
});
