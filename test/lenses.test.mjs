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
 * Header: lenses.test.mjs
 * Purpose: All nine surfaces of the Scanalyzer survive a live auto-scan — six
 *   lens tabs opened, three exports clicked — and the two files that come out
 *   carry the sections that used to be silently missing from them.
 * Description: `LensesView` auto-runs `window.oaDeepScanAudio` and then read a
 *   completely different object. `scanData.musicality`, `scanData.loudness` and
 *   `scanData.chunks` were undefined on the scan's actual return value, so
 *   *🎵 2. Pitch & Beats* and *🎚️ 4. EBU R128 Loudness* threw on open, *📊
 *   Export .PERF JSON* threw on click, and *📝 Export .LRC* returned on its
 *   first line and wrote nothing at all. The `.PEAK` that did come out was a
 *   sidecar with `musicality`, `beat_markers` and `loudness_ebu_r128` dropped
 *   by `JSON.stringify`, because every one of them was `undefined` — so it
 *   looked complete. PLAN-601.01, measured out of PLAN-573.01.
 *
 *   FOUR OF NINE FAILED AND FIVE PASSED, which is why this is nine cases and
 *   not one. A suite that only asserted "the panel renders" was green on the
 *   default tab throughout.
 *
 *   TWO BUFFERS, AND THE SILENT ONE IS NOT THE EASY CASE. Silence is where the
 *   scan legitimately has nothing to report, and it is where a substituted
 *   value hides best: the pitch layer used to draw `|| 440` through the middle
 *   of it and label the line 440.0 Hz. So the silent case asserts the absence
 *   is DRAWN as an absence — an em dash, not a zero, not a NaN, and not a
 *   plausible default.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createWarmWorld } from './harness.mjs';
import { ALL_SOURCES } from './bundleSources.mjs';
import { makeReact, countNodes } from './fakeReact.mjs';
// THE TAB LABELS ARE READ, NOT TYPED — PLAN-1038.01. They were a hand-typed
// array here and a second hand-typed literal in `emitLensExports.mjs`, and lens
// 3's rename updated one of them: two of the nine cases below failed with
// `no tab labelled 3. Lyric Dictation` while the other file was already right. A
// test that opens a tab by its visible text does not get weaker when the text
// moves — it stops running. `lensTabs.mjs` is the one lookup now, and it reads
// `LensesView.jsx`'s own declaration.
import { LENS_TABS, TAB_FLOOR } from './lensTabs.mjs';

const FILENAME = 'Trumpet Take 3.wav';

/** A real, tracked analyzer `.PEAK` — the document this view must NOT read. */
const ANALYZER_PEAK = join(
    dirname(fileURLToPath(import.meta.url)), '..', 'SampleLibrary', 'APK 404', 'Clap.PEAK');

/** Every node in an element tree, in document order. */
const flatten = (node, out = []) => {
    if (node == null || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach((n) => flatten(n, out)); return out; }
    out.push(node);
    (node.children || []).forEach((n) => flatten(n, out));
    return out;
};

/** Everything a tree would put on the screen, as one string. */
const textOf = (node) => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join(' ');
    return (node.children || []).map(textOf).join(' ');
};

/** The hidden `<input type="file">` the Import control drives. */
const fileInput = (tree) => flatten(tree).find(
    (n) => n.type === 'input' && n.props && n.props.type === 'file',
);

/** Hand one named file to an onChange, the way a file picker would. */
const dropFile = (input, name, text) => input.props.onChange(
    { target: { files: [{ name, __text: text }] } },
);

/** The first button whose label contains `label`. */
const buttonWith = (tree, label) => flatten(tree).find(
    (n) => n.type === 'button' && textOf(n).includes(label),
);

/**
 * A pitched, pulsed buffer: 220 Hz at 120 BPM, decaying on every beat.
 *
 * IT IS SYNTHESISED RATHER THAN LOADED because the assertions below are about
 * numbers, and a fixture wav would make them about a file. 220 Hz is A3, so the
 * key estimator has an answer to be right or wrong about, and the 2 Hz envelope
 * is exactly 120 BPM, so the tempo does too.
 */
const pulsedTone = (ctx, seconds = 4, rate = 8000) => {
    const buf = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        const beat = t * 2;
        const env = Math.exp(-8 * (beat - Math.floor(beat)));
        d[i] = 0.5 * env * Math.sin(2 * Math.PI * 220 * t);
    }
    return buf;
};

const silence = (ctx, seconds = 5, rate = 8000) =>
    ctx.createBuffer(1, Math.floor(rate * seconds), rate);

/**
 * Open the panel on a buffer and let its auto-scan finish.
 *
 * The scan is `async`, so it runs to its first `await` synchronously inside the
 * effect and settles a turn or two later on the WebCrypto digest. The loop
 * drains microtasks until it has, rather than sleeping for a guessed interval.
 */
const openLenses = async (makeBuffer) => {
    const r = makeReact();
    const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
    const Component = w.window.LensesView;
    assert.equal(typeof Component, 'function', 'LensesView is not defined');

    const props = { audioBuffer: makeBuffer(w.ctx), filename: FILENAME, padIdx: null };
    const first = r.render(Component, props);

    // Give the canvas effect a real element to draw into: the ref object is on
    // the <canvas> node's props, so the tree hands it over without the test
    // having to know which hook slot it lives in.
    const canvasNode = flatten(first.tree).find((n) => n.type === 'canvas');
    assert.ok(canvasNode && canvasNode.props.ref, 'the timeline canvas has no ref');
    canvasNode.props.ref.current = w.window.document.createElement('canvas');

    r.runEffects(first);
    // ON THE CLOCK, not on a count of microtask turns — the digest resolves off
    // Node's threadpool and a flush loop outruns it. `w.settle` carries the
    // measurement that says so.
    const scanned = () => {
        const peek = r.render(Component, props, first);
        const button = buttonWith(peek.tree, 'Export .PEAK');
        return !!(button && button.props.disabled === false);
    };
    assert.ok(await w.settle(scanned), 'the auto-scan never finished');

    /**
     * Re-render on the same hook state, the way React would after setState.
     *
     * WITHOUT THE EFFECTS, and that is not an economy — fakeReact has no
     * dependency arrays, so `runEffects` re-fires the auto-scan every single
     * time and the panel is permanently mid-scan. `redraw(true)` is for the one
     * case that wants the canvas layer drawn against a settled scan, and it
     * pays for a second scan to get it.
     */
    const redraw = (withEffects) => {
        const next = r.render(Component, props, first);
        if (withEffects) r.runEffects(next);
        return next;
    };
    return { w, r, props, first, redraw };
};

/**
 * ONE scanned world, shared by every case that only READS it.
 *
 * The chromagram is a windowed DFT over 49 semitones per 500 ms frame and it
 * dominates the runtime of this file — a scan of the four-second tone costs
 * about a second and a half, and opening six tabs is not six scans' worth of
 * work. The cases that mutate (dictation, the exports, and the canvas redraw
 * that re-fires the effect) each take a fresh world instead.
 */
let scannedTone = null;
const sharedTone = () => {
    if (!scannedTone) scannedTone = openLenses(pulsedTone);
    return scannedTone;
};

/** Open one lens tab by its label and hand back the tree it drew. */
const openTab = (ctx, label) => {
    const tabs = ctx.redraw();
    const button = buttonWith(tabs.tree, label);
    assert.ok(button, `no tab labelled ${label}`);
    button.props.onClick();
    return ctx.redraw();
};

describe('the Scanalyzer: nine surfaces over one live auto-scan', () => {
    // THE CASE COUNT IS ASSERTED BEFORE THE CASES ARE GENERATED. `LENS_TABS` is
    // read out of the view at import time, so a shape change there could hand
    // this loop an empty list — six cases would become zero, and zero failing
    // cases reads as a pass. `lensTabs.mjs` already throws below its floor; this
    // says the same thing again from the side that would silently shrink.
    test('every lens tab the view declares becomes a case here', () => {
        assert.ok(LENS_TABS.length >= TAB_FLOOR,
            `only ${LENS_TABS.length} lens tab(s) were read from LensesView.jsx, so this ` +
            `suite is about to run ${LENS_TABS.length} of its tab cases instead of ${TAB_FLOOR}`);
    });

    for (const label of LENS_TABS) {
        test(`lens tab ${label} opens on a scanned buffer`, async () => {
            const ctx = await sharedTone();
            let drawn;
            assert.doesNotThrow(() => { drawn = openTab(ctx, label); },
                `${label} threw when it was opened`);
            assert.ok(countNodes(drawn.tree) > 20, `${label} drew almost nothing`);
        });
    }

    test('📊 Export .PERF JSON writes a named file carrying every measurement', async () => {
        const ctx = await openLenses(pulsedTone);
        const tree = ctx.redraw().tree;
        const button = buttonWith(tree, 'Export .PERF JSON');
        assert.ok(button, 'the .PERF button is not on the panel');
        assert.equal(button.props.disabled, false, 'the scan finished, so the button is live');

        assert.doesNotThrow(() => button.props.onClick(), '.PERF export threw');
        assert.equal(ctx.w.downloads.length, 1, 'nothing was written');

        const file = ctx.w.downloads[0];
        assert.equal(file.name, 'Trumpet Take 3.PERF.json', 'the container was not stripped');

        const perf = JSON.parse(file.text);
        assert.equal(perf.format, 'perf-lens-export');
        assert.equal(perf.schema_version, '1.2.0');
        const p = perf.performance_data;
        // Present AND measured — the three that used to throw before the blob.
        for (const k of ['pitch_hz', 'bpm', 'integrated_lufs', 'max_true_peak_dbtp']) {
            assert.ok(Object.prototype.hasOwnProperty.call(p, k), `${k} is missing`);
            assert.equal(typeof p[k], 'number', `${k} came back ${JSON.stringify(p[k])}`);
        }
        assert.equal(typeof p.key, 'string');
        assert.ok(Array.isArray(p.beat_markers) && p.beat_markers.length > 0);
        assert.equal(p.sha256_scope, 'decoded-pcm');
        assert.match(p.pcm_sha256, /^[0-9a-f]{64}$/);
        // The empty string's digest, which is what used to be printed here.
        assert.notEqual(p.pcm_sha256, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        ctx.w.cleanup();
    });

    test('💾 Export .PEAK carries the three sections it used to drop in silence', async () => {
        const ctx = await openLenses(pulsedTone);
        const button = buttonWith(ctx.redraw().tree, 'Export .PEAK');
        assert.ok(button);
        assert.doesNotThrow(() => button.props.onClick(), '.PEAK export threw');

        assert.equal(ctx.w.downloads.length, 1);
        assert.equal(ctx.w.downloads[0].name, 'Trumpet Take 3.PEAK');

        const peak = JSON.parse(ctx.w.downloads[0].text);
        // Each of these was `undefined` and therefore ABSENT from the JSON —
        // the defect that made a broken sidecar look like a complete one.
        assert.ok(peak.musicality && typeof peak.musicality.key === 'string');
        assert.ok(Array.isArray(peak.beat_markers) && peak.beat_markers.length > 0);
        assert.ok(peak.loudness_ebu_r128 && typeof peak.loudness_ebu_r128.integrated_lufs === 'number');
        assert.equal(peak.archival_aes.sha256_scope, 'decoded-pcm');
        assert.match(peak.archival_aes.pcm_sha256, /^[0-9a-f]{64}$/);

        // ONE ALPHABET, and the version that says so. These nine keys were the
        // only camelCase in a document whose other twenty are snake_case,
        // because `musicality` and `loudness_ebu_r128` were handed to disk in
        // the scan's in-memory shape (PLAN-1067.01). Asserted by NAME and not
        // by a regex over the whole file — a regex would pass on a document
        // that simply dropped them, which is the 601.01 defect.
        assert.equal(peak.schema_version, '1.2.0', 'the version did not move with the shape');
        assert.deepEqual(Object.keys(peak.musicality).sort(),
            ['bpm', 'cents_offset', 'key', 'key_confidence', 'pitch_hz']);
        assert.deepEqual(Object.keys(peak.loudness_ebu_r128).sort(),
            ['gating_threshold_lufs', 'integrated_lufs', 'lra_lu', 'max_true_peak_dbtp']);
        assert.equal(typeof peak.musicality.pitch_hz, 'number');
        // The `.PERF.json` written by the button beside it spells eight of these
        // nine the same way, and did before this change. That agreement is the
        // whole point of the rename, so it is asserted rather than assumed.
        buttonWith(ctx.redraw().tree, 'Export .PERF JSON').props.onClick();
        const perf = JSON.parse(ctx.w.downloads[1].text).performance_data;
        for (const k of ['key', 'bpm', 'pitch_hz', 'cents_offset']) {
            assert.ok(Object.prototype.hasOwnProperty.call(perf, k),
                `.PERF lost ${k}, so the two exports no longer agree`);
        }
        for (const k of ['integrated_lufs', 'max_true_peak_dbtp', 'lra_lu', 'gating_threshold_lufs']) {
            assert.ok(Object.prototype.hasOwnProperty.call(perf, k),
                `.PERF lost ${k}, so the two exports no longer agree`);
            assert.equal(perf[k], peak.loudness_ebu_r128[k],
                `${k} disagrees between the two files one click apart`);
        }
        ctx.w.cleanup();
    });

    test('💾 A 1.0.0 .PEAK still imports after 1.1.0 renamed nine of its keys', async () => {
        // THE HALF OF A ROUND TRIP THAT NOTHING TESTED. `check_lens_exports.py`
        // clicks the export and validates the bytes; nothing ever handed a file
        // back to `handleImportFile`, so a rename on the export side could have
        // orphaned every sidecar already on a visitor's disk in silence. This is
        // that file (PLAN-1067.01).
        const ctx = await openLenses(silence);
        const input = fileInput(ctx.redraw().tree);
        assert.ok(input, 'the Import control has no file input');

        // Written the way 1.0.0 wrote it: camelCase inside both groups.
        dropFile(input, 'Old Take.PEAK', JSON.stringify({
            format: 'peak-lens-sidecar',
            schema_version: '1.0.0',
            ucs: { cat_key: 'MUSC-TONE', creator_id: 'OLD', source_id: 'OLDSRC' },
            musicality: { key: 'A Minor', keyConfidence: 0.81, pitchHz: 220.5, centsOffset: -3, bpm: 96 },
            beat_markers: [{ timestamp_seconds: 0.25, strength: 1 }],
            loudness_ebu_r128: { integratedLUFS: -14.2, maxTruePeakdBTP: -1.1, lraLU: 6.3, gatingThresholdLUFS: -24.2 },
        }));
        assert.match(ctx.w.alerts.join(' '), /Imported metadata sidecar/,
            'the import did not report success, so it threw and was swallowed');

        // On the SCREEN, not in the state object — the point of importing is
        // that the numbers get drawn, and the lenses read the memory spelling.
        let pitch = textOf(openTab(ctx, '2. Pitch & Beats').tree);
        assert.match(pitch, /220\.50\s+Hz/, 'a 1.0.0 pitch did not reach the lens');
        assert.match(pitch, /A Minor/, 'a 1.0.0 key did not reach the lens');
        assert.match(pitch, /96\.0\s+BPM/, 'a 1.0.0 tempo did not reach the lens');
        let loud = textOf(openTab(ctx, '4. EBU R128 Loudness').tree);
        assert.match(loud, /-14\.20\s+LUFS/, 'a 1.0.0 integrated loudness did not reach the lens');
        assert.match(loud, /-1\.10\s+dBTP/, 'a 1.0.0 true peak did not reach the lens');

        // And the same file at 1.1.0, which is what it will be next time.
        dropFile(input, 'New Take.PEAK', JSON.stringify({
            format: 'peak-lens-sidecar',
            schema_version: '1.1.0',
            ucs: { cat_key: 'MUSC-TONE', creator_id: 'NEW', source_id: 'NEWSRC' },
            musicality: { key: 'F Major', key_confidence: 0.6, pitch_hz: 349.2, cents_offset: 4, bpm: 128 },
            beat_markers: [{ timestamp_seconds: 0.5, strength: 1 }],
            loudness_ebu_r128: { integrated_lufs: -9.4, max_true_peak_dbtp: -0.3, lra_lu: 3.1, gating_threshold_lufs: -19.4 },
        }));
        pitch = textOf(openTab(ctx, '2. Pitch & Beats').tree);
        assert.match(pitch, /349\.20\s+Hz/, 'a 1.1.0 pitch did not reach the lens');
        assert.match(pitch, /F Major/, 'a 1.1.0 key did not reach the lens');
        loud = textOf(openTab(ctx, '4. EBU R128 Loudness').tree);
        assert.match(loud, /-9\.40\s+LUFS/, 'a 1.1.0 integrated loudness did not reach the lens');

        // AND IT COMES BACK OUT IN ONE SPELLING, AT TODAY'S VERSION. An
        // imported 1.0.0 sidecar re-exported must be a CURRENT sidecar, or the
        // migration only reads. 1.2.0 since PLAN-908.01 nulled the four fields
        // nothing measured; the assertion moved with the export, which is what
        // a `const` in the schema is for.
        ctx.w.downloads.length = 0;
        buttonWith(ctx.redraw().tree, 'Export .PEAK').props.onClick();
        const out = JSON.parse(ctx.w.downloads[0].text);
        assert.equal(out.schema_version, '1.2.0');
        assert.equal(out.musicality.pitch_hz, 349.2);
        assert.equal(out.loudness_ebu_r128.integrated_lufs, -9.4);
        assert.deepEqual(Object.keys(out.musicality).sort(),
            ['bpm', 'cents_offset', 'key', 'key_confidence', 'pitch_hz'],
            'a camelCase leftover survived the round trip into the new file');
        ctx.w.cleanup();
    });

    test('⛔ The three .PEAK documents this view cannot read are refused BY NAME', async () => {
        // `lensPeakSidecarSchema.json` types what the export writes; until
        // PLAN-1067.02 nothing typed what the import reads, and the whole gate
        // was `if (parsed.musicality || parsed.beat_markers)`. The analyzer's
        // per-file .PEAK HAS a `musicality`, so it passed — landed in scanData,
        // drew em dashes off names no lens here reads, and said "Imported
        // metadata sidecar successfully".
        const ctx = await openLenses(silence);
        const input = fileInput(ctx.redraw().tree);
        assert.ok(input, 'the Import control has no file input');

        // 1. A REAL TRACKED FILE, not a fixture written to match the assertion.
        const analyzer = readFileSync(ANALYZER_PEAK, 'utf8');
        assert.ok(JSON.parse(analyzer).musicality,
            'this file must still have a musicality, or it no longer proves anything');
        ctx.w.alerts.length = 0;
        dropFile(input, 'Clap.PEAK', analyzer);
        assert.match(ctx.w.alerts.join(' '), /ANALYZER's \.PEAK/,
            'the analyzer document was not named');
        assert.doesNotMatch(ctx.w.alerts.join(' '), /Imported metadata sidecar successfully/,
            'a document this view cannot read was called a successful import');

        // ON THE SCREEN, not only in an alert that is gone when dismissed.
        const refusedText = textOf(ctx.redraw().tree);
        assert.match(refusedText, /Not imported/, 'the refusal is not drawn anywhere');

        // AND scanData WAS NOT SET. The lens still draws the silence it scanned.
        // Asserted on the analyzer's own NUMBER — `musicality.pitch_hz` is the
        // one field the two vocabularies share, so it is the field that would
        // reach the lens if the refusal leaked, and 1191.89 Hz is not anything
        // this silent buffer could have measured.
        const pitch = textOf(openTab(ctx, '2. Pitch & Beats').tree);
        assert.doesNotMatch(pitch, /1191\.89/, "the analyzer's pitch reached the lens");
        assert.match(pitch, /—\s+Hz/, 'the silent scan stopped drawing its own absence');

        // 2. The aggregate — an ARRAY of exactly those records.
        ctx.w.alerts.length = 0;
        dropFile(input, 'sample_cloud_data.PEAK', JSON.stringify([JSON.parse(analyzer)]));
        assert.match(ctx.w.alerts.join(' '), /AGGREGATE/, 'the array document was not named');

        // 3. A MAJOR this view does not read. An unknown MINOR must still
        //    import -- that is what 1.0.0/1.1.0 already proves is worth having --
        //    so a major is the only version that refuses.
        ctx.w.alerts.length = 0;
        dropFile(input, 'Future.PEAK', JSON.stringify({
            format: 'peak-lens-sidecar',
            schema_version: '2.0.0',
            musicality: { key: 'C Major', key_confidence: 1, pitch_hz: 261.6, cents_offset: 0, bpm: 120 },
        }));
        assert.match(ctx.w.alerts.join(' '), /schema_version 2\.0\.0/,
            'a major bump was not named');
        assert.doesNotMatch(ctx.w.alerts.join(' '), /Imported metadata sidecar successfully/,
            'a 2.x document was imported by a 1.x reader');
        ctx.w.cleanup();
    });

    test('💾 An unknown MINOR still imports, and the version reaches the operator', async () => {
        // The decision recorded in `identifyPeakDocument`: a minor is additive by
        // construction, and a file already on a visitor's disk must not be
        // orphaned by one. A version-less file predates 1.0.0 and is still read
        // on its keys, which is all it has ever been read on.
        const ctx = await openLenses(silence);
        const input = fileInput(ctx.redraw().tree);

        ctx.w.alerts.length = 0;
        dropFile(input, 'Later.PEAK', JSON.stringify({
            format: 'peak-lens-sidecar',
            schema_version: '1.9.0',
            musicality: { key: 'D Minor', key_confidence: 0.7, pitch_hz: 293.7, cents_offset: 0, bpm: 110 },
            beat_markers: [],
        }));
        assert.match(ctx.w.alerts.join(' '), /Imported metadata sidecar successfully/,
            'an unknown minor was refused');
        assert.match(ctx.w.alerts.join(' '), /schema_version 1\.9\.0/,
            'the version was read but not reported');
        assert.match(textOf(openTab(ctx, '2. Pitch & Beats').tree), /293\.70\s+Hz/,
            'a 1.9.0 pitch did not reach the lens');

        // Version-less: pre-1.0.0, named as such, and still read.
        ctx.w.alerts.length = 0;
        dropFile(input, 'Ancient.PEAK', JSON.stringify({
            musicality: { key: 'G Major', keyConfidence: 0.5, pitchHz: 392.0, centsOffset: 0, bpm: 90 },
        }));
        assert.match(ctx.w.alerts.join(' '), /no schema_version/,
            'a version-less file was not named as one');
        assert.match(textOf(openTab(ctx, '2. Pitch & Beats').tree), /392\.00\s+Hz/,
            'a version-less pitch did not reach the lens');
        ctx.w.cleanup();
    });

    test('📝 Export .LRC is disabled with nothing to write, and writes when there is', async () => {
        const ctx = await openLenses(pulsedTone);
        const button = buttonWith(ctx.redraw().tree, 'Export .LRC');
        assert.ok(button);
        // The scanner recognises no speech, so there is nothing to export and
        // the control says so. It used to be enabled, clicked, and silent.
        assert.equal(button.props.disabled, true, 'a button that cannot write must not be pressable');
        button.props.onClick();
        assert.equal(ctx.w.downloads.length, 0, 'a disabled export wrote a file');

        // Dictate a line, the one thing that does put words in this lens.
        const lyrics = openTab(ctx, '3. Lyric Dictation');
        const dictate = buttonWith(lyrics.tree, 'Dictate Lyric Line');
        assert.ok(dictate, 'the dictation button is not on the lyrics lens');
        ctx.w.window.SpeechRecognition = class {
            constructor() { this.onresult = null; this.onerror = null; this.onend = null; }
            start() { this.onresult({ results: [[{ transcript: 'hello from the room' }]] }); }
        };
        dictate.props.onClick();

        const after = ctx.redraw();
        const lrcButton = buttonWith(after.tree, 'Export .LRC');
        assert.equal(lrcButton.props.disabled, false, 'a dictated line did not enable the export');
        lrcButton.props.onClick();

        assert.equal(ctx.w.downloads.length, 1, 'the .LRC export still wrote nothing');
        assert.equal(ctx.w.downloads[0].name, 'Trumpet Take 3.lrc');
        assert.match(ctx.w.downloads[0].text, /\[00:00\.00\] hello from the room/);
        ctx.w.cleanup();
    });
});

describe('a scan that measured something says what, and one that did not says so', () => {
    test('the timeline redraws over a settled scan without throwing', async () => {
        const ctx = await openLenses(pulsedTone);
        // The pitch, beat-grid and vocal layers are all inside the canvas
        // effect and are all guarded on a key the scan did not used to return.
        // This is the one place they run with a scan under them.
        assert.doesNotThrow(() => ctx.redraw(true), 'the timeline draw threw');
        ctx.w.cleanup();
    });

    test('the pitch lens reports the tone it was given', async () => {
        const ctx = await sharedTone();
        const text = textOf(openTab(ctx, '2. Pitch & Beats').tree);
        assert.match(text, /A minor|A major/, `220 Hz is an A; the lens said: ${text}`);
        assert.match(text, /2\d\d\.\d\d\s+Hz/, 'no pitch in hertz was drawn');
        assert.match(text, /120(\.0)?\s+BPM/, `the envelope is 2 Hz = 120 BPM; the lens said: ${text}`);
        assert.match(text, /Energy Onsets Detected/);
        assert.doesNotMatch(text, /undefined|NaN/);
    });

    test('the loudness lens reports EBU R128 figures for a sounding buffer', async () => {
        const ctx = await sharedTone();
        const text = textOf(openTab(ctx, '4. EBU R128 Loudness').tree);
        assert.match(text, /-\d+\.\d\d\s+LUFS/, `no integrated loudness drawn: ${text}`);
        assert.match(text, /-\d+\.\d\d\s+dBTP/, `no true peak drawn: ${text}`);
        assert.doesNotMatch(text, /undefined|NaN/);
    });

    test('silence draws an em dash, not a zero and not a plausible 440', async () => {
        const ctx = await openLenses(silence);

        const pitch = textOf(openTab(ctx, '2. Pitch & Beats').tree);
        assert.match(pitch, /—/, `an unmeasurable field must be drawn as an absence: ${pitch}`);
        assert.doesNotMatch(pitch, /undefined|NaN/);
        assert.doesNotMatch(pitch, /440/, 'the pitch default is back');
        assert.match(pitch, /no key to report/i, 'the lens must say WHY it is empty');

        const loud = textOf(openTab(ctx, '4. EBU R128 Loudness').tree);
        assert.match(loud, /—\s+LUFS/, `silence has no integrated loudness: ${loud}`);
        assert.match(loud, /—\s+dBTP/, 'the true peak of digital silence is −∞, not 0');
        assert.doesNotMatch(loud, /undefined|NaN/);

        ctx.w.cleanup();
    });

    test('the .PERF written over silence carries nulls, never zeros and never gaps', async () => {
        const ctx = await openLenses(silence);
        const button = buttonWith(ctx.redraw().tree, 'Export .PERF JSON');
        assert.doesNotThrow(() => button.props.onClick(), 'a silent scan cannot export');

        const p = JSON.parse(ctx.w.downloads[0].text).performance_data;
        for (const k of ['pitch_hz', 'key', 'bpm', 'integrated_lufs', 'max_true_peak_dbtp', 'lra_lu']) {
            assert.ok(Object.prototype.hasOwnProperty.call(p, k), `${k} was dropped, not nulled`);
            assert.equal(p[k], null, `${k} came back ${JSON.stringify(p[k])} — 0 is not "unmeasurable"`);
        }
        ctx.w.cleanup();
    });
});
