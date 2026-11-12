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
 * Header: plugins/chorus.mjs
 * Purpose: The chorus.
 * Description: One plugin's test pattern, loaded by ../plugins.test.mjs, whose
 *   header describes the pattern every plugin here follows. Not a *.test.mjs on
 *   its own: the case floor counts files, and this is one suite of that one file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from '../harness.mjs';

// ---------------------------------------------------------------------------
// Chorus
// ---------------------------------------------------------------------------

describe('chorus', () => {
    test('OFF is a wire — no wet signal at all', async () => {
        const w = await createWarmWorld();
        const node = w.window.oaChorusNode(w.ctx, 0);
        assert.equal(w.window.oaChorusMode(0).mix, 0, 'mode OFF has a non-zero wet mix');
        assert.equal(w.window.oaChorusMode(0).depth, 0, 'mode OFF still sweeps');
        node.dispose();
    });

    test('the two sides are swept in opposite directions', async () => {
        const w = await createWarmWorld();
        // This is the whole design: in phase it is a chorus, out of phase it is
        // a width box that vanishes in mono. If the polarity is ever made to
        // match, the effect stops being the effect.
        for (let m = 1; m < w.window.OA_CHORUS_COUNT; m++) {
            const spec = w.window.oaChorusMode(m);
            assert.ok(spec.depth > 0, `mode ${m} has no sweep`);
            assert.ok(spec.mix > 0, `mode ${m} has no wet signal`);
        }
    });

    test('its sweep oscillator is released on dispose', async () => {
        const w = await createWarmWorld();
        const before = w.ctx.danglingSources().length;
        const node = w.window.oaChorusNode(w.ctx, 3);
        assert.equal(w.ctx.danglingSources().length, before + 1, 'the LFO did not start');
        node.dispose();
        assert.equal(
            w.ctx.danglingSources().length, before,
            'the sweep oscillator is still running after dispose',
        );
    });

    test('every mode is reachable through the plugin interface', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const L = window.oaPluginLayout('chorus');

        for (let m = 0; m < window.OA_CHORUS_COUNT; m++) {
            window.oaPluginSet('chorus', 0, 'chorus', m);
            window.oaPumpPluginsOnce();
            const frame = window.oaPluginFrame('chorus', 0);
            assert.equal(frame[L.MODE], m, `mode ${m} did not land`);
            assert.equal(frame[window.OA_SLOT.ACTIVE], m > 0 ? 1 : 0);
        }
    });
});
