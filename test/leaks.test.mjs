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
 * Header: leaks.test.mjs
 * Purpose: Prove the app can play for a long time without getting heavier.
 * Description: This file exists because of a failure nobody could see while it
 *   was happening: the sampler got slower and dirtier the longer a session ran.
 *   That is what a leak sounds like. Memory fills, the collector runs harder and
 *   longer, its pauses land on the main thread, the audio thread misses its
 *   deadline, and a missed deadline is heard as a crackle. "Slow" and
 *   "distorted" are one symptom, not two.
 *
 *   Every test here is the same shape: measure, do a lot of work, measure again,
 *   and assert the second number is the first one. Not "small" — the SAME. A
 *   leak that grows slowly still grows.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from './harness.mjs';

/** A pad with a real sample on it, the way the browser would load one. */
const loadSample = (w, idx, seconds = 0.5) => {
    const buf = w.ctx.createBuffer(2, Math.floor(w.ctx.sampleRate * seconds), w.ctx.sampleRate);
    w.window.oaSetDrumSample(idx, buf, { name: `test-${idx}.wav`, pitch: 1 });
    return buf;
};

/** Play `n` hits, one every 60ms, letting the clock run between them. */
const play = (w, n, idx = 0) => {
    for (let i = 0; i < n; i++) {
        w.window.oaTriggerDrum(idx, 1, w.ctx.currentTime);
        w.ctx.advance(0.06);
    }
};

/**
 * Let everything ring out, sweeping as it goes.
 *
 * Stepped rather than one big jump, because that is what the running app does —
 * the meter pump sweeps every frame. It matters: a chain is held for a short
 * tail after its voice ends so the reverb and delay sends are not cut off
 * mid-note, so a single advance-then-sweep can only ever drain what had already
 * come due before the jump.
 */
const settle = (w, seconds = 5) => {
    const step = 0.1;
    for (let t = 0; t < seconds; t += step) {
        w.ctx.advance(step);
        w.window.oaSweepVoices(w.ctx);
    }
    w.window.oaPumpPluginsOnce();
};

describe('memory', () => {
    test('the live voice registry drains after every voice has ended', async () => {
        const w = await createWarmWorld();
        loadSample(w, 0);

        play(w, 200);
        settle(w);

        assert.equal(
            w.window.OA_LIVE_VOICES.length, 0,
            'sources are still registered after they ended — this is the array that used to grow forever',
        );
        assert.deepEqual(
            w.ctx.danglingSources().map((s) => s.__type), [],
            'a source started and never ended',
        );
    });

    test('the voice registry is not the kit definition', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        loadSample(w, 0);

        // OA_DRUM_VOICES is the kit's voice table. It used to be the live-source
        // registry as well, under the same name — so this held BufferSources.
        const before = window.OA_DRUM_VOICES.length;
        play(w, 20);
        assert.equal(
            window.OA_DRUM_VOICES.length, before,
            'playing changed the length of the kit voice table',
        );
        window.OA_DRUM_VOICES.forEach((v, i) => {
            assert.equal(typeof v.name, 'string', `kit voice ${i} has no name`);
            assert.equal(typeof v.freq, 'number', `kit voice ${i} has no pitch`);
        });

        // The specific breakage: rebuilding the grid mid-playback indexed that
        // table with i % length and handed pads whatever was in it.
        window.oaBuildDrumKit();
        window.OA_DRUM_KIT.forEach((v, i) => {
            assert.equal(typeof v.name, 'string', `pad ${i} got a voice with no name`);
            assert.equal(typeof v.freq, 'number', `pad ${i} got a voice with no pitch`);
        });
    });

    test('the node graph returns to where it started', async () => {
        const w = await createWarmWorld();
        loadSample(w, 0);

        // A driven channel with a send: the widest chain a voice can build, so
        // the most to leave behind if it is not released.
        w.window.oaSetReverbSend(0, 0, 0.4);
        w.window.oaPluginSet('drive', 0, 'mix', 0.7);

        // Warm up first: the compressor strips and effect buses are built once
        // and are meant to persist, so they must not count as growth.
        play(w, 20);
        settle(w);
        const attached = w.ctx.connectedToDestination();
        const audible = w.ctx.retained();

        play(w, 400);
        settle(w);

        // STILL ATTACHED is the one that catches an unreleased chain. Nothing
        // is feeding those nodes, so they make no sound and `retained` cannot
        // see them — but the browser still holds every one of them in its graph.
        assert.equal(
            w.ctx.connectedToDestination(), attached,
            `${w.ctx.connectedToDestination() - attached} nodes from 400 voices are still wired into the destination`,
        );
        assert.equal(
            w.ctx.retained(), audible,
            'something is still being fed after every voice ended',
        );
    });

    test('nodes built per hit stay constant — hit 400 costs what hit 1 cost', async () => {
        const w = await createWarmWorld();
        loadSample(w, 0);

        // A driven channel, because that is the expensive path: the pedal builds
        // a waveshaper at 4x oversampling on top of the pan and the sends.
        w.window.oaPluginSet('drive', 0, 'mix', 0.8);
        w.window.oaPluginSet('drive', 0, 'drive', 12);

        play(w, 50);
        settle(w);
        const afterFirst = w.ctx.createdCount();

        play(w, 50);
        settle(w);
        const afterSecond = w.ctx.createdCount();

        play(w, 50);
        settle(w);
        const afterThird = w.ctx.createdCount();

        const first = afterSecond - afterFirst;
        const second = afterThird - afterSecond;
        assert.equal(
            first, second,
            `each block of 50 hits should build the same number of nodes; got ${first} then ${second}`,
        );
    });

    test('the retirement queue stays bounded while playing', async () => {
        const w = await createWarmWorld();
        loadSample(w, 0);

        let worst = 0;
        for (let i = 0; i < 300; i++) {
            w.window.oaTriggerDrum(0, 1, w.ctx.currentTime);
            w.ctx.advance(0.06);
            worst = Math.max(worst, w.window.oaPendingVoices(w.ctx));
        }

        // A handful of chains in flight is the design; a few hundred is the
        // queue never being drained.
        assert.ok(worst < 30, `retirement queue reached ${worst} entries`);

        settle(w);
        assert.equal(w.window.oaPendingVoices(w.ctx), 0, 'the queue did not drain');
    });

    test('a looping pad is released when it is toggled off', async () => {
        const w = await createWarmWorld();
        const buf = w.ctx.createBuffer(2, w.ctx.sampleRate, w.ctx.sampleRate);
        w.window.oaSetDrumSample(0, buf, { name: 'loop.wav', loop: true });

        // Toggle a loop on and off fifty times. A loop has no natural end, so
        // if the toggle does not release it, this is where it piles up.
        for (let i = 0; i < 50; i++) {
            w.window.oaTriggerDrum(0, 1);
            w.ctx.advance(0.5);
            w.window.oaTriggerDrum(0, 1);
            w.ctx.advance(0.5);
        }
        settle(w);

        assert.equal(w.window.OA_LIVE_VOICES.length, 0, 'looping voices are still registered');
        assert.equal(w.window.OA_DRUM_LOOPS[0], null, 'the loop slot still points at a stopped source');
    });
});

describe('the tone cache', () => {
    test('is dropped when the pad gets a different sample', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        loadSample(w, 0, 0.25);
        await window.oaPrecacheTones(0);

        const held = window.oaToneCacheBytes();
        assert.ok(held > 0, 'nothing was cached, so this test proves nothing');
        assert.ok(window.OA_TONE_CACHE[0], 'the cache should exist after a precache');

        // The pad gets a new sound. Every render under this key was made from
        // the old one.
        loadSample(w, 0, 0.25);

        // `assert.ok` on an identity check, not `assert.equal` on the cache
        // itself: a failing equal() asks node to render a diff of whatever it
        // was given, and what it would be given here is sixty-one pre-rendered
        // buffers. That inspection has been measured taking gigabytes — enough
        // to get the test runner OOM-killed, which takes the editor that
        // launched it down too. A failing test must fail, not kill the machine.
        assert.ok(
            window.OA_TONE_CACHE[0] === undefined,
            'the old renders survived a sample change',
        );
        assert.equal(window.oaToneCacheBytes(), 0, 'the cache still reports bytes it no longer holds');
    });

    test('does not play the previous sample after a swap', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        const first = loadSample(w, 0, 0.25);
        await window.oaPrecacheTones(0);
        // The unison entry is the original buffer itself, so it is the one that
        // makes the mix-up audible.
        assert.ok(window.OA_TONE_CACHE[0], 'precache produced nothing');

        const second = loadSample(w, 0, 0.4);
        window.oaTriggerTone(0, 0, 1);

        const playing = window.OA_LIVE_VOICES[window.OA_LIVE_VOICES.length - 1];
        assert.ok(playing, 'the tone did not sound at all');
        // Identity, via assert.ok, for the same reason as above — these are
        // audio buffers, and a diff of one is a wall of Float32Array.
        assert.ok(playing.buffer !== first, 'tone mode played the sample that used to be on this pad');
        assert.ok(playing.buffer === second, 'tone mode should play the sample that is on the pad now');
    });

    test('stays inside its budget across many pads', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        // A small budget so the test is quick; the mechanism is the same one
        // that holds 64MB in the app.
        window.OA_TONE_CACHE_BUDGET = 2 * 1024 * 1024;

        for (let pad = 0; pad < 8; pad++) {
            loadSample(w, pad, 0.2);
            await window.oaPrecacheTones(pad);
            assert.ok(
                window.oaToneCacheBytes() <= window.OA_TONE_CACHE_BUDGET,
                `after pad ${pad} the cache held ${(window.oaToneCacheBytes() / 1048576).toFixed(1)}MB`,
            );
        }

        // Whatever was rendered last must survive its own budget pass, or the
        // pad the player is working on is the one that never gets cached.
        assert.ok(window.OA_TONE_CACHE[7], 'the pad just rendered was evicted immediately');
    });

    test('reports its size to the front panel in megabytes', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const L = window.oaPluginLayout('voices');

        loadSample(w, 0, 0.2);
        await window.oaPrecacheTones(0);
        window.oaPumpPluginsOnce();

        const frame = window.oaPluginFrame('voices', 0);
        const mb = window.oaToneCacheBytes() / 1048576;
        assert.ok(Math.abs(frame[L.CACHE_MB] - mb) < 1e-6, 'CACHE_MB does not match what is held');
    });
});

describe('teardown', () => {
    test('dispose releases every bus in the rack', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        // Make sure there is something to tear down: a send into each bus.
        window.oaSetReverbSend(0, 0, 0.5);
        window.oaSetDelaySend(0, 0, 0.5);
        window.oaPluginSet('comp', 0, 'on', true);
        await window.oaWarmFx(w.ctx);
        await w.flush();

        loadSample(w, 0);
        play(w, 20);
        settle(w);

        assert.ok(w.ctx.__oaComps.length > 0, 'no compressor strips were built');

        window.oaDisposePlugins(w.ctx);
        w.ctx.advance(1);

        assert.equal(w.ctx.__oaReverbs.length, 0, 'reverb buses survived dispose');
        assert.equal(w.ctx.__oaDelays.length, 0, 'delay buses survived dispose');
        assert.equal(w.ctx.__oaComps.length, 0, 'compressor strips survived dispose');
        assert.equal(w.ctx.retained(), 0, 'something is still wired to the destination after dispose');
        assert.deepEqual(
            w.ctx.danglingSources().map((s) => s.__type), [],
            'a source is still running after dispose — the chorus and tape LFOs are the usual pair',
        );
    });

    test('dispose is safe to call twice, and on a context that never played', async () => {
        const w = await createWarmWorld();
        assert.doesNotThrow(() => {
            w.window.oaDisposePlugins(w.ctx);
            w.window.oaDisposePlugins(w.ctx);
        });
        const fresh = new w.window.AudioContext();
        assert.doesNotThrow(() => w.window.oaDisposePlugins(fresh));
    });
});
