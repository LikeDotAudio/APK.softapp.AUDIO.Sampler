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
 * Header: plugins/tapeDelay.mjs
 * Purpose: The tape delay.
 * Description: One plugin's test pattern, loaded by ../plugins.test.mjs, whose
 *   header describes the pattern every plugin here follows. Not a *.test.mjs on
 *   its own: the case floor counts files, and this is one suite of that one file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from '../harness.mjs';

// ---------------------------------------------------------------------------
// Tape delay
// ---------------------------------------------------------------------------

describe('tape delay', () => {
    test('its worklet registers and the panel gets its parameters', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-tape-echo');
        assert.ok(Processor, 'the tape processor never registered');
        const declared = Processor.parameterDescriptors.map((d) => d.name);
        w.window.OA_DELAY_PARAMS.forEach((p) => {
            assert.ok(declared.includes(p.key), `the panel has "${p.key}" and the worklet does not`);
        });
    });

    test('a head can never be asked for more delay than the line can hold', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const spec = window.OA_DELAY_PARAMS.find((p) => p.key === 'timeL');

        // The native fallback builds createDelay(2.5). A head time past that is
        // silently pinned by the browser, so the panel and the sound part ways.
        window.oaSetDelay(0, 'timeL', 99);
        assert.ok(window.oaDelayUnit(0).timeL <= spec.max, 'head time was not clamped');
        assert.ok(spec.max <= 2.5, 'the panel now allows a longer head than the delay line');
    });

    test('feedback cannot be set to a runaway', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const spec = window.OA_DELAY_PARAMS.find((p) => p.key === 'feedback');

        window.oaSetDelay(0, 'feedback', 50);
        assert.equal(window.oaDelayUnit(0).feedback, spec.max);

        // The Runaway preset deliberately goes just over 1 — that is the effect.
        // What must not happen is a value with no ceiling at all.
        assert.ok(spec.max <= 1.2, `feedback can reach ${spec.max}, which never decays`);
    });

    test('every preset lands inside every declared range', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        Object.keys(window.OA_DELAY_PRESETS).forEach((name) => {
            window.oaApplyDelayPreset(0, name);
            const unit = window.oaDelayUnit(0);
            window.OA_DELAY_PARAMS.forEach((p) => {
                assert.ok(
                    unit[p.key] >= p.min && unit[p.key] <= p.max,
                    `preset "${name}" sets ${p.key} to ${unit[p.key]}, outside ${p.min}..${p.max}`,
                );
            });
        });
    });

    test('a delay feeding a reverb builds that reverb', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        window.oaSetDelaySend(1, 0, 0.5);
        window.oaDelayInput(w.ctx, 1);
        window.oaDelayToReverb(w.ctx, 1, 1, 0.4);

        assert.ok(w.ctx.__oaReverbs[1], 'the reverb a delay feeds was never built');
    });
});
