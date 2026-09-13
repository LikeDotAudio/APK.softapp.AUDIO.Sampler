// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: chromaFixture.mjs
 * Purpose: The deterministic audio `chroma.test.mjs` scans, and the writer of
 *   the fixture it is held against.
 * Description: PLAN-801.01 replaced the chromagram's per-bin windowed DFT with
 *   a Goertzel filter over a pre-windowed frame. That is a change to how the
 *   number is ARRIVED AT and must not be a change to the number, so the fixture
 *   in `chroma.fixture.json` was emitted from the naive implementation as it
 *   stood at HEAD and the suite holds the fast one to it.
 *
 *   NO Math.random ANYWHERE. A fixture is worth nothing against a signal that
 *   differs between runs, so the progression is pure sines and the noise floor
 *   is a fixed 16-bit LCG. Both writer and reader import `progression()` from
 *   here rather than each building their own copy of "the same" buffer.
 *
 *   It is deliberately NOT named `*.test.mjs`: it asserts nothing and must not
 *   be counted by `check_case_floor.mjs`.
 *
 *   Contract: `node test/chromaFixture.mjs --emit` overwrites
 *   `test/chroma.fixture.json` from whatever `oaDeepScanner.js` is on disk.
 *   Run it ONLY to re-baseline a deliberate change to what the scan reports —
 *   running it to make a red suite green is running it backwards.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld, BACKEND_SOURCES } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const FIXTURE = join(HERE, 'chroma.fixture.json');
// `SCANNER_SOURCES` STOOD HERE AND WAS `BACKEND_SOURCES` WITH TWO OF ITS OWN
// MEMBERS APPENDED. `oaScanMeasure.js` is BACKEND_SOURCES[55] and
// `oaDeepScanner.js` is [56] -- verified by set membership, not by reading --
// so this list evaluated both a second time, AFTER every other source, instead
// of at the index `build.mjs` concatenates them at. Harmless only because those
// two modules are idempotent on a second evaluation; the fixture below was
// still emitted from a world that is not the world the bundle builds.
// PLAN-814.01 deleted two lists of this exact shape and PLAN-814.02 deleted
// this one, which had appeared inside the hour. `globals.test.mjs` now refuses
// the shape, so a fourth cannot arrive quietly.

/** Four bars of triads, 6 s each, at a rate the naive DFT can be run over. */
export const RATE = 16000;
export const SECONDS = 24;
const TRIADS = [
    [261.63, 329.63, 392.00],   // C  major
    [220.00, 261.63, 329.63],   // A  minor
    [174.61, 220.00, 261.63],   // F  major
    [196.00, 246.94, 293.66],   // G  major
];

/**
 * The buffer under test. Loud enough everywhere to clear the scanner's 0.01 RMS
 * gate, so every frame reaches the chromagram and the fixture covers all of it.
 */
export function progression(ctx, rate = RATE, seconds = SECONDS) {
    const buf = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
    const d = buf.getChannelData(0);
    // A fixed LCG, not Math.random: a fixture is only a fixture if the signal
    // under it is the same buffer on every machine and every run.
    let seed = 0x2f6e2b1;
    for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        const triad = TRIADS[Math.min(TRIADS.length - 1, Math.floor(t / (seconds / TRIADS.length)))];
        let v = 0;
        for (const f of triad) v += 0.28 * Math.sin(2 * Math.PI * f * t);
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = v + ((seed / 0x7fffffff) - 0.5) * 0.02;
    }
    return buf;
}

/** One 500 ms frame off the head of that buffer — the per-frame equality case. */
export function firstFrame(buf) {
    return buf.getChannelData(0).subarray(0, Math.floor(buf.sampleRate * 0.5));
}

export async function measure() {
    const w = await createWorld({ sources: BACKEND_SOURCES });
    const buf = progression(w.ctx);
    const chroma = Array.from(w.window.oaComputeFrameChroma(firstFrame(buf), buf.sampleRate));
    const scan = await w.window.oaDeepScanAudio(buf);
    return {
        chroma,
        total_chords: scan.total_chords,
        chords: scan.chords,
        sections: scan.sections,
        notes_length: scan.notes.length,
    };
}

if (process.argv.includes('--emit')) {
    const out = await measure();
    writeFileSync(FIXTURE, `${JSON.stringify({
        _comment: (
            'What the chromagram and the scan report for test/chromaFixture.mjs\'s '
            + 'progression(), emitted from the naive per-bin windowed DFT as it stood '
            + 'before PLAN-801.01 replaced it with a Goertzel filter. The point of the '
            + 'change was speed; this file is what holds it to having changed nothing '
            + 'else. Re-emit only for a deliberate change to what the scan REPORTS: '
            + 'node test/chromaFixture.mjs --emit'
        ),
        rate: RATE,
        seconds: SECONDS,
        ...out,
    }, null, 2)}\n`);
    console.log(`✓ fixture written: ${out.total_chords} chord change(s), ${out.sections.length} section(s), ${out.notes_length} note row(s)`);
}
