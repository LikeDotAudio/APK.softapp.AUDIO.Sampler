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
 * Header: plugins/reverb.mjs
 * Purpose: The reverb.
 * Description: One plugin's test pattern, loaded by ../plugins.test.mjs, whose
 *   header describes the pattern every plugin here follows. Not a *.test.mjs on
 *   its own: the case floor counts files, and this is one suite of that one file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from '../harness.mjs';

// ---------------------------------------------------------------------------
// Reverb
// ---------------------------------------------------------------------------

describe('reverb', () => {
    test('every stored program builds a finite, decaying room', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        window.OA_REVERB_BANKS.forEach((bank, b) => {
            bank.programs.forEach((prog, p) => {
                const buf = window.oaBuildImpulse(w.ctx, Object.assign(
                    {}, window.oaReverbUnit(0), prog.p,
                ));
                assert.ok(buf.length > 0, `${bank.name}/${prog.name}: empty impulse`);

                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i += 97) {
                    assert.ok(Number.isFinite(d[i]), `${bank.name}/${prog.name}: sample ${i} is ${d[i]}`);
                }

                // A tail that is louder at the end than in the middle is not a
                // room, it is a feedback loop that got away.
                const mid = Math.floor(d.length / 2);
                let midPeak = 0;
                let endPeak = 0;
                for (let i = mid; i < mid + 2000 && i < d.length; i++) midPeak = Math.max(midPeak, Math.abs(d[i]));
                for (let i = d.length - 2000; i < d.length; i++) endPeak = Math.max(endPeak, Math.abs(d[i]));
                assert.ok(endPeak <= midPeak + 1e-6, `${bank.name}/${prog.name}: the tail grows`);
            });
        });
    });

    test('both extremes of every slider still build', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        for (const p of window.OA_REVERB_PARAMS) {
            for (const v of [p.min, p.max]) {
                window.oaSetReverb(0, p.key, v);
                assert.doesNotThrow(
                    () => window.oaBuildImpulse(w.ctx, window.oaReverbUnit(0)),
                    `${p.key} at ${v} threw while building the room`,
                );
            }
        }
    });

    test('standby and mute both silence the return, and neither cancels the other', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const L = window.oaPluginLayout('reverb');

        window.oaSetReverbSend(0, 0, 0.5);
        window.oaReverbInput(w.ctx, 0);
        window.oaSetReverb(0, 'ret', 0.8);

        window.oaPumpPluginsOnce();
        assert.ok(window.oaPluginFrame('reverb', 0)[L.RETURN] > 0, 'the return is already silent');

        window.oaMuteReverb(0, true);
        window.oaPumpPluginsOnce();
        assert.equal(window.oaPluginFrame('reverb', 0)[L.RETURN], 0, 'mute did not silence the return');

        // Standby ON while muted, then mute OFF: the machine is still in
        // standby, so it must stay quiet.
        window.oaSetReverbStandby(0, true);
        window.oaMuteReverb(0, false);
        window.oaPumpPluginsOnce();
        assert.equal(
            window.oaPluginFrame('reverb', 0)[L.RETURN], 0,
            'releasing mute brought a machine out of standby',
        );
        assert.equal(window.oaPluginFrame('reverb', 0)[L.SILENT], 1);
    });

    test('the curve it publishes is the impulse it is running', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        window.oaSetReverbSend(0, 0, 0.5);
        window.oaReverbInput(w.ctx, 0);

        const curve = window.oaPluginCurve('reverb', 0);
        assert.ok(curve instanceof Float32Array, 'the reverb published no curve');
        assert.equal(curve.length, 256);
        curve.forEach((v, i) => {
            assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `point ${i} is ${v}`);
        });
        // Normalised, so something has to touch the top.
        assert.ok(Math.max(...curve) > 0.99, 'the curve is not normalised');
    });
});
