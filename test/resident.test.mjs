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
 * Header: resident.test.mjs
 * Purpose: What the engine holds in memory, and what stops it holding too much.
 * Description: Two failures live here and neither one announces itself.
 *
 *   THE CACHE THAT ISN'T. A memoised build is invisible when it silently stops
 *   memoising — the app is correct, just slower, and the slowness turns up as a
 *   dropout in someone's take rather than as a test failure. So the cache is
 *   asserted on identity: the same settings must hand back the SAME AudioBuffer
 *   object, because that is the only evidence that the second build never ran.
 *
 *   THE CACHE THAT NEVER LETS GO. The Tone Mode cache above it ate half a
 *   gigabyte before anyone noticed, so every store in this engine is budgeted.
 *   A budget nobody tests is a comment.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './harness.mjs';

describe('resident memory', () => {
    test('a buffer cache stays inside its budget, coldest out first', async () => {
        const w = await createWorld();
        const { window, ctx } = w;

        const BUDGET = 400 * 1024;                       // 400KB
        const cache = window.oaBufferCache('probe', () => BUDGET);
        const buf = () => ctx.createBuffer(1, 25000, 48000);   // 100KB each

        for (let i = 0; i < 20; i++) cache.put('k' + i, buf());
        assert.ok(cache.bytes() <= BUDGET, `held ${cache.bytes()} over ${BUDGET}`);
        assert.ok(cache.evictions > 0, 'nothing was ever evicted');
        // The most recent four fit; the first one is long gone.
        assert.equal(cache.get('k0'), null);
        assert.ok(cache.get('k19'), 'the newest entry was evicted instead of the oldest');
    });

    test('a buffer too big for the budget is handed back unstored', async () => {
        const w = await createWorld();
        const { window, ctx } = w;
        const cache = window.oaBufferCache('probe2', () => 1024);
        const big = ctx.createBuffer(2, 48000, 48000);
        assert.equal(cache.put('big', big), big, 'the caller must still get its buffer');
        assert.equal(cache.bytes(), 0, 'it must not be stored');
        assert.equal(cache.get('big'), null);
    });

    test('a room is drawn once and recalled, not redrawn', async () => {
        const w = await createWorld();
        const { window, ctx } = w;

        const unit = window.oaReverbUnit(0);
        const first = window.oaBuildImpulse(ctx, unit);
        assert.ok(first, 'no impulse response was built at all');
        assert.equal(window.oaBuildImpulse(ctx, unit), first, 'the room was drawn twice');

        // A geometry change is a different room…
        const was = unit.rtMid;
        unit.rtMid = was + 1;
        const other = window.oaBuildImpulse(ctx, unit);
        assert.notEqual(other, first, 'two different settings shared one response');

        // …and going back to the old setting recalls the old room, rather than
        // drawing a third one from a fresh set of random numbers.
        unit.rtMid = was;
        assert.equal(window.oaBuildImpulse(ctx, unit), first, 'coming back redrew the room');
    });

    test('the return fader does not count as a new room', async () => {
        const w = await createWorld();
        const { window, ctx } = w;
        const unit = window.oaReverbUnit(1);
        const room = window.oaBuildImpulse(ctx, unit);
        unit.ret = (unit.ret || 0.4) / 2;
        assert.equal(window.oaBuildImpulse(ctx, unit), room, 'a level change redrew the room');
    });

    test('the ledger counts every class of thing that is resident', async () => {
        const w = await createWorld();
        const { window, ctx } = w;

        window.oaBuildImpulse(ctx, window.oaReverbUnit(0));
        const sample = ctx.createBuffer(2, 24000, 48000);
        window.oaSetDrumSample(0, sample, { name: 'X.wav' });

        const r = window.oaResidentReport();
        assert.equal(r.samples.count, 1, 'the loaded sample was not counted');
        assert.equal(r.samples.bytes, 2 * 24000 * 4);
        const rooms = r.caches.find((c) => c.name === 'rooms');
        assert.ok(rooms && rooms.entries > 0, 'the drawn room was not counted');
        assert.ok(r.totalBytes >= r.samples.bytes + rooms.bytes);
        assert.match(window.oaResidentLine(), /resident .*MB/);
    });

    test('a pad the app knows about but has no audio for is reported missing', async () => {
        const w = await createWorld();
        const { window, ctx } = w;
        window.oaSetDrumSample(0, ctx.createBuffer(1, 1000, 48000), { name: 'A.wav' });
        // An entry with no buffer is what a kit restored from meta looks like
        // before the audio arrives — the one case worth being able to see.
        window.OA_DRUM_SAMPLES[1] = { idx: 1, name: 'B.wav', buffer: null };
        assert.equal(window.oaResidentReport().samples.missing, 1);
    });
});
