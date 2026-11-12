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
 * Header: plugins/drive.mjs
 * Purpose: The drive pedal.
 * Description: One plugin's test pattern, loaded by ../plugins.test.mjs, whose
 *   header describes the pattern every plugin here follows. Not a *.test.mjs on
 *   its own: the case floor counts files, and this is one suite of that one file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from '../harness.mjs';
import { peak } from './helpers.mjs';

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

describe('drive', () => {
    test('at mix 0 it builds nothing at all', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        window.oaPluginSet('drive', 0, 'mix', 0);

        const before = w.ctx.createdCount();
        const node = window.oaDriveNode(w.ctx, 0, w.ctx.destination, []);
        assert.equal(node, null, 'a clean channel built a pedal');
        assert.equal(w.ctx.createdCount(), before, 'a clean channel built nodes anyway');
    });

    test('the curve is normalised and passes through zero', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        for (const mode of window.OA_DRIVE_MODES) {
            for (const drive of [1, 8, 40]) {
                for (const rect of [0, 0.5, 1]) {
                    window.oaPluginSet('drive', 0, 'mode', mode.key);
                    window.oaPluginSet('drive', 0, 'drive', drive);
                    window.oaPluginSet('drive', 0, 'rect', rect);
                    const c = window.oaPluginCurve('drive', 0);

                    const where = `${mode.key} drive=${drive} rect=${rect}`;
                    assert.ok(Math.abs(Math.max(...c) - 1) < 1e-4 || Math.abs(Math.min(...c) + 1) < 1e-4,
                        `${where}: curve is not peak-normalised`);
                    c.forEach((v, i) => assert.ok(Number.isFinite(v), `${where}: point ${i} is ${v}`));

                    // Zero in, zero out. A curve with an offset at the origin
                    // parks the speaker cone off centre and thumps the moment
                    // the wet path is faded in.
                    const centre = c[(c.length / 2) | 0];
                    assert.ok(Math.abs(centre) < 0.02, `${where}: the curve is offset by ${centre} at zero`);
                }
            }
        }
    });

    test('starve carves a dead zone without leaving a step', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        window.oaPluginSet('drive', 0, 'mode', 'fuzz');
        window.oaPluginSet('drive', 0, 'drive', 1);
        window.oaPluginSet('drive', 0, 'starve', 1);
        window.oaPluginSet('drive', 0, 'rect', 0);

        const c = window.oaPluginCurve('drive', 0);
        // Neighbouring points must not jump: a step in the transfer function is
        // an edge, and an edge is a click on every zero crossing.
        let worst = 0;
        for (let i = 1; i < c.length; i++) worst = Math.max(worst, Math.abs(c[i] - c[i - 1]));
        assert.ok(worst < 0.1, `the curve steps by ${worst.toFixed(3)} between adjacent points`);
    });

    test('every preset stays inside every declared range', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        Object.keys(window.OA_DRIVE_PRESETS).forEach((name) => {
            window.oaPluginPreset('drive', 0, name);
            const u = window.oaPluginState('drive', 0);
            window.OA_DRIVE_PARAMS.forEach((p) => {
                assert.ok(
                    u[p.key] >= p.min && u[p.key] <= p.max,
                    `preset "${name}" sets ${p.key} to ${u[p.key]}, outside ${p.min}..${p.max}`,
                );
            });
        });
    });
});
