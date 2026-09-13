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
 * Header: padmeta.test.mjs
 * Purpose: Hold `oaPadMetaFromPeak` / `oaApplyPeakToPad` to the six keys
 *   `SamplerEditor` actually reads, against all four documents that can arrive
 *   on a drop.
 * Description: A drop fills one variable, `peakData`, from FOUR different
 *   writers — `oaDeepScanAudio` (camel `beatMarkers`), `LensesView`'s `.PEAK`
 *   (snake `beat_markers`), and TWO writers of the map nested under
 *   `musicality`: the Python CLI's eleven keys, `note_map.rs`'s six.
 *
 *   WHAT THIS CATCHES IS A PANEL FULL OF `undefined`, NOT A THROWN ERROR, which
 *   is why nothing here was red before it existed. `entry.noteMap` used to be
 *   set to `peakData.musicality` — a truthy object with none of the six keys —
 *   so `SamplerEditor` drew its Note Root Key bar, printed
 *   `KEY: undefined · undefined BPM · undefined BEATS`, and handed `WaveTrim`
 *   `undefined` for the onset ticks. Measured on a 20-second buffer with 39
 *   detected onsets: all six reads came back `undefined` (PLAN-800.01).
 *
 *   THE SIX KEYS ARE ASSERTED BY NAME, not by "the object is truthy". A truthy
 *   object is exactly what the defect produced, so a case that only checks for
 *   one passes against the bug.
 *
 *   `entry.beatMarkers` IS ASSERTED ABSENT. All three drop sites wrote it and
 *   nothing in the app has ever read it; the last case here is what stops it
 *   coming back.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWorld, BACKEND_SOURCES } from './harness.mjs';

/** The audio layer plus the scanner — no React needed to call any of it.
 *
 * AND THE SCANNER IS ALREADY IN IT. This read `[...BACKEND_SOURCES, <three
 * paths>]`, and all three -- `oaWithoutContainer.js` [54], `oaScanMeasure.js`
 * [55], `oaDeepScanner.js` [56] -- are members of `BACKEND_SOURCES` already, so
 * the list evaluated each of them twice with the second evaluation last,
 * instead of at the index `build.mjs` puts them at. PLAN-814.02. */
const SOURCES = BACKEND_SOURCES;

/** The six keys `SamplerEditor` reads off `entry.noteMap`, in one place. */
const EDITOR_READS = ['global_root_note', 'global_bpm', 'total_beats',
    'total_chunks', 'beat_markers', 'chunk_maps'];

/**
 * A buffer with a transient twice a second, so the scan has onsets to find.
 *
 * SHORT ON PURPOSE. The scan is O(samples) with a large constant — a 60-second
 * buffer at 8k costs about 40 seconds of wall clock in this harness, which is
 * the cost PLAN-801.01 carries. Twelve seconds gives 24 onsets and three
 * sections, which is everything these cases need.
 */
const ticking = (ctx, seconds = 12, rate = 8000) => {
    const buf = ctx.createBuffer(1, rate * seconds, rate);
    const d = buf.getChannelData(0);
    for (let b = 0; b < seconds * 2; b++) {
        const at = Math.floor(b * rate * 0.5);
        for (let i = 0; i < 400; i++) d[at + i] = Math.exp(-i / 60) * Math.sin(i * 0.4);
    }
    return buf;
};

/**
 * What `LensesView.exportPeakSidecar` writes — A COMPLETE 1.2.0 DOCUMENT, and
 * checked against `lensPeakSidecarSchema.json` by the last case in this file.
 *
 * IT USED TO BE NEITHER. It carried `musicality.{keyConfidence, pitchHz,
 * centsOffset}` and `loudness_ebu_r128.{integratedLUFS, maxTruePeakdBTP,
 * lraLU}` — the pre-1.1.0 camelCase for seven keys — was missing the fourth
 * loudness key entirely, and had no `format`, `schema_version`,
 * `archival_aes`, `spatial_aes69` or `lyrics` at all. It survived PLAN-1067.01's
 * rename because NOTHING READS IT: `oaPadMetaFromPeak` takes
 * `musicality.key` and `musicality.bpm` and never opens the loudness group, so
 * a fixture describing a shape no writer in this repository produces could not
 * go red. That is what the schema case below is for — the fixture is the only
 * written description anybody has of one of the four documents that arrive on
 * a drop, and describing it wrongly is how the next reader learns the wrong
 * shape (PLAN-1067.03).
 *
 * A FUNCTION AND NOT A CONSTANT, like the three fixtures beside it, so a case
 * that mutates what it was handed cannot reach the next case.
 */
const lensesSidecar = () => ({
    format: 'peak-lens-sidecar',
    schema_version: '1.2.0',
    filename: 'song.wav',
    ucs: { cat_key: 'MUSCLoop', creator_id: 'APK', source_id: 'S1' },
    musicality: { key: 'A minor', key_confidence: 0.8, pitch_hz: 220, cents_offset: 1.2, bpm: 118 },
    beat_markers: [
        { timestamp_seconds: 0.5, strength: 0.9 },
        { timestamp_seconds: 1.0, strength: 0.7 },
    ],
    loudness_ebu_r128: {
        integrated_lufs: -14.2, max_true_peak_dbtp: -1.1, lra_lu: 6.3,
        // THE FOURTH KEY, absent from this fixture until PLAN-1067.03. The
        // `.PERF.json` beside this document has always written all four.
        gating_threshold_lufs: -24.2,
    },
    archival_aes: {
        pcm_sha256: null,
        sha256_scope: 'decoded-pcm',
        // `null` AND NOT `0` SINCE 1.2.0. A 0 is the claim that this audio
        // begins at sample zero of the timeline it was recorded against, and
        // only the `bext` chunk says that — the page has a decoded
        // AudioBuffer and the chunk did not survive the decode (PLAN-908.01).
        bext_time_reference: null,
        version: 'AES60-BWF-v2',
    },
    // THE THREE NUMBERS ARE `null`, and that is the document, not a gap in the
    // fixture. `0, 0, 1` read off the file as "the source is dead ahead at one
    // metre" and nothing in the view measures, offers or imports a placement.
    // `sofa_format` stays: it names the vocabulary, not a measurement.
    spatial_aes69: {
        azimuth_deg: null, elevation_deg: null, distance_m: null,
        sofa_format: 'AES69-SOFA-v1',
    },
    lyrics: { words: [] },
});

/** What `extract_note_root_beat_map.py` writes — the map, NESTED under musicality. */
const pythonSidecar = () => ({
    metadata: { name: '01 Track 01.m4a', sample_rate: 44100, channels: 1 },
    musicality: {
        pitch_hz: 220.0,
        root_note_name: 'A3',
        root_frequency_hz: 220.0,
        root_cents_offset: 1.4,
        beats_per_minute: 120.0,
        root_midi_note: 57,
        note_root_key_beat_marker_map: {
            file_name: '01 Track 01.m4a',
            global_root_note: 'A3',
            global_midi_note: 57,
            global_bpm: 120.0,
            total_beats: 2,
            total_chunks: 1,
            beat_markers: [
                { index: 0, timestamp_seconds: 0.0, is_downbeat: true, bar: 1, beat: 1 },
                { index: 1, timestamp_seconds: 0.5, is_downbeat: false, bar: 1, beat: 2 },
            ],
            chunk_maps: [
                { chunk_index: 0, start_seconds: 0.0, end_seconds: 1.5, root_note_name: 'A3' },
            ],
        },
    },
});

/**
 * A REAL record out of the tracked library — `sample_analyzer_rs`'s per-file
 * `.PEAK`, whose `musicality.note_root_key_beat_marker_map` is `note_map.rs`'s
 * six-key struct rather than the Python CLI's eleven-key dict.
 *
 * A REAL FILE AND NOT A FIXTURE, because a fixture written from a reading of
 * `Core/peak.rs` agrees with the source and not with the library. The corpus is
 * 147 `.PEAK` and 346 records; `analyzerPeakSchema.json` types it and
 * `.apk.scripts/check_peak_formats.py` gates it (PLAN-907.01).
 *
 * NO SKIP IF IT IS MISSING. The path is tracked; a test that quietly passes over
 * an absent corpus is the shape of every gate that never looked.
 */
const ANALYZER_PEAK = 'SampleLibrary/01 Track 01.PEAK';
const analyzerSidecar = () => JSON.parse(readFileSync(ANALYZER_PEAK, 'utf8'));

/**
 * `lensPeakSidecarSchema.json`, read from the SCAN app that owns it.
 *
 * TYPED, NOT TRUSTED. Before PLAN-1067.03 nothing in this suite had ever
 * compared a `peak-lens-sidecar` fixture against the schema that describes one:
 * the only reader of this file was `check_lens_exports.py`, which validated
 * real EXPORTS and never a fixture, and that script no longer exists. A fixture
 * nothing reads and nothing types records whatever shape it was last edited to,
 * which is how the loudness group above kept its 1.0.0 spelling through a
 * version bump that renamed every key in it.
 */
const PEAK_SIDECAR_SCHEMA = JSON.parse(readFileSync(
    join(dirname(fileURLToPath(import.meta.url)),
         '../../SCAN/Web_Front/src/lensPeakSidecarSchema.json'), 'utf8'));

/**
 * The subset of JSON Schema `lensPeakSidecarSchema.json` actually uses, applied
 * to one document; returns the list of complaints, empty when it validates.
 *
 * HAND-ROLLED BECAUSE THIS TREE HAS NO VALIDATOR AND SHOULD NOT GROW A
 * DEPENDENCY FOR ONE FIXTURE. `package.json` carries two devDependencies, both
 * for the JSX build, and the suite runs on `node --test` with nothing installed
 * at all — a test that needed `npm i` to run is a test that does not run. The
 * keywords below are every keyword in that file: `type` (string or list),
 * `const`, `pattern`, `minimum`, `required`, `properties`, `items` and
 * `additionalProperties: false`. A keyword the schema grows later and this does
 * not understand is ignored SILENTLY, which is the one way this can be wrong —
 * so it reports what it checked rather than claiming the document is valid.
 */
const schemaComplaints = (schema, value, path = '$') => {
    const out = [];
    const types = schema.type === undefined ? null
        : Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (types && !types.includes(actual === 'number' && Number.isInteger(value)
        ? (types.includes('integer') ? 'integer' : 'number') : actual)) {
        out.push(`${path}: expected ${types.join('|')}, got ${actual}`);
        return out;
    }
    if ('const' in schema && value !== schema.const) {
        out.push(`${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
    }
    if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
        out.push(`${path}: ${JSON.stringify(value)} does not match /${schema.pattern}/`);
    }
    if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
        out.push(`${path}: ${value} is below the minimum ${schema.minimum}`);
    }
    if (Array.isArray(value) && schema.items) {
        value.forEach((item, i) => out.push(...schemaComplaints(schema.items, item, `${path}[${i}]`)));
    }
    if (value && actual === 'object') {
        for (const key of schema.required || []) {
            if (!Object.prototype.hasOwnProperty.call(value, key)) out.push(`${path}.${key} is missing`);
        }
        for (const [key, child] of Object.entries(value)) {
            const sub = (schema.properties || {})[key];
            if (sub) out.push(...schemaComplaints(sub, child, `${path}.${key}`));
            else if (schema.additionalProperties === false) out.push(`${path}.${key} is not in the schema`);
        }
    }
    return out;
};

describe('the drop handler normalises four .PEAK formats into one pad shape', () => {
    test('the auto-scan path: the pad carries the onsets the scan measured', async () => {
        const w = await createWorld({ sources: SOURCES });
        const { window, ctx } = w;
        const buf = ticking(ctx);

        // Exactly what App.jsx does when a song is dropped with no sidecar.
        const scan = await window.oaDeepScanAudio(buf);
        assert.ok(scan.beatMarkers.length > 8,
            `the scan found no onsets to carry (${scan.beatMarkers.length})`);
        // The name the handler used to read. It has never been on this object.
        assert.equal(scan.beat_markers, undefined,
            'the scan spells it beatMarkers; a snake_case read here is the defect');

        window.oaSetDrumSample(0, buf, { name: 'song.wav', folder: 'Downloads' });
        window.oaApplyPeakToPad(0, scan);

        const entry = window.OA_DRUM_SAMPLES[0];
        assert.deepEqual(entry.noteMap.beat_markers, scan.beatMarkers,
            'the pad must carry the onsets the scan measured, not undefined');
        assert.equal(entry.noteMap.total_beats, scan.beatMarkers.length);
        assert.equal(entry.chartData, scan);
        w.cleanup();
    });

    test('every key SamplerEditor reads is present — none of the six is undefined', async () => {
        const w = await createWorld({ sources: SOURCES });
        const { window, ctx } = w;
        const scan = await window.oaDeepScanAudio(ticking(w.ctx));

        for (const doc of [scan, lensesSidecar(), pythonSidecar(), analyzerSidecar()]) {
            const meta = window.oaPadMetaFromPeak(doc);
            assert.ok(meta.noteMap, 'a measured document must produce a noteMap');
            for (const k of EDITOR_READS) {
                // `undefined` is what a bare `musicality` gave every one of
                // these, and it is what the panel printed to the visitor.
                assert.notEqual(meta.noteMap[k], undefined,
                    `noteMap.${k} is undefined — SamplerEditor prints that verbatim`);
            }
            assert.ok(Array.isArray(meta.noteMap.beat_markers));
            assert.ok(Array.isArray(meta.noteMap.chunk_maps));
        }
        assert.ok(ctx);
        w.cleanup();
    });

    test('the python sidecar embeds the map under musicality, not at the top', async () => {
        const w = await createWorld({ sources: SOURCES });
        const py = pythonSidecar();

        // The read that stood in the handler for the file's whole life. This is
        // WHY the fallback never once took its first arm: the key exists, one
        // level down.
        assert.equal(py.note_root_key_beat_marker_map, undefined);
        assert.ok(py.musicality.note_root_key_beat_marker_map);

        const meta = w.window.oaPadMetaFromPeak(py);
        assert.equal(meta.noteMap, py.musicality.note_root_key_beat_marker_map,
            'the one document that already has the shape is used verbatim');
        assert.equal(meta.noteMap.global_root_note, 'A3');
        assert.equal(meta.noteMap.global_bpm, 120.0);
        assert.equal(meta.noteMap.chunk_maps.length, 1);
        w.cleanup();
    });

    test('the analyzer\'s embedded map has no total_chunks, and it is completed not invented', async () => {
        const w = await createWorld({ sources: SOURCES });
        const raw = analyzerSidecar();
        const embedded = raw.musicality.note_root_key_beat_marker_map;

        // `peak::NoteRootKeyBeatMarkerMap` has six fields. `total_chunks` is in
        // the Python CLI's dict and in `oaDeepScanner`'s rebuild, and in neither
        // the Rust struct nor any of the 164 records on disk that carry a map.
        assert.ok(embedded, `${ANALYZER_PEAK} carries no embedded map — the corpus moved`);
        assert.equal(embedded.total_chunks, undefined,
            'the Rust map grew a total_chunks; delete this case and the completion with it');

        const meta = w.window.oaPadMetaFromPeak(raw);
        // What SamplerEditor.jsx renders verbatim: `{n} note chunks detected`.
        assert.equal(meta.noteMap.total_chunks, embedded.chunk_maps.length,
            'total_chunks must be the length of the array it counts, not a guess');
        assert.notEqual(meta.noteMap.total_chunks, undefined,
            'undefined is what the panel printed to the visitor before PLAN-907.01');
        // Completed, not rebuilt: every measured key is the analyzer's own.
        assert.equal(meta.noteMap.beat_markers, embedded.beat_markers);
        assert.equal(meta.noteMap.chunk_maps, embedded.chunk_maps);
        assert.equal(meta.noteMap.global_bpm, embedded.global_bpm);
        assert.equal(meta.noteMap.global_root_note, embedded.global_root_note);
        w.cleanup();
    });

    test("LensesView's snake_case sidecar lands on the same six keys", async () => {
        const w = await createWorld({ sources: SOURCES });
        const meta = w.window.oaPadMetaFromPeak(lensesSidecar());

        assert.equal(meta.noteMap.beat_markers.length, 2);
        assert.equal(meta.noteMap.total_beats, 2);
        assert.equal(meta.noteMap.global_root_note, 'A minor');
        assert.equal(meta.noteMap.global_bpm, 118);
        // No sections in that document, so no chunks — empty, never invented.
        assert.deepEqual(meta.noteMap.chunk_maps, []);
        w.cleanup();
    });

    test('sections become chunk_maps on the same boundaries the chopper uses', async () => {
        const w = await createWorld({ sources: SOURCES });
        const { window, ctx } = w;
        const buf = ticking(ctx, 20);
        const scan = await window.oaDeepScanAudio(buf);

        assert.ok(scan.sections.length > 0, 'the scan found no sections to map');
        const meta = window.oaPadMetaFromPeak(scan);
        assert.equal(meta.noteMap.chunk_maps.length, scan.sections.length);
        assert.equal(meta.noteMap.total_chunks, scan.sections.length);

        // The editor's Chop buttons snap the trim to these; the pads were cut
        // from the same numbers, so the two surfaces must agree.
        window.oaChopSongToPads(buf, 'song.wav', scan);
        meta.noteMap.chunk_maps.forEach((cm, i) => {
            assert.equal(cm.start_seconds, scan.sections[i].start_seconds);
            assert.equal(cm.end_seconds, scan.sections[i].end_seconds);
            assert.equal(cm.root_note_name, scan.sections[i].key_center);
        });
        w.cleanup();
    });

    test('a document with nothing measured draws no panel at all', async () => {
        const w = await createWorld({ sources: SOURCES });
        const { window } = w;

        // A sidecar carrying only its UCS block. There is no key, no tempo, no
        // marker and no section in it, so a Note Root Key bar over it would be
        // six blanks under a heading — worse than no bar.
        const meta = window.oaPadMetaFromPeak({ filename: 'x.wav', ucs: { cat_key: 'MUSCLoop' } });
        assert.equal(meta.noteMap, null);
        assert.equal(window.oaPadMetaFromPeak(null), null);
        assert.equal(window.oaPadMetaFromPeak(undefined), null);
        w.cleanup();
    });

    test('noteMap is never a bare musicality block', async () => {
        const w = await createWorld({ sources: SOURCES });
        const { window } = w;
        const scan = await window.oaDeepScanAudio(ticking(w.ctx));

        // The exact assignment that stood in all three drop sites.
        const meta = window.oaPadMetaFromPeak(scan);
        assert.notEqual(meta.noteMap, scan.musicality,
            'assigning musicality to noteMap is the defect, not a fallback');
        w.cleanup();
    });

    test('beatMarkers is not written onto the pad entry — nothing reads it', async () => {
        const w = await createWorld({ sources: SOURCES });
        const { window, ctx } = w;
        const buf = ticking(ctx);

        window.oaSetDrumSample(0, buf, { name: 'song.wav', folder: 'Downloads' });
        window.oaApplyPeakToPad(0, await window.oaDeepScanAudio(buf));

        const entry = window.OA_DRUM_SAMPLES[0];
        assert.equal(Object.prototype.hasOwnProperty.call(entry, 'beatMarkers'), false,
            'entry.beatMarkers is write-only — SamplerEditor reads noteMap.beat_markers');
        w.cleanup();
    });

    test("the LensesView fixture IS a peak-lens-sidecar, per the schema that names one", () => {
        // THE FIXTURE IS THE CLAIM, AND THIS IS THE CHECK OF IT. The comment
        // above `lensesSidecar` says the object is what `exportPeakSidecar`
        // writes; nothing made that true until this case, and it was false for
        // seven key names and five absent groups (PLAN-1067.03).
        assert.deepEqual(schemaComplaints(PEAK_SIDECAR_SCHEMA, lensesSidecar()), []);

        // AND THE CHECK ITSELF IS CHECKED, because a validator that returns []
        // for everything passes the case above without reading a byte. The
        // 1.0.0 spelling of one loudness key is exactly the defect this plan
        // was carved for, so it is the negative the validator must catch.
        const stale = lensesSidecar();
        stale.loudness_ebu_r128 = { integratedLUFS: -14.2, maxTruePeakdBTP: -1.1, lraLU: 6.3 };
        const complaints = schemaComplaints(PEAK_SIDECAR_SCHEMA, stale);
        assert.ok(complaints.some((c) => c.includes('integratedLUFS is not in the schema')),
            `the 1.0.0 camelCase must be rejected: ${complaints.join('; ')}`);
        assert.ok(complaints.some((c) => c.includes('gating_threshold_lufs is missing')),
            `the fourth loudness key must be required: ${complaints.join('; ')}`);
    });

    test('the loudness group is not read on the drop path, in either spelling', async () => {
        // WHAT THE PAD PATH DOES WITH A LOUDNESS GROUP WAS NEVER SAID. It reads
        // `musicality.key` and `musicality.bpm` and opens nothing else, so a
        // sidecar's four R128 figures reach the pad ONLY inside `chartData` —
        // which is the whole document, handed on untouched. Asserting it here
        // is what makes "the fixture's loudness spelling does not matter to
        // this function" a stated fact rather than an accident nobody checked.
        const w = await createWorld({ sources: SOURCES });

        const doc = lensesSidecar();
        const meta = w.window.oaPadMetaFromPeak(doc);
        assert.deepEqual(Object.keys(meta.noteMap).sort(), [...EDITOR_READS].sort(),
            'noteMap carries the six keys the editor reads and nothing else');
        assert.equal(meta.chartData, doc,
            'the loudness figures survive only because the whole document does');

        // Same six values off a 1.0.0-spelled document: the drop path never
        // looked at the group, so renaming its keys cannot move a single one.
        const old = lensesSidecar();
        old.loudness_ebu_r128 = { integratedLUFS: -14.2, maxTruePeakdBTP: -1.1, lraLU: 6.3 };
        assert.deepEqual(w.window.oaPadMetaFromPeak(old).noteMap, meta.noteMap);

        // And with no loudness group at all — a `.PEAK` from a scan that
        // measured none — the pad is identical again.
        const none = lensesSidecar();
        delete none.loudness_ebu_r128;
        assert.deepEqual(w.window.oaPadMetaFromPeak(none).noteMap, meta.noteMap);
        w.cleanup();
    });

    test('a pad that does not exist is left alone rather than created', async () => {
        const w = await createWorld({ sources: SOURCES });
        const { window } = w;

        assert.equal(window.oaApplyPeakToPad(7, lensesSidecar()), null);
        assert.ok(!window.OA_DRUM_SAMPLES || !window.OA_DRUM_SAMPLES[7],
            'attaching a sidecar must not conjure a pad entry');
        w.cleanup();
    });
});
