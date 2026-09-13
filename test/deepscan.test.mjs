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
 * Header: deepscan.test.mjs
 * Purpose: Hold `oaDeepScanAudio` to the one thing it must never claim again —
 *   that it read a vocal. The scanner runs no speech recognition, so `lyrics`
 *   is empty and the rows it does emit are named for what they are.
 * Description: Until PLAN-570.01 the scanner divided every Verse and Chorus
 *   into nine and pushed eight rows whose `word` was `` `[Vocal Word ${n}]` ``.
 *   `MusicChartOverlay` drew them under *🎤 Synchronized Vocal & Lyric
 *   Alignment Map*, one timestamped chip each, so a visitor who pressed ⚡ Deep
 *   Scan Song on a song with a chorus was shown `[Vocal Word 1]`…`[Vocal Word
 *   16]` under a heading saying the vocal had been aligned. The timestamps were
 *   real arithmetic on a section boundary; the words were a count.
 *
 *   THE COUNTER IS WHAT THESE CASES WATCH FOR. A stand-in satisfies every
 *   assertion about arity, spacing and ordering — those were all true of
 *   `[Vocal Word 7]`. So the cases assert on the TEXT: no row's label may match
 *   /vocal word/i, no row may carry a `word` key at all, and `lyrics` must come
 *   back empty from a scan whose sections are full of Verse and Chorus. The
 *   file's own header is asserted too, because the docstring naming VAD and
 *   speech recognition over a `${n}` counter is the part that made this survive
 *   — the next reader trusts the header and does not read the loop.
 *
 *   A SILENT BUFFER ON PURPOSE. The chroma loop skips any frame under 0.01 RMS,
 *   so silence costs an RMS pass and no DFT, and the section chunker and the
 *   cue loop — the code under test — run in full regardless. A real song would
 *   spend a minute in the DFT to reach the same twenty-four rows.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld, BACKEND_SOURCES } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = 'libControl/MusicChart/oaDeepScanner.js';
const OVERLAY = 'libControl/MusicChart/MusicChartOverlay.jsx';
const LENSES  = 'libControl/MusicChart/LensesView.jsx';

/**
 * Silence of a chosen length. numSections is floor(dur / 15) clamped to 3..8,
 * and the section names run Intro, Verse 1, Chorus 1, Verse 2, … — so 50s gives
 * three sections of which two are vocal, and 90s gives six of which four are.
 */
const silence = (ctx, seconds, rate = 8000) =>
    ctx.createBuffer(1, Math.floor(rate * seconds), rate);

describe('oaDeepScanAudio — the vocal rows are cues, not words', () => {
    test('lyrics comes back empty even when every section is a Verse or Chorus', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const scan = await w.window.oaDeepScanAudio(silence(w.ctx, 50));

        const vocal = scan.sections.filter(
            (s) => s.label.includes('Verse') || s.label.includes('Chorus'),
        );
        assert.ok(vocal.length >= 2, `expected vocal sections, got ${JSON.stringify(scan.sections.map((s) => s.label))}`);

        // AN OBJECT WITH AN EMPTY `words`, not a bare array. The promise this
        // case guards is unchanged — no recogniser runs, so nothing transcribed
        // anything — but the FIELD is now the same shape whichever writer filled
        // it, because dictation and .LRC import both write `{ words }` and the
        // scanner writing `[]` into the same field is what made `.words`
        // undefined on every surface downstream (PLAN-601.01).
        assert.deepEqual(scan.lyrics, { words: [] }, 'no recogniser runs, so there are no lyrics');
        w.cleanup();
    });

    test('eight cue points per vocal section, and sixteen for the three-section case', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const scan = await w.window.oaDeepScanAudio(silence(w.ctx, 50));

        assert.equal(scan.sections.length, 3);
        assert.deepEqual(scan.sections.map((s) => s.label), ['Intro', 'Verse 1', 'Chorus 1']);
        // The sixteen rows of the plan's title, under their real name.
        assert.equal(scan.vocal_section_cues.length, 16);
        w.cleanup();
    });

    test('no cue is labelled as a word, and no cue carries a word field', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const scan = await w.window.oaDeepScanAudio(silence(w.ctx, 90));

        assert.ok(scan.vocal_section_cues.length > 0);
        for (const cue of scan.vocal_section_cues) {
            assert.ok(
                !/vocal word/i.test(cue.label),
                `a cue is still labelled as a word: ${cue.label}`,
            );
            assert.equal(
                Object.prototype.hasOwnProperty.call(cue, 'word'), false,
                'a cue point must not have a `word` — nothing here read speech',
            );
            assert.ok(cue.label.includes(cue.section), 'the label names the section it came from');
        }
        w.cleanup();
    });

    test('cues sit inside their own section, spaced and ordered', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const scan = await w.window.oaDeepScanAudio(silence(w.ctx, 90));

        const byLabel = new Map(scan.sections.map((s) => [s.label, s]));
        let prev = -1;
        for (const cue of scan.vocal_section_cues) {
            const sec = byLabel.get(cue.section);
            assert.ok(sec, `cue names a section that is not in the scan: ${cue.section}`);
            assert.ok(cue.timestamp_seconds > sec.start_seconds, 'a cue is inside its section');
            assert.ok(cue.timestamp_seconds < sec.end_seconds, 'a cue is inside its section');
            assert.ok(cue.timestamp_seconds > prev, 'cues run forward');
            prev = cue.timestamp_seconds;
        }
        w.cleanup();
    });

    test('the index is the position in the array, not a display number', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const scan = await w.window.oaDeepScanAudio(silence(w.ctx, 90));

        scan.vocal_section_cues.forEach((cue, i) => assert.equal(cue.index, i));
        w.cleanup();
    });
});

describe('the three files no longer claim a recogniser they do not have', () => {
    const scannerSrc = readFileSync(join(ROOT, SCANNER), 'utf8');
    const overlaySrc = readFileSync(join(ROOT, OVERLAY), 'utf8');

    /**
     * The file with its comment-only lines dropped.
     *
     * BOTH HEADERS QUOTE THE DEFECT ON PURPOSE — the counter template and the
     * "Synchronized Vocal & Lyric Alignment Map" heading are named in the
     * PLAN-570.01 note so the next reader knows what was removed and why. A
     * grep over the whole file cannot tell that record from a relapse, and a
     * gate that forbids describing the bug is a gate that deletes its own
     * evidence. So the ban is enforced against the code and the header is
     * checked separately, for the promise rather than the word.
     */
    const codeOf = (src) => src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');

    test('the scanner emits no `[Vocal Word N]` template and declares no speechFrames', () => {
        const code = codeOf(scannerSrc);
        assert.ok(!/Vocal Word/.test(code), 'the counter template is back');
        assert.ok(!/speechFrames/.test(code), 'speechFrames is written by nothing and read by nothing');
    });

    test('nothing executable mentions VAD or speech recognition', () => {
        assert.ok(!/\bVAD\b|speech recognition/i.test(codeOf(scannerSrc)));
    });

    test('the scanner header states the absence instead of promising the feature', () => {
        assert.ok(
            /THERE IS NO LYRIC EXTRACTION HERE/.test(scannerSrc),
            'the header must say the thing the docstring used to promise',
        );
        assert.ok(
            !/extracts lyric word timestamps via VAD and speech recognition/.test(scannerSrc),
            'the original promise is back in the docstring',
        );
    });

    test('the overlay draws the cues and heads them honestly', () => {
        const code = codeOf(overlaySrc);
        assert.ok(!/Lyric Alignment Map/.test(code), 'the alignment heading is back');
        assert.ok(code.includes('data.vocal_section_cues'), 'the tab reads the cue array');
        assert.ok(
            /No lyric recognition runs in this scan/.test(code),
            'the tab must say out loud that nothing recognised a vocal',
        );
    });

    /**
     * THE THIRD FILE, AND THE ONE THAT OUTLIVES THE SESSION.
     *
     * The two cases above hold a claim that is on a SCREEN. `LensesView.jsx`
     * writes two files a person keeps — a `.PERF.json` and a `.PEAK` — and both
     * carried the same claim as a KEY NAME: `vad_vocal_events` in one and
     * `lyrics_vad` in the other. A key in a written artifact is read later by
     * something that never sees this source, so correcting the tab and leaving
     * the exporter alone moved the lie rather than removing it (PLAN-629.01).
     *
     * The importer is asserted with them on purpose. It is the one consumer of
     * `lyrics_vad` in this repository, and a rename that fixes the writer and
     * not the reader breaks the round trip in silence — the `.LRC` export is
     * enabled by exactly the value this path fills.
     */
    const lensesSrc = readFileSync(join(ROOT, LENSES), 'utf8');

    test('neither exported sidecar carries a key claiming VAD', () => {
        const code = codeOf(lensesSrc);
        assert.ok(!/vad_vocal_events/.test(code), 'the .PERF key claiming VAD is back');
        assert.ok(!/lyrics_vad/.test(code), 'the .PEAK key claiming VAD is back');
        assert.ok(code.includes('lyric_events:'), 'the .PERF export lost its lyric array');
        assert.ok(/^\s*lyrics:/m.test(code), 'the .PEAK export lost its lyrics section');
    });

    test('the importer reads the name the exporter now writes', () => {
        const code = codeOf(lensesSrc);
        assert.ok(
            code.includes('parsed.lyrics ||'),
            'the sidecar importer must read `lyrics`, or the round trip is broken',
        );
        assert.ok(
            !/parsed\.lyrics_vad/.test(code),
            'the importer is still reading the key that claimed VAD',
        );
    });

    test('the .PERF schema version moved with the key that was renamed', () => {
        // 1.1.0 wrote `vad_vocal_events`; 1.2.0 writes `lyric_events`. The whole
        // point of the field is that a reader of an older file can tell which
        // name to look for, so a silent rename under a held version is the one
        // failure this asserts against.
        assert.ok(
            /schema_version:\s*"1\.2\.0"/.test(codeOf(lensesSrc)),
            'the key was renamed without moving schema_version',
        );
    });
});

describe('the scan returns the shape its own surfaces read', () => {
    /**
     * A pitched, pulsed buffer: 220 Hz — an A — at exactly 120 BPM.
     *
     * The rate is low and the length short because the chromagram upstream is a
     * windowed DFT per 500 ms frame, and these cases are about the measurements
     * beside it rather than about it.
     */
    const pulsedTone = (ctx, seconds = 6, rate = 8000) => {
        const buf = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / rate;
            const beat = t * 2;
            d[i] = 0.5 * Math.exp(-8 * (beat - Math.floor(beat))) * Math.sin(2 * Math.PI * 220 * t);
        }
        return buf;
    };

    test('every key LensesView reads is on the return value', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const scan = await w.window.oaDeepScanAudio(silence(w.ctx, 50));

        // The five that were undefined, which is why two lens tabs white-screened,
        // one export threw and one wrote a sidecar with its best sections gone.
        assert.equal(typeof scan.musicality, 'object');
        assert.notEqual(scan.musicality, null);
        assert.equal(typeof scan.loudness, 'object');
        assert.notEqual(scan.loudness, null);
        assert.ok(Array.isArray(scan.beatMarkers));
        assert.ok(Array.isArray(scan.sections), 'the lens counts sections, so there must be some');
        assert.ok(Object.prototype.hasOwnProperty.call(scan, 'pcm_sha256'));
        for (const k of ['key', 'pitchHz', 'centsOffset', 'bpm']) {
            assert.ok(Object.prototype.hasOwnProperty.call(scan.musicality, k), `musicality.${k}`);
        }
        for (const k of ['integratedLUFS', 'maxTruePeakdBTP', 'lraLU']) {
            assert.ok(Object.prototype.hasOwnProperty.call(scan.loudness, k), `loudness.${k}`);
        }
        w.cleanup();
    });

    test('silence refuses every scalar rather than substituting one', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const scan = await w.window.oaDeepScanAudio(silence(w.ctx, 50));

        // NULL, NOT ZERO. 0 LUFS is the loudest number in the unit and 0 BPM is
        // not a slow song — refusal over fabrication, and perfSchema.json's
        // $comment is the ruling this inherits.
        assert.equal(scan.musicality.key, null);
        assert.equal(scan.musicality.pitchHz, null);
        assert.equal(scan.musicality.centsOffset, null);
        assert.equal(scan.musicality.bpm, null);
        assert.equal(scan.loudness.integratedLUFS, null);
        assert.equal(scan.loudness.maxTruePeakdBTP, null, 'the true peak of silence is −∞, not 0');
        assert.equal(scan.loudness.lraLU, null);
        assert.deepEqual(scan.beatMarkers, []);
        w.cleanup();
    });

    test('a 220 Hz pulse at 120 BPM is measured as one', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const scan = await w.window.oaDeepScanAudio(pulsedTone(w.ctx));

        // 220 Hz is A3. The estimate is quantised by the autocorrelation lag —
        // 8000/36 = 222.2 — so the tolerance is the resolution, not a fudge.
        assert.ok(Math.abs(scan.musicality.pitchHz - 220) < 4,
            `expected ~220 Hz, got ${scan.musicality.pitchHz}`);
        assert.match(scan.musicality.key, /^A /, `220 Hz is an A; got ${scan.musicality.key}`);
        assert.ok(Math.abs(scan.musicality.bpm - 120) < 2,
            `the envelope is 2 Hz = 120 BPM; got ${scan.musicality.bpm}`);
        assert.ok(scan.beatMarkers.length >= 8, `expected an onset per beat, got ${scan.beatMarkers.length}`);
        w.cleanup();
    });

    test('true peak is never below the sample peak, and loudness is in R128 range', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const buf = pulsedTone(w.ctx);
        const pcm = buf.getChannelData(0);
        let samplePeak = 0;
        for (let i = 0; i < pcm.length; i++) samplePeak = Math.max(samplePeak, Math.abs(pcm[i]));
        const samplePeakDb = 20 * Math.log10(samplePeak);

        const loud = w.window.oaMeasureLoudnessR128(pcm, buf.sampleRate);
        // THE ONE ERROR THAT WOULD MATTER. An oversampler is an approximation of
        // BS.1770-4's, but it may never report a peak the samples already exceed.
        // The 0.005 is exactly half the reporting quantum — the figure is rounded
        // to two decimals, and nothing else is being allowed for.
        assert.ok(loud.maxTruePeakdBTP >= samplePeakDb - 0.005,
            `true peak ${loud.maxTruePeakdBTP} dBTP is under the sample peak ${samplePeakDb}`);
        assert.ok(loud.integratedLUFS < 0 && loud.integratedLUFS > -70,
            `integrated loudness out of range: ${loud.integratedLUFS}`);
        assert.ok(loud.gatingThresholdLUFS < loud.integratedLUFS,
            'the relative gate sits below the figure it produced');
        w.cleanup();
    });

    test('a buffer too short for a 400 ms block has no loudness at all', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const loud = w.window.oaMeasureLoudnessR128(new Float32Array(800).fill(0.5), 8000);
        assert.equal(loud.integratedLUFS, null, '100 ms cannot carry a 400 ms block');
        assert.equal(loud.lraLU, null, 'a range needs 3 s');
        // But it is not silent, so the true peak IS a reading.
        assert.equal(typeof loud.maxTruePeakdBTP, 'number');
        w.cleanup();
    });

    test('the key estimator refuses a chroma vector with no energy in it', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        assert.equal(w.window.oaEstimateKey(new Float64Array(12)), null,
            'every zero vector correlates to C major if you let it');
        const cMajor = new Float64Array([1, 0, 0.2, 0, 0.8, 0.5, 0, 0.9, 0, 0.3, 0, 0.4]);
        assert.match(w.window.oaEstimateKey(cMajor).key, /^C /);
        w.cleanup();
    });

    test('the digest is of the decoded PCM and changes with the samples', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const a = await w.window.oaPcmSha256(new Float32Array([0, 0.5, -0.25]));
        const b = await w.window.oaPcmSha256(new Float32Array([0, 0.5, -0.25]));
        const c = await w.window.oaPcmSha256(new Float32Array([0, 0.5, 0.25]));
        assert.match(a, /^[0-9a-f]{64}$/);
        assert.equal(a, b, 'the same samples hash alike');
        assert.notEqual(a, c, 'different samples do not');
        // The SHA-256 of the empty string, which is what the AES Preservation
        // lens printed as this file's checksum until PLAN-601.01.
        assert.notEqual(a, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        w.cleanup();
    });
});

/**
 * The scan surrenders the thread about forty-five times over a three-minute
 * track, and until PLAN-801.03 every one of those repaints drew the same fixed
 * sentence — so a five-second scan and a hung one looked identical, which is
 * the complaint PLAN-801.01 was carved from with the number changed.
 *
 * A SOUNDING BUFFER, NOT SILENCE. Every other case in this file scans silence
 * because the chroma loop skips a frame under 0.01 RMS and the code they test
 * runs regardless. These cases are about the yields, and a yield only happens
 * on a SOUNDING frame — a silent buffer reports nothing at all, correctly.
 *
 * AND `OA_SCAN_YIELD_FRAMES` IS TURNED DOWN. Its own comment says it is a frame
 * count rather than a millisecond budget precisely so the suite can exercise
 * it; four instead of sixteen buys nineteen reports out of a twenty-second tone
 * rather than four, at a quarter of the DFT bill of the buffer it would take to
 * get nineteen at the shipped setting.
 */
describe('oaDeepScanAudio — the progress the scan already knows', () => {
    const tone = (ctx, seconds, rate = 8000) => {
        const buf = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 220 * (i / rate));
        return buf;
    };

    test('the callback runs once per yield, in order, and never past the end', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        w.window.OA_SCAN_YIELD_FRAMES = 4;

        const seen = [];
        const scan = await w.window.oaDeepScanAudio(tone(w.ctx, 20), (p) => seen.push(p));

        assert.ok(seen.length > 1, `expected several reports, got ${seen.length}`);
        const total = seen[0].totalFrames;
        assert.ok(total > 0, 'totalFrames must be a real count');
        // BOUNDED BY THE YIELD RATE, NOT THE FRAME RATE. One report per frame
        // would be the defect this replaces in its other direction: a React
        // setState per 250 ms of audio is a repaint storm, and the reason the
        // callback is called at the yield and never between them.
        assert.ok(seen.length < total, `expected fewer reports (${seen.length}) than frames (${total})`);

        for (let i = 0; i < seen.length; i++) {
            assert.equal(seen[i].totalFrames, total, 'the denominator does not move mid-scan');
            assert.ok(seen[i].frame >= 0 && seen[i].frame < total, `frame ${seen[i].frame} is outside 0..${total}`);
            if (i > 0) {
                assert.ok(seen[i].frame > seen[i - 1].frame,
                    `report ${i} went backwards: ${seen[i - 1].frame} then ${seen[i].frame}`);
            }
        }

        // FRAMES, NOT A PERCENTAGE — the last report of a healthy scan is short
        // of the end, because the loop skips quiet frames and because the tail
        // of the buffer falls inside the final yield window. A bar drawn from
        // `frame / totalFrames` would stall; this asserts the shortfall exists
        // so nobody "fixes" it into one.
        assert.ok(seen[seen.length - 1].frame < total - 1,
            'the last report is expected to be short of the end; see the scanner header');
        assert.equal(typeof scan, 'object');
        w.cleanup();
    });

    test('the same scan with no callback returns the same object', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        w.window.OA_SCAN_YIELD_FRAMES = 4;

        const withCb = await w.window.oaDeepScanAudio(tone(w.ctx, 20), () => {});
        const without = await w.window.oaDeepScanAudio(tone(w.ctx, 20));
        assert.deepEqual(without, withCb, 'watching the scan must not change it');

        // A NON-FUNCTION IN THAT POSITION IS IGNORED, not called. The parameter
        // used to be `peakData`, which the function never read; anything still
        // passing one gets the behaviour it always had rather than a TypeError.
        const legacy = await w.window.oaDeepScanAudio(tone(w.ctx, 20), { musicality: {} });
        assert.deepEqual(legacy, withCb, 'a stray object in the callback slot is ignored');
        w.cleanup();
    });
});
