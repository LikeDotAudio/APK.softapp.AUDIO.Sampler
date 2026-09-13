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
 * Header: chopper.test.mjs
 * Purpose: What Chop to 16 Pads writes onto the pads, and where that name came
 *   from — the only text a visitor reads after the chop, asserted rather than
 *   eyeballed.
 * Description: `oaChopSongToPads` (oaDeepScanner.js) builds every pad label as
 *   `<filename minus extension> — <key centre or Slice N>`. Four behaviours hang
 *   off that one line and a fifth hangs off the callers: the extension is
 *   stripped, an absent name becomes `Track`, a chunk with no key centre becomes
 *   `Slice N`, a section's key centre wins when there is one, and THE NAME IS THE
 *   ONE IT WAS HANDED.
 *
 *   THE FIFTH IS WHY THIS FILE EXISTS. `MusicChartOverlay` passed the constant
 *   "01 Track 01.m4a" to the chopper until PLAN-437.01, so every song came up
 *   labelled after a file that is in no tree. The suite ran 184 cases green on
 *   both sides of that fix, because nothing here called the chopper at all. A
 *   constant satisfies every single-call assertion ever written, so the case
 *   that catches one CHOPS TWICE with two different names and compares the two
 *   label sets — one call cannot tell a value from a literal, and two can.
 *
 *   The caller cases drive the real button. `MusicChartOverlay` is rendered, the
 *   Chop to 16 Pads element is found in its tree, and its onClick is fired — so
 *   the assertion covers the prop path from the pad entry through SamplerEditor
 *   and into the chopper, which is where the defect actually lived. Asserting on
 *   the source text instead would pass against a component that never reads it.
 *
 *   The last block covers the SAME SPECIES on the export path (PLAN-491.01).
 *   `SamplerEditor` renders the Scanalyzer four lines below the overlay, and it
 *   handed that one the stand-in `"sample.wav"` as tier one of a three-tier
 *   fallback — so the two sibling props in one JSX block disagreed about what an
 *   empty pad is called. That name is exported: it titles the `.lrc` and names
 *   the `.PEAK`. Both props are asserted here so they cannot drift apart again.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld, createWarmWorld, BACKEND_SOURCES } from './harness.mjs';
import { ALL_SOURCES, BUNDLE_SOURCES } from './bundleSources.mjs';
import { makeReact } from './fakeReact.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Eight seconds at 48k — sixteen half-second slices when nothing chunks it. */
const song = (ctx) => ctx.createBuffer(1, 48000 * 8, 48000);

/**
 * The labels the chopper just wrote, in pad order.
 *
 * OA_DRUM_SAMPLES is an OBJECT keyed by pad index, not an array — a kit is
 * sparse, and pad 9 can be loaded while pads 0-8 are bare. Sorted numerically,
 * because Object.keys on a numeric-keyed object is insertion order.
 */
const padLabels = (window) =>
    Object.keys(window.OA_DRUM_SAMPLES || {})
        .map(Number)
        .sort((a, b) => a - b)
        .map((k) => window.OA_DRUM_SAMPLES[k])
        .filter(Boolean)
        .map((e) => e.name);

/**
 * `\.(a|b|c)\b`, built from the app's own nameable list.
 *
 * OA_AUDIO_CONTAINER is anchored at `$` because it answers "does this NAME end
 * in a container"; a pad label is `<name> — Slice 1`, so the container it must
 * not carry sits in the MIDDLE. Same alternation, different anchor — and taking
 * the alternation apart here rather than retyping it is the whole point.
 */
const anyContainerIn = (window) => {
    const re = window.OA_AUDIO_CONTAINER;
    assert.ok(re instanceof RegExp, 'OA_AUDIO_CONTAINER is not in this world');
    const m = /^\\\.\(([^)]+)\)\$$/.exec(re.source);
    assert.ok(m, `not the expected \\.(a|b|c)$ shape: ${re.source}`);
    return new RegExp(`\\.(${m[1]})\\b`, 'i');
};

/** Depth-first search of a fakeReact element tree. */
const findElement = (node, pred) => {
    if (node == null || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
        for (const n of node) { const hit = findElement(n, pred); if (hit) return hit; }
        return null;
    }
    if (pred(node)) return node;
    return findElement(node.children || [], pred);
};

/** The green Chop to 16 Pads button, found by the label a visitor reads. */
const chopButton = (tree) => findElement(tree, (n) =>
    n.type === 'button'
    && (n.children || []).some((c) => typeof c === 'string' && c.includes('Chop to 16 Pads')));

describe('chop to 16 pads — the label on every pad', () => {
    test('the extension is stripped and the slice number follows the name', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const { window, ctx } = w;

        const loaded = window.oaChopSongToPads(song(ctx), 'Kick Loop 90.wav', null);
        assert.equal(loaded, 16, 'the chopper did not fill sixteen pads');

        const labels = padLabels(window);
        assert.equal(labels[0], 'Kick Loop 90 — Slice 1');
        assert.equal(labels[15], 'Kick Loop 90 — Slice 16');
        // A label carrying an extension is the sound's FILE name, not the
        // sound's name, and it is what the pad grid has to draw in 60 pixels.
        //
        // ASKED OF THE VOCABULARY, NOT OF A LITERAL. This assertion used to
        // hand-type six extensions against a nameable list of twenty-three, so
        // `Take 3.mov — Slice 1` passed the very test written to forbid it
        // (PLAN-774.01). The list is read out of the same window the chopper
        // ran in, so a container added to oaWithoutContainer.js is covered here
        // the moment it is added and nobody has to remember this line exists.
        const stray = anyContainerIn(window);
        labels.forEach((l) => assert.ok(!stray.test(l),
            `pad label still carries a file extension: ${l}`));

        w.cleanup();
    });

    test('no name at all becomes Track, never undefined and never a bare dash', async () => {
        for (const nameless of ['', undefined, null]) {
            const w = await createWorld({ sources: BACKEND_SOURCES });
            const { window, ctx } = w;

            window.oaChopSongToPads(song(ctx), nameless, null);
            const labels = padLabels(window);

            assert.equal(labels[0], 'Track — Slice 1', `filename ${JSON.stringify(nameless)}`);
            labels.forEach((l) => {
                assert.ok(!/undefined|null/.test(l), `pad label leaked a JS value: ${l}`);
                assert.ok(!l.startsWith(' —') && !l.startsWith('—'),
                    `pad label opens with a dangling em-dash: ${JSON.stringify(l)}`);
            });

            w.cleanup();
        }
    });

    test('two chops with two names produce two label sets — a constant cannot', async () => {
        // THE CASE PLAN-437.01 NEEDED. One call proves a label is well formed;
        // only a second call proves the label came from the argument. The old
        // defect passed a literal, so both sets would be identical here.
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const { window, ctx } = w;

        window.oaChopSongToPads(song(ctx), 'Kick Loop 90.wav', null);
        const first = padLabels(window);

        window.oaChopSongToPads(song(ctx), 'Brass Stab C.aiff', null);
        const second = padLabels(window);

        assert.equal(first.length, 16);
        assert.equal(second.length, 16);
        assert.notDeepEqual(second, first, 'two different songs were labelled identically');
        assert.equal(second[0], 'Brass Stab C — Slice 1');
        first.forEach((l) => assert.ok(l.startsWith('Kick Loop 90 — ')));
        second.forEach((l) => assert.ok(l.startsWith('Brass Stab C — ')));

        w.cleanup();
    });

    test('a scanned section names the pad after its key centre, not Slice N', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const { window, ctx } = w;

        const chart = {
            sections: [
                { start_seconds: 0, end_seconds: 2, key_center: 'Amaj' },
                { start_seconds: 2, end_seconds: 4, key_center: 'F#m' },
                // A section the scanner could not key. The label falls back to
                // the slice number rather than printing a bare dash.
                { start_seconds: 4, end_seconds: 6, key_center: '' },
            ],
        };
        const loaded = window.oaChopSongToPads(song(ctx), 'Kick Loop 90.wav', chart);
        assert.equal(loaded, 3, 'a three-section chart must fill three pads, not sixteen');

        const labels = padLabels(window);
        assert.deepEqual(labels, [
            'Kick Loop 90 — Amaj',
            'Kick Loop 90 — F#m',
            'Kick Loop 90 — Slice 3',
        ]);

        // The chunk boundaries travel with the label, or the pad plays the
        // wrong two seconds under the right name.
        assert.equal(window.OA_DRUM_SAMPLES[1].offset, 2);
        assert.equal(window.OA_DRUM_SAMPLES[1].end, 4);

        w.cleanup();
    });

    test('an explicit chunk map outranks the sections beside it', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const { window, ctx } = w;

        window.oaChopSongToPads(song(ctx), 'Kick Loop 90.wav', {
            chunk_maps: [{ chunk_index: 0, start_seconds: 1, end_seconds: 3, root_note_name: 'Ddim' }],
            sections: [{ start_seconds: 0, end_seconds: 8, key_center: 'Cmaj' }],
        });

        assert.deepEqual(padLabels(window), ['Kick Loop 90 — Ddim']);
        w.cleanup();
    });

    test('a dot in the middle of a pad name is part of the name, not an extension', async () => {
        // THE CASE PLAN-490.01 DID NOT HAVE. Its nine cases covered this line and
        // not this defect: `Kick Loop 90.wav` -> `Kick Loop 90` and "no label
        // carries a known extension" are BOTH satisfied by
        // `filename.replace(/\.[^/.]+$/, "")`, because that pattern is "a dot and
        // then no more dots", not "a container this app can name". Nothing chopped
        // a dotted name, so nothing saw `Kick 90.5 Loop` come up as `Kick 90` on
        // all sixteen pads. Reinstating the old expression turns this red.
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const { window, ctx } = w;

        assert.equal(window.oaChopSongToPads(song(ctx), 'Kick 90.5 Loop', null), 16);
        const labels = padLabels(window);
        assert.equal(labels[0], 'Kick 90.5 Loop — Slice 1');
        assert.equal(labels[15], 'Kick 90.5 Loop — Slice 16');

        w.cleanup();
    });

    test('a container the list knows goes whatever its case, and one it does not stays', async () => {
        // The exporter's list and the pad grid's list are now the same list —
        // `window.oaWithoutContainer`. These are the pad-grid half of the pair
        // asserted on the export half in the last block of this file, so the two
        // surfaces cannot drift back apart.
        for (const [given, want] of [['Loop 4.WAV', 'Loop 4 — Slice 1'],
                                     ['Vox take 2.Flac', 'Vox take 2 — Slice 1'],
                                     ['Amen.ogg', 'Amen — Slice 1'],
                                     // Not an audio container. A name, with a dot in it.
                                     ['Session 3.take7', 'Session 3.take7 — Slice 1']]) {
            const w = await createWorld({ sources: BACKEND_SOURCES });
            const { window, ctx } = w;
            window.oaChopSongToPads(song(ctx), given, null);
            assert.equal(padLabels(window)[0], want, given);
            w.cleanup();
        }
    });

    test('no buffer chops nothing and leaves the kit alone', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const { window } = w;
        assert.equal(window.oaChopSongToPads(null, 'Kick Loop 90.wav', null), 0);
        assert.deepEqual(padLabels(window), []);
        w.cleanup();
    });
});

describe('chop to 16 pads — the name the button hands the chopper', () => {
    test('the overlay chops under the filename it was given, not a constant', async () => {
        // Drives the real button. Until PLAN-437.01 this line read
        // `oaChopSongToPads(audioBuffer, "01 Track 01.m4a", data)`, so this
        // assertion is the one that goes red if the constant comes back.
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window, ctx } = w;

        const rendered = r.render(window.MusicChartOverlay, {
            audioBuffer: song(ctx),
            filename: 'Kick Loop 90.wav',
            chartData: null,
            trim: { in: 0, out: 8, fadeIn: 0, fadeOut: 0 },
            setTrimPoint() {},
            headPos: null,
        });

        const btn = chopButton(rendered.tree);
        assert.ok(btn, 'the Chop to 16 Pads button is not in the overlay tree');
        assert.equal(btn.props.disabled, false, 'the button is disabled with a buffer loaded');

        btn.props.onClick();

        const labels = padLabels(window);
        assert.equal(labels.length, 16);
        assert.equal(labels[0], 'Kick Loop 90 — Slice 1');
        labels.forEach((l) => assert.ok(!/Track 01/.test(l),
            `the overlay labelled a pad after a file nobody opened: ${l}`));

        w.cleanup();
    });

    test('the SAMPLER panel hands the overlay the pad entry own name', async () => {
        // The whole path in one case: a loaded pad → SamplerEditor's filename
        // prop → the overlay's button → the sixteen labels. `SamplerEditor.jsx`
        // passing a stand-in here reads exactly like the defect above.
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window, ctx } = w;

        window.oaSetDrumSample(0, song(ctx), { name: 'Brass Stab C.aiff', folder: 'SampleLibrary' });

        const panel = r.render(window.SamplerEditor, { idx: 0, name: 'Kick', onClose() {} });
        const nameSpan = findElement(panel.tree, (n) => n.type === 'span' && n.props && n.props.title === 'Brass Stab C.aiff');
        assert.ok(nameSpan, 'SamplerEditor sound name span must carry a title attribute with full sample name');

        const overlay = findElement(panel.tree, (n) => n.type === window.MusicChartOverlay);
        assert.ok(overlay, 'SamplerEditor did not render the MusicChartOverlay');
        assert.equal(overlay.props.filename, 'Brass Stab C.aiff',
            'the panel handed the overlay something other than the pad sound own name');

        const rendered = r.render(window.MusicChartOverlay, overlay.props);
        chopButton(rendered.tree).props.onClick();

        assert.equal(padLabels(window)[0], 'Brass Stab C — Slice 1');

        w.cleanup();
    });

    test('an empty pad hands the overlay nothing rather than a plausible name', async () => {
        // Tier one has to be silent when there is no sound, or the chopper own
        // `Track` fallback can never run. A stand-in filename here is the
        // species of defect PLAN-437.01 removed.
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window } = w;

        const panel = r.render(window.SamplerEditor, { idx: 3, name: 'Snare', onClose() {} });
        const overlay = findElement(panel.tree, (n) => n.type === window.MusicChartOverlay);
        assert.ok(overlay, 'SamplerEditor did not render the MusicChartOverlay');
        assert.equal(overlay.props.filename, '',
            'an empty pad was given a filename the visitor never chose');

        w.cleanup();
    });
});

describe('the name the panel hands the exporter', () => {
    test('a loaded pad exports under its own sound name', async () => {
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window, ctx } = w;

        window.oaSetDrumSample(2, song(ctx), { name: 'Brass Stab C.aiff', folder: 'SampleLibrary' });

        const panel = r.render(window.SamplerEditor, { idx: 2, name: 'Hat', onClose() {} });
        const view = findElement(panel.tree, (n) => n.type === window.LensesView);
        assert.ok(view, 'SamplerEditor did not render the Multi-Lens view');
        assert.equal(view.props.filename, 'Brass Stab C.aiff');

        w.cleanup();
    });

    test('an empty pad hands the exporter nothing, not a plausible filename', async () => {
        // THE PLAN-491.01 CASE. `"sample.wav"` here is tier one, so the view's
        // own fallback chain never runs — and the stand-in is a container claim
        // about a buffer nobody decoded.
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window } = w;

        const panel = r.render(window.SamplerEditor, { idx: 5, name: 'Tom', onClose() {} });
        const view = findElement(panel.tree, (n) => n.type === window.LensesView);
        assert.ok(view, 'SamplerEditor did not render the Multi-Lens view');
        assert.equal(view.props.filename, '',
            'the panel guessed a filename for a pad with no sound on it');

        // The two sibling props in one JSX block must agree about an empty pad.
        const overlay = findElement(panel.tree, (n) => n.type === window.MusicChartOverlay);
        assert.equal(view.props.filename, overlay.props.filename,
            'the overlay and the exporter disagree about what an empty pad is called');

        w.cleanup();
    });

    test('no source states an extension it cannot know', async () => {
        // `sample.wav` may appear ONLY in the fallback chain that owns it, and
        // it no longer states a container: the buffer can be a recording that
        // was never a file. A caller passing it is the defect.
        // The list was three files until PLAN-572.01: the third was a dead twin
        // of `LensesView.jsx`, deleted because nothing ever ran it. Asserting
        // over a dead twin is how the twin stayed alive — the fix here had to
        // be applied twice and only one copy could be observed.
        const jsx = ['libControl/Mixer/SamplerEditor.jsx',
                     'libControl/MusicChart/LensesView.jsx']
            .map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]);

        for (const [f, src] of jsx) {
            const offending = src.split('\n')
                .map((l, i) => [i + 1, l])
                .filter(([, l]) => /['"]sample\.wav['"]/.test(l));
            assert.deepEqual(offending, [], `${f} still names a stand-in audio filename`);
        }
    });

    test('retired symbols are not used in source or test code', async () => {
        // PLAN-707.01: Retired symbols must not be used in code (assignments or references),
        // but citations inside comments/docstrings in tests or docs are permitted.
        const RETIRED = [
            ['Scanalyzer', 'View'].join('')
        ];

        const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

        const filesToScan = [
            ...BUNDLE_SOURCES.filter((f) => /\.jsx?$/.test(f)),
            'test/globals.test.mjs',
            'test/chopper.test.mjs'
        ];

        const scanned = filesToScan.map((f) => {
            const raw = readFileSync(join(ROOT, f), 'utf8');
            return [f, stripComments(raw)];
        });

        for (const name of RETIRED) {
            const writesAlias = new RegExp(String.raw`^\s*window\.${name}\s*=`, 'm');
            const namesAlias = new RegExp(name);

            assert.deepEqual(
                scanned.filter(([, code]) => writesAlias.test(code)).map(([f]) => f),
                [],
                `a source assigns window.${name}; the retired symbol has returned as code`
            );
            assert.deepEqual(
                scanned.filter(([, code]) => namesAlias.test(code)).map(([f]) => f),
                [],
                `a source or test file uses code referencing retired symbol ${name}; citations in comments are permitted`
            );
        }
    });
});

describe('the names the exporter writes into the downloads folder', () => {
    // FOUR COMPOSED NAMES, AND ONLY THREE OF THEM ARE DOWNLOADS. `LensesView`
    // builds four names off one `fname`: `.PERF.json`, `.PEAK` and `.lrc` reach
    // `a.download`, and the fourth is the UCS v2.1 catalogue basename, which is
    // drawn on screen and read aloud as the name the file WILL carry while
    // nothing in this app exports a `.wav` at all. It is asserted here because a
    // visitor reads it and copies it, not because a file lands under it.
    //
    // A fifth use carries `fname` VERBATIM: the `[ti:]` tag of the exported
    // `.lrc`. That one must NOT be stripped — it is a title field naming the
    // source file — which is why the strip is a named helper rather than the
    // same expression repeated at five sites.

    /**
     * A PARTIAL, PRE-1.1.0 `.PEAK` — deliberately, and it is not a valid
     * `peak-lens-sidecar`.
     *
     * WHAT IT IS FOR is the IMPORT path, not the export shape. `handleImportFile`
     * reads `musicality` and `loudness_ebu_r128` through `fromSidecarGroup`,
     * which takes BOTH spellings on purpose so that a `.PEAK` already on
     * somebody's disk — version 1.0.0, therefore camelCase — still opens after
     * the 1.1.0 rename. A fixture written in the new spelling would never touch
     * that arm, so the camelCase here is the migration under test and NOT the
     * stale fixture PLAN-1067.03 found in `padmeta.test.mjs`. Its 1.1.0 twin is
     * `sidecar_1_1_0` below, and the case at the end of this block drives both
     * through the real control and asserts they export identically.
     *
     * IT IS ALSO INCOMPLETE ON PURPOSE, and cannot be schema-checked: no
     * `format`, no `schema_version`, no `archival_aes` / `spatial_aes69`, bare
     * numbers in `beat_markers` where the schema wants `{timestamp_seconds,
     * strength}`. Every one of those is a field the import path does not read,
     * and this fixture exists to reach the export buttons past a file dialog.
     * The typed, complete document is `lensesSidecar()` in padmeta.test.mjs.
     */
    const sidecar = {
        musicality: { pitchHz: 220.5, key: 'Amin', bpm: 92, centsOffset: -4 },
        beat_markers: [0.5, 1.0, 1.5],
        loudness_ebu_r128: { integratedLUFS: -14.2, maxTruePeakdBTP: -1.1, lraLU: 6.3 },
        // `lyrics`, not `lyrics_vad`. Nothing in this app runs Voice Activity
        // Detection, so the key that claimed it was renamed on both the
        // exporter and the importer (PLAN-629.01); this fixture drives the real
        // 📥 Import Sidecar/LRC control, so it must be in the shape the
        // importer now reads or the `.LRC` export below has nothing to write.
        lyrics: { words: [{ start: 61.5, text: 'one' }], vadSegments: [] },
    };

    /**
     * The same measurements, spelled the way 1.1.0 writes them.
     *
     * DERIVED FROM THE 1.0.0 FIXTURE RATHER THAN TYPED OUT BESIDE IT, so the
     * two cannot drift into being two different documents — the only thing that
     * may differ between them is the spelling of the nine keys, which is the
     * whole claim. `gating_threshold_lufs` is the fourth loudness key: 1.0.0
     * never wrote it, so the 1.0.0 arm imports it as absent and the exporter
     * fills the slot with `null`, which is what the comparison below expects.
     */
    const sidecar_1_1_0 = {
        ...sidecar,
        musicality: { key: 'Amin', key_confidence: null, pitch_hz: 220.5, cents_offset: -4, bpm: 92 },
        loudness_ebu_r128: {
            integrated_lufs: -14.2, max_true_peak_dbtp: -1.1, lra_lu: 6.3,
            gating_threshold_lufs: null,
        },
    };

    /**
     * Give the world the two browser objects the import path needs.
     *
     * The sources run inside `with (window) { … }`, so a bare `FileReader` in a
     * component body resolves against this object at call time — which is why
     * these can be installed from a test rather than built into the harness.
     */
    const installImportGlue = (window) => {
        window.alert = () => {};
        window.FileReader = class {
            readAsText(file) { this.onload({ target: { result: file.__text } }); }
        };
    };

    /** Fires the real export handler and hands back what the anchor was told. */
    const clickExport = (window, tree, label) => {
        const btn = findElement(tree, (n) => n.type === 'button'
            && (n.children || []).some((c) => typeof c === 'string' && c.includes(label)));
        assert.ok(btn, `no export button labelled ${label}`);
        assert.equal(btn.props.disabled, false, `${label} is disabled with a scan loaded`);

        // The world's `document.createElement` returns a plain object with no
        // click(); the export calls one. Patching it here is what makes the
        // composed name reachable at all — asserting on the source text instead
        // would pass against a component that never runs.
        let seen = null;
        let lastBlob = null;
        const realCreateElement = window.document.createElement;
        const realCreateObjectURL = window.URL.createObjectURL;
        window.URL.createObjectURL = (blob) => { lastBlob = blob; return realCreateObjectURL(blob); };
        window.document.createElement = (tag) => {
            const el = realCreateElement(tag);
            if (String(tag).toLowerCase() === 'a') {
                el.click = () => { seen = { name: el.download, body: lastBlob && lastBlob.__text }; };
            }
            return el;
        };
        try {
            btn.props.onClick();
        } finally {
            window.document.createElement = realCreateElement;
            window.URL.createObjectURL = realCreateObjectURL;
        }
        assert.ok(seen, `${label} wrote no download at all`);
        return seen;
    };

    /** The composed UCS basename as the visitor reads it, or null. */
    const ucsBasename = (tree) => {
        const shown = findElement(tree, (n) => (n.children || []).some(
            (c) => typeof c === 'string' && c.startsWith('MUSC-TONE_')));
        return shown ? shown.children.find((c) => typeof c === 'string') : null;
    };

    /**
     * Render the view with a scan loaded, optionally through the import control.
     *
     * The exports return early on `!scanData` and every lens tab is gated on it,
     * so one render is never enough: the effect starts the auto-scan and a
     * second render is what a visitor actually sees.
     *
     * IT IS POLLED RATHER THAN FLUSHED A FIXED NUMBER OF TIMES. Two `flush()`es
     * stood here and were enough while the scan was synchronous to its return.
     * It now awaits a WebCrypto digest of the decoded PCM (PLAN-601.01), which
     * is one more async hop than a fixed drain happens to cover — the symptom
     * was this file going red about one run in two, on a name assertion, with
     * nothing wrong with the name. The loop waits for the thing it needs
     * instead: a scan on the component, which is exactly what the export
     * buttons' `disabled` reports.
     *
     * `importSidecar` drives the real 📥 Import Sidecar/LRC input, which is the
     * route that produces the `{musicality, loudness, lyrics}` shape from a
     * FILE. The auto-scan produces it too now, which is what PLAN-601.01 fixed;
     * this stays because an imported sidecar must keep overriding a live scan.
     */
    const scannedView = async (w, r, props, importSidecar) => {
        const { window } = w;
        const first = r.render(window.LensesView, props);
        r.runEffects(first);

        let result = r.render(window.LensesView, props, first);
        const scanned = () => {
            result = r.render(window.LensesView, props, first);
            const peak = findElement(result.tree, (n) => n.type === 'button'
                && (n.children || []).some((c) => typeof c === 'string' && c.includes('Export .PEAK')));
            return !!(peak && peak.props.disabled === false);
        };
        assert.ok(await w.settle(scanned), 'the auto-scan never finished');

        if (importSidecar) {
            installImportGlue(window);
            const input = findElement(result.tree, (n) => n.type === 'input' && n.props.type === 'file');
            assert.ok(input, 'the Import Sidecar/LRC control is not in the tree');
            input.props.onChange({
                target: { files: [{ name: 'imported.PEAK', __text: JSON.stringify(importSidecar) }] },
            });
            result = r.render(window.LensesView, props, first);
        }
        return result;
    };

    test('all three downloads carry the pad sound name and their own suffix, never its container', async () => {
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window, ctx } = w;

        window.oaSetDrumSample(4, song(ctx), { name: 'Brass Stab C.aiff', folder: 'SampleLibrary' });
        const rendered = await scannedView(w, r,
            { audioBuffer: song(ctx), filename: 'Brass Stab C.aiff', padIdx: 4 }, sidecar);

        assert.equal(clickExport(window, rendered.tree, 'Export .PERF JSON').name,
            'Brass Stab C.PERF.json');
        assert.equal(clickExport(window, rendered.tree, 'Export .PEAK').name,
            'Brass Stab C.PEAK');
        assert.equal(clickExport(window, rendered.tree, 'Export .LRC').name,
            'Brass Stab C.lrc');

        w.cleanup();
    });

    test('the UCS catalogue basename is the four fields in order, and it is only ever shown', async () => {
        // UCS v2.1: <CatKey>_<FXName>_<CreatorID>_<SourceID>. This repository has
        // a whole standards lane for the convention, and the assembly of it was
        // held by a human having looked.
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window, ctx } = w;

        const rendered = await scannedView(w, r,
            { audioBuffer: song(ctx), filename: 'Brass Stab C.aiff', padIdx: null });

        assert.equal(ucsBasename(rendered.tree), 'MUSC-TONE_Brass Stab C_LIKEAUDIO_SCANALYZER.wav');

        // And it is a LABEL. The day it becomes a download, the count below moves
        // and this case says so rather than the name going unasserted again.
        assert.equal(readFileSync(join(ROOT, 'libControl/MusicChart/LensesView.jsx'), 'utf8')
            .split('\n').filter((l) => /a\.download\s*=/.test(l)).length, 3,
            'LensesView writes a number of downloads this block does not cover');

        w.cleanup();
    });

    test('the .lrc title tag keeps the name whole, extension and all', async () => {
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window, ctx } = w;

        const rendered = await scannedView(w, r,
            { audioBuffer: song(ctx), filename: 'Brass Stab C.aiff', padIdx: null }, sidecar);
        const lrc = clickExport(window, rendered.tree, 'Export .LRC');

        assert.equal(lrc.name, 'Brass Stab C.lrc');
        assert.match(lrc.body, /^\[ar:LIKEAUDIO\]\n\[ti:Brass Stab C\.aiff\]\n\[by:Scanalyzer\]/);

        w.cleanup();
    });

    test('a pad with no sound exports under the view own last resort, with no invented container', async () => {
        // PLAN-491.01 took tier three from `'sample.wav'` to `'sample'` and the
        // suite went 196 green to 196 green, because the three cases it added
        // read the PROP `SamplerEditor` hands down and not what the exporter
        // does with it. This is that assertion, one boundary further along.
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window, ctx } = w;

        const rendered = await scannedView(w, r,
            { audioBuffer: song(ctx), filename: '', padIdx: 11 }, sidecar);

        for (const [label, want] of [['Export .PERF JSON', 'sample.PERF.json'],
                                     ['Export .PEAK', 'sample.PEAK'],
                                     ['Export .LRC', 'sample.lrc']]) {
            const seen = clickExport(window, rendered.tree, label);
            assert.equal(seen.name, want);
            assert.ok(!/\.wav/i.test(seen.name),
                `an empty pad exported a container nobody decoded: ${seen.name}`);
        }
        assert.equal(ucsBasename(rendered.tree), 'MUSC-TONE_sample_LIKEAUDIO_SCANALYZER.wav');

        w.cleanup();
    });

    test('a dot in the middle of a name is part of the name, not an extension', async () => {
        // `Kick 90.5 Loop` exported as `Kick 90`. The expression was
        // `fname.replace(/\.[^/.]+$/, "")` — "a dot and then no more dots", not
        // "a container this app can name". Truncating a name is worse than
        // leaving an extension on it: a visitor can see an extension, and cannot
        // see the half that went missing.
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window, ctx } = w;

        const rendered = await scannedView(w, r,
            { audioBuffer: song(ctx), filename: 'Kick 90.5 Loop', padIdx: null }, sidecar);

        assert.equal(clickExport(window, rendered.tree, 'Export .PERF JSON').name,
            'Kick 90.5 Loop.PERF.json');
        assert.equal(clickExport(window, rendered.tree, 'Export .PEAK').name,
            'Kick 90.5 Loop.PEAK');
        assert.equal(ucsBasename(rendered.tree), 'MUSC-TONE_Kick 90.5 Loop_LIKEAUDIO_SCANALYZER.wav');

        w.cleanup();
    });

    test('a container the list knows is stripped whatever its case, and one it does not is kept', async () => {
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window, ctx } = w;

        for (const [given, want] of [['Loop 4.WAV', 'Loop 4.PEAK'],
                                     ['Vox take 2.Flac', 'Vox take 2.PEAK'],
                                     ['Amen.ogg', 'Amen.PEAK'],
                                     // Not an audio container. A name, with a dot in it.
                                     ['Session 3.take7', 'Session 3.take7.PEAK']]) {
            const rendered = await scannedView(w, r,
                { audioBuffer: song(ctx), filename: given, padIdx: null }, sidecar);
            assert.equal(clickExport(window, rendered.tree, 'Export .PEAK').name, want, given);
        }

        w.cleanup();
    });

    test('a 1.0.0 .PEAK and its 1.1.0 twin import to the same document', async () => {
        // THE MIGRATION, DRIVEN RATHER THAN READ. 1.1.0 snake_cased the nine
        // keys inside `musicality` and `loudness_ebu_r128`, and the bump is only
        // honest if a `.PEAK` a visitor downloaded before it still opens —
        // which is what `fromSidecarGroup` reading BOTH spellings is for. Until
        // PLAN-1067.03 the camelCase arm was exercised by accident, by a fixture
        // that had simply never been updated, and the snake_case arm was not
        // exercised through this control at all.
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window, ctx } = w;

        const exported = async (imported) => {
            const rendered = await scannedView(w, r,
                { audioBuffer: song(ctx), filename: 'Brass Stab C.aiff', padIdx: null }, imported);
            return JSON.parse(clickExport(window, rendered.tree, 'Export .PEAK').body);
        };

        const fromOld = await exported(sidecar);
        const fromNew = await exported(sidecar_1_1_0);

        // The exporter writes TODAY'S version either way — the version on disk
        // is the reader's problem, never the writer's. 1.2.0 since PLAN-908.01.
        assert.equal(fromOld.schema_version, '1.2.0');
        assert.deepEqual(fromOld.musicality, fromNew.musicality);
        assert.deepEqual(fromOld.loudness_ebu_r128, fromNew.loudness_ebu_r128);

        // And the values are the fixture's, not the scan's — an import must
        // override a live scan, which is the other half of what this control is
        // for. Named one by one: a deepEqual of two documents that both lost
        // their measurements would pass the comparison above.
        assert.equal(fromOld.musicality.pitch_hz, 220.5);
        assert.equal(fromOld.musicality.bpm, 92);
        assert.equal(fromOld.loudness_ebu_r128.integrated_lufs, -14.2);
        assert.equal(fromOld.loudness_ebu_r128.lra_lu, 6.3);
        // 1.0.0 never wrote the fourth key, so the slot is filled with an
        // explicit null rather than dropped — `JSON.stringify` drops the gap.
        assert.equal(fromOld.loudness_ebu_r128.gating_threshold_lufs, null);
        assert.ok('gating_threshold_lufs' in fromOld.loudness_ebu_r128);

        // No camelCase survives the round trip in either direction. The
        // exporter maps through one table per group; a key handed through
        // verbatim is exactly the 1.0.0 defect.
        const spelling = JSON.stringify({ m: fromOld.musicality, l: fromOld.loudness_ebu_r128 });
        for (const stale of ['keyConfidence', 'pitchHz', 'centsOffset',
                             'integratedLUFS', 'maxTruePeakdBTP', 'lraLU']) {
            assert.ok(!spelling.includes(stale), `${stale} survived the export`);
        }

        w.cleanup();
    });
});
