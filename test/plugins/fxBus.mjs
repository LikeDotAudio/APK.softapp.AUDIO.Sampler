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
 * Header: plugins/fxBus.mjs
 * Purpose: The FX bus.
 * Description: One plugin's test pattern, loaded by ../plugins.test.mjs, whose
 *   header describes the pattern every plugin here follows. Not a *.test.mjs on
 *   its own: the case floor counts files, and this is one suite of that one file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld, createWorld } from '../harness.mjs';

// ---------------------------------------------------------------------------
// FX bus
// ---------------------------------------------------------------------------

describe('fx bus', () => {
    test('a channel with no sends and no pedal builds one node', async () => {
        const w = await createWorld();
        const { window } = w;

        // The master bus is the one thing a voice cannot opt out of — everything
        // audible sums into it — but it is built ONCE per context and shared by
        // every hit, so it is not part of what a hit costs. Build it here, the
        // way oaWarmFx() does on the first user gesture, so what follows
        // measures the voice on its own.
        window.oaMasterWarm(w.ctx);

        // Nothing sent, nothing driven, nothing compressed: the pan gain and
        // nothing else. Every promise of "transparent until asked" in this rack
        // comes down to this number.
        const before = w.ctx.createdCount();
        const out = window.oaVoiceOut(w.ctx, 0, 0);
        assert.equal(w.ctx.createdCount() - before, 1, 'a clean channel built more than the pan');
        assert.ok(out.__oaChain, 'the voice chain was not recorded for retirement');
    });

    test('a send below the epsilon builds no path', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        window.oaSetReverbSend(0, 5, window.OA_FX_SEND_EPSILON / 2);
        const before = w.ctx.createdCount();
        window.oaVoiceOut(w.ctx, 5, 0);
        const built = w.ctx.createdCount() - before;

        // The pan, and nothing else: a send this small is silence, and building
        // a gain node for it costs the same as building one that is heard.
        assert.equal(built, 1, `a send of ${window.OA_FX_SEND_EPSILON / 2} built ${built} nodes`);
    });

    test('record bypass takes the whole rack out of the path', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        // A channel that is doing everything at once: sent to a reverb, sent to
        // a tape, driven, and compressed.
        window.oaSetReverbSend(0, 4, 0.8);
        window.oaSetDelaySend(0, 4, 0.8);
        window.oaSetDrive(4, 'mix', 0.9);
        window.oaSetComp(4, 'on', true);
        window.oaCompWarm(w.ctx);

        const loud = w.ctx.createdCount();
        window.oaVoiceOut(w.ctx, 4, 0);
        const withFx = w.ctx.createdCount() - loud;
        assert.ok(withFx > 1, `a fully-loaded channel only built ${withFx} nodes`);

        // Armed: the same channel, same settings, is a pan gain and nothing else.
        window.oaSetFxBypass(true);
        const quiet = w.ctx.createdCount();
        window.oaVoiceOut(w.ctx, 4, 0);
        assert.equal(w.ctx.createdCount() - quiet, 1,
            'record bypass still built part of the rack');

        // And it comes back — a bypass that latched would be far worse than one
        // that never engaged, because the take after it would be silent of every
        // effect and nothing would say why.
        window.oaSetFxBypass(false);
        const again = w.ctx.createdCount();
        window.oaVoiceOut(w.ctx, 4, 0);
        assert.ok(w.ctx.createdCount() - again > 1, 'the rack did not come back');
    });

    test('the master compressor is routed around, not merely switched out', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        window.oaSetFxBypass(true);
        assert.equal(window.oaMasterBypassed(), true, 'the master was not told');
        // Out of the PATH: a worklet that is only switched out still costs a
        // render quantum, which is the whole reason this exists.
        assert.equal(w.ctx.__oaBuss.bypassed, true);

        window.oaSetFxBypass(false);
        assert.equal(window.oaMasterBypassed(), false);
        assert.equal(w.ctx.__oaBuss.bypassed, false);
    });

    test('a master bus built while already armed comes up routed around', async () => {
        // Arm record, THEN make the first sound of the session. That gesture
        // creates the context and the master bus with it, long after the flag
        // was set — so the bus has to read the flag as it is built rather than
        // wait to be told again. Every other module is optional and simply
        // never gets fed; this one is always in the path.
        const w = await createWorld();
        const { window } = w;

        window.oaSetFxBypass(true);
        assert.ok(!w.ctx.__oaBuss, 'this test needs a context with no master bus yet');

        window.oaMasterInput(w.ctx);
        assert.equal(
            w.ctx.__oaBuss.bypassed, true,
            'the master bus was built in circuit while record was armed',
        );

        window.oaSetFxBypass(false);
        assert.equal(w.ctx.__oaBuss.bypassed, false, 'it did not come back afterwards');
    });

    test('a pre-fader send still feeds its effect with the fader all the way down', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        // RV A is the left column: pre-fader. RV B is the right: post.
        assert.equal(window.oaSendIsPre('rv', 0), true, 'RV A is not pre-fader');
        assert.equal(window.oaSendIsPre('rv', 1), false, 'RV B is not post-fader');

        window.oaSetTrackFader([0]);            // channel 0 fully down
        window.oaSetReverbSend(0, 0, 0.8);      // pre-fader send, wide open

        const before = w.ctx.createdCount();
        const head = window.oaVoiceOut(w.ctx, 0, 0);
        assert.ok(w.ctx.createdCount() - before >= 2,
            'a pre-fader send built no path — the channel is silent AND sending nothing');

        // The send has to hang off something UPSTREAM of the fader. Walk out of
        // the head: the tap is a direct output of it, not of the fader.
        const outs = head.__out.map((e) => e.dest);
        const sends = outs.filter((n) => n.gain && Math.abs(n.gain.value - 0.8) < 1e-6);
        assert.equal(sends.length, 1, 'the pre-fader tap is not on the head node');

        // And the fader really is at zero, so the dry path is silent.
        const fader = outs.find((n) => n.gain && n.gain.value === 0);
        assert.ok(fader, 'the fader node is not at zero');
    });

    test('a post-fader send hangs off the fader, not in front of it', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        window.oaSetTrackFader([0.5]);
        window.oaSetReverbSend(0, 0, 0);        // nothing pre
        window.oaSetReverbSend(1, 0, 0.7);      // RV B — post-fader

        const head = window.oaVoiceOut(w.ctx, 0, 0);
        // With no pre-fader send open there is no extra node: the head IS the
        // fader, and the send comes off it.
        assert.equal(head.gain.value, 0.5, 'the head is not the fader');
        const sends = head.__out.map((e) => e.dest)
            .filter((n) => n.gain && Math.abs(n.gain.value - 0.7) < 1e-6);
        assert.equal(sends.length, 1, 'the post-fader tap is not downstream of the fader');
    });

    test('the fader is applied once, not twice', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        window.oaSetTrackFader([0.25]);
        const head = window.oaVoiceOut(w.ctx, 0, 0);
        // The caller passes velocity only; if it also multiplied the fader in,
        // this node would be the square of it.
        assert.equal(head.gain.value, 0.25);
    });

    test('the voice counter reports what is actually sounding', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const L = window.oaPluginLayout('voices');

        const buf = w.ctx.createBuffer(2, w.ctx.sampleRate, w.ctx.sampleRate);
        window.oaSetDrumSample(0, buf, { name: 'x.wav' });

        for (let i = 0; i < 5; i++) window.oaTriggerDrum(0, 1, w.ctx.currentTime);
        window.oaPumpPluginsOnce();
        assert.equal(window.oaPluginFrame('voices', 0)[L.VOICES], 5);

        w.ctx.advance(3);
        window.oaPumpPluginsOnce();
        assert.equal(window.oaPluginFrame('voices', 0)[L.VOICES], 0, 'voices are still counted after they ended');
    });
});
