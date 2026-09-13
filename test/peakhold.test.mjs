// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: peakhold.test.mjs
 * Purpose: Prove the plugin meter reads every sample between two pump passes,
 *   and that its fall is a time constant rather than a per-frame multiply.
 * Description: PLAN-18.09 wants the two rAF loops collapsed onto one slower
 *   pumped tick, and says — correctly, and as its FIRST step — that slowing the
 *   pump before the back end peak-holds does not make the meters late, it makes
 *   them WRONG.
 *
 *   An AnalyserNode is a window, not a meter: it holds the last `fftSize`
 *   samples and nothing before them. Read it every 33 ms with a 21 ms window
 *   and 12 ms of every 33 never existed as far as the meter is concerned. A
 *   transient in that hole is not reported late; it is not reported.
 *
 *   That is not assertable against the shared FakeAnalyser, which hands back a
 *   sine of a fixed amplitude with no notion of time. So this file brings its
 *   own analyser — a real ring buffer over a real signal, advanced in real
 *   time — and the test is exactly the one the plan describes: put a spike in
 *   the gap between two reads and ask whether the meter saw it.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './harness.mjs';

const RATE = 48000;

/**
 * An analyser over a signal that actually has a timeline. `at` is the clock in
 * seconds; a read hands back the last `fftSize` samples ending there, which is
 * what a browser's analyser does and what the shared fake does not.
 */
function streamingAnalyser(signalAt) {
    return {
        fftSize: 1024,
        at: 0,
        reads: 0,
        getFloatTimeDomainData(array) {
            this.reads++;
            const last = Math.round(this.at * RATE);
            const first = last - array.length;
            for (let i = 0; i < array.length; i++) {
                array[i] = signalAt((first + i) / RATE);
            }
        },
    };
}

/** Silence, with one full-scale sample at `when`. */
const spikeAt = (when) => (t) => (Math.abs(t - when) < 0.5 / RATE ? 1 : 0);

describe('the plugin meter between pump passes (PLAN-18.09 step 1)', () => {
    test('a transient in the gap between two reads is still seen', async () => {
        const world = await createWorld();
        const { window } = world;
        window.OA_AUDIO_CTX = { sampleRate: RATE };

        // 30 Hz: the tier PLAN-18.09 wants to drive both loops from. 33.3 ms
        // between passes against a 1024-sample window is 21.3 ms of audio —
        // so 12 ms of every pass would never be looked at.
        const span = 1 / 30;
        let clock = 0;
        window.performance = { now: () => clock };

        // Two passes to establish the span, then the one that matters.
        window.oaPumpPluginsOnce();
        clock += span * 1000;
        window.oaPumpPluginsOnce();

        const analyser = streamingAnalyser(spikeAt(span * 1.15));
        analyser.at = span * 2;

        clock += span * 1000;
        window.oaPumpPluginsOnce();

        // The spike sits at 1.15 spans — after the previous pass's 21.3 ms
        // window ended and before this pass's would have begun. It is in the
        // hole, and the hole is the whole point.
        assert.equal(window.oaPumpSpan().toFixed(4), span.toFixed(4));
        assert.equal(window.oaAnalyserPeak(analyser), 1,
            'the meter missed a full-scale transient between two reads');

        // ...and it was seen because the window was GROWN to cover the gap.
        assert.ok(analyser.fftSize >= span * RATE,
            `window ${analyser.fftSize} does not cover ${span * RATE} samples`);
        world.cleanup();
    });

    test('the same transient is missed by a window that was not grown', () => {
        // The defect itself, so the test above is known to be measuring
        // something. Same signal, same offset, a window pinned at 1024.
        const span = 1 / 30;
        const analyser = streamingAnalyser(spikeAt(span * 1.15));
        analyser.at = span * 2;
        const buf = new Float32Array(1024);
        analyser.getFloatTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
        assert.equal(peak, 0,
            'the pinned window saw it, so this test proves nothing');
    });

    test('the window is grown, never shrunk', async () => {
        const world = await createWorld();
        const { window } = world;
        window.OA_AUDIO_CTX = { sampleRate: RATE };
        let clock = 0;
        window.performance = { now: () => clock };
        window.oaPumpPluginsOnce();
        clock += (1000 / 60);
        window.oaPumpPluginsOnce();

        // A spectrum display chose 8192 for its own reasons. 60 Hz needs 800.
        const analyser = streamingAnalyser(() => 0);
        analyser.fftSize = 8192;
        window.oaAnalyserPeak(analyser);
        assert.equal(analyser.fftSize, 8192,
            'a meter shrank an analyser somebody else sized');
        world.cleanup();
    });

    test('the fall is a time constant, not a per-frame multiply', async () => {
        const world = await createWorld();
        const { window } = world;
        window.OA_AUDIO_CTX = { sampleRate: RATE };
        let clock = 0;
        window.performance = { now: () => clock };

        // One 60 Hz frame still multiplies by exactly 0.86 — today's ballistic,
        // unchanged, which is what makes this safe to land before any rate moves.
        window.oaPumpPluginsOnce();
        clock += 1000 / 60;
        window.oaPumpPluginsOnce();
        const one = new Float32Array(8);
        one[2] = 1;
        window.oaWritePeak(one, 2, 0);
        assert.ok(Math.abs(one[2] - 0.86) < 0.001, `60 Hz fall was ${one[2]}`);

        // Two 120 Hz frames cover the same wall-clock second and must land in
        // the same place. Before this, they fell to 0.86² = 0.74.
        const fast = await createWorld();
        fast.window.OA_AUDIO_CTX = { sampleRate: RATE };
        let fastClock = 0;
        fast.window.performance = { now: () => fastClock };
        fast.window.oaPumpPluginsOnce();
        for (let i = 0; i < 2; i++) { fastClock += 1000 / 120; fast.window.oaPumpPluginsOnce(); }
        const two = new Float32Array(8);
        two[2] = 1;
        fast.window.oaWritePeak(two, 2, 0);
        fast.window.oaWritePeak(two, 2, 0);
        assert.ok(Math.abs(two[2] - one[2]) < 0.005,
            `120 Hz fell to ${two[2]}, 60 Hz to ${one[2]} — the ballistic is a display property`);
        world.cleanup(); fast.cleanup();
    });
});
