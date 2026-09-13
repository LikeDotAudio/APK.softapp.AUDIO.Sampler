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
 * Header: chroma.test.mjs
 * Purpose: Hold the chromagram to producing the SAME SCAN, faster — and hold
 *   the scan to giving the tab its event loop back while it runs.
 * Description: PLAN-801.01. `oaComputeFrameChroma` evaluated 49 semitone bins
 *   by summing a windowed sine and cosine per sample per bin — three
 *   transcendentals in the innermost loop, 3.5 million of them per frame at
 *   48 kHz — and `oaDeepScanAudio` calls it every 250 ms of sounding audio with
 *   no worker and no yield. A three-minute song blocked the tab for 17.7 s,
 *   while the EBU R128 pass, the true-peak pass, the onset envelope and the
 *   pitch estimator beside it cost about 0.2 s together.
 *
 *   A SPEED-UP THAT CHANGES THE ANSWER IS NOT A SPEED-UP. So the first two
 *   cases here are equality, not performance: `chroma.fixture.json` was emitted
 *   from the naive implementation as it stood before the change, and both the
 *   raw 12-bin vector and the chord and section timeline of a whole scan are
 *   held to it exactly. Goertzel is the same arithmetic reassociated, not an
 *   approximation, so `deepStrictEqual` is the right instrument and a tolerance
 *   would be hiding something.
 *
 *   THE BUDGET CASE IS TWO-SIDED AND DELIBERATELY LOOSE. 12 s over a synthetic
 *   three-minute 48 kHz buffer sits about 2.4x above what the fast path
 *   measures here and well under what the naive one did, so it catches the
 *   regression without going red because the machine was busy. The claim that
 *   the tab can PAINT is not a timing claim at all and is asserted beside it
 *   over the SAME scan — a three-minute scan is five seconds of `npm test` and
 *   two cases would have paid for it twice. A self-rescheduling ticker counts
 *   the event-loop turns it gets while the scan is in flight, and under the old
 *   code that number was zero however long the scan took.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createWorld, BACKEND_SOURCES } from './harness.mjs';
import {
    FIXTURE, RATE, progression, firstFrame,
} from './chromaFixture.mjs';

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));

/** Three minutes at 48 kHz — the case the plan is named after. */
const song = (ctx) => {
    const rate = 48000;
    const buf = ctx.createBuffer(1, rate * 180, rate);
    const d = buf.getChannelData(0);
    let seed = 0x2f6e2b1;
    for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = 0.3 * Math.sin(2 * Math.PI * 220 * t)
             + 0.25 * Math.sin(2 * Math.PI * 329.63 * t)
             + ((seed / 0x7fffffff) - 0.5) * 0.02;
    }
    return buf;
};

describe('oaComputeFrameChroma — the fast chromagram is the same chromagram', () => {
    test('one frame returns the vector the naive per-bin DFT returned', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const buf = progression(w.ctx);
        assert.equal(buf.sampleRate, RATE);

        const got = Array.from(w.window.oaComputeFrameChroma(firstFrame(buf), buf.sampleRate));

        assert.equal(got.length, 12);
        assert.deepStrictEqual(got, fixture.chroma,
            'the Goertzel form is the same arithmetic reassociated — any difference at all '
            + 'in the 12 bins means the scan now reports something the old one did not');
    });

    test('a short frame is still refused rather than answered with noise', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const short = new Float32Array(511).fill(0.5);
        assert.deepStrictEqual(Array.from(w.window.oaComputeFrameChroma(short, RATE)), new Array(12).fill(0));
        assert.deepStrictEqual(Array.from(w.window.oaComputeFrameChroma(null, RATE)), new Array(12).fill(0));
    });

    test('a silent frame comes back all-zero and never NaN', async () => {
        // The closed-form Goertzel power is a difference of large products, so
        // a genuinely silent bin can round below zero; Math.sqrt would answer
        // that with NaN and every chord downstream would be Cmaj by default.
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const quiet = w.window.oaComputeFrameChroma(new Float32Array(8000), RATE);
        for (const v of quiet) assert.ok(Number.isFinite(v) && v === 0, `expected 0, got ${v}`);
    });
});

describe('oaDeepScanAudio — the whole scan is unchanged', () => {
    test('the chord and section timeline matches the pre-Goertzel fixture exactly', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const scan = await w.window.oaDeepScanAudio(progression(w.ctx));

        assert.deepStrictEqual(scan.chords, fixture.chords);
        assert.deepStrictEqual(scan.sections, fixture.sections);
        assert.equal(scan.total_chords, fixture.total_chords);
        assert.equal(scan.notes.length, fixture.notes_length);
    });
});

describe('oaDeepScanAudio — a three-minute song does not own the thread', () => {
    // ONE SCAN, BOTH ASSERTIONS. The wall clock and the yield count are two
    // different claims and they were two cases until the cost was measured: a
    // three-minute scan is five seconds of `npm test` and running it twice to
    // ask two questions about the same run is five seconds nobody gets back.
    test('it scans inside the budget AND lets the event loop run while it does', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        const buf = song(w.ctx);

        // A ticker that reschedules itself. Every turn it gets is a turn the
        // page would have had to repaint in; under the pre-PLAN-801.01 scanner
        // there was no await between the drop and the return, so this counted
        // zero however long the scan took.
        let turns = 0;
        let running = true;
        const tick = () => { if (running) { turns++; setTimeout(tick, 0); } };

        const t0 = Date.now();
        const scanning = w.window.oaDeepScanAudio(buf);
        setTimeout(tick, 0);
        const scan = await scanning;
        const elapsed = Date.now() - t0;
        running = false;

        // 718 sounding frames is what the plan measured on this buffer shape;
        // asserting it means a budget met by scanning LESS reads as a failure.
        assert.equal(scan.notes.length, 718);
        assert.ok(elapsed < 12000,
            `a three-minute scan took ${elapsed} ms. The naive per-bin DFT this replaced `
            + 'spent 17.7 s of that in the chromagram alone (PLAN-801.01).');
        assert.ok(turns >= 10,
            `the scan surrendered the thread ${turns} time(s). It yields every `
            + 'OA_SCAN_YIELD_FRAMES sounding frames and there are 718 of them.');
    });

    test('OA_SCAN_YIELD_FRAMES is a frame count the suite can turn', async () => {
        const w = await createWorld({ sources: BACKEND_SOURCES });
        assert.equal(typeof w.window.OA_SCAN_YIELD_FRAMES, 'number');
        assert.ok(w.window.OA_SCAN_YIELD_FRAMES >= 1);
    });
});

describe('the scanner still says what it does', () => {
    test('the header names the yield, because a caller must await it', async () => {
        const src = readFileSync(new URL('../libControl/MusicChart/oaDeepScanner.js', import.meta.url), 'utf8');
        const header = src.slice(0, src.indexOf('window.NOTE_NAMES_12'));
        assert.match(header, /YIELDS TO THE EVENT LOOP/,
            'the contract header is what the next reader trusts instead of reading the loop');
        assert.match(header, /OA_SCAN_YIELD_FRAMES/);
    });
});
