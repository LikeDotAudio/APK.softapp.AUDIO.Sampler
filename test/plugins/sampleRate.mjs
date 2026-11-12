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
 * Header: plugins/sampleRate.mjs
 * Purpose: Deprecated controls, and the one shared sample rate.
 * Description: One plugin's test pattern, loaded by ../plugins.test.mjs, whose
 *   header describes the pattern every plugin here follows. Not a *.test.mjs on
 *   its own: the case floor counts files, and this is one suite of that one file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from '../harness.mjs';

// ---------------------------------------------------------------------------
// The shared sample rate
//
// Every module here converts seconds to samples: the reverb's decay
// multipliers, the tape's buffer length, the compressor's coefficients, the
// synth's bounced previews. They have to be counting against ONE clock, or a
// preview drawn at 44.1k sits beside a tail computed at 48k and the picture
// stops describing the sound. oaAudioRate.js owns the number; these check that
// asking for it and building with it both land on the same one.
// ---------------------------------------------------------------------------

describe('deprecated controls', () => {
    test('the buss MIX no longer reaches the DSP', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const Processor = w.processors.get('oa-buss-comp');
        assert.ok(Processor, 'the buss processor never registered');

        // A setting that carries a blend — the old New York preset shape.
        window.oaSetBuss('on', true);
        window.oaSetBuss('mix', 0.5);
        window.oaSetBuss('parallel', true);

        // Whatever the field says, the unit is fully wet: an uncompressed copy
        // of the whole record summed back over itself is a comb filter, not a
        // parallel bus, because the wet path carries the compressor's own delay.
        const bus = w.ctx.__oaBuss;
        const wet = bus.engine.input.parameters.get('wet');
        const dry = bus.engine.input.parameters.get('dry');
        assert.equal(wet.value, 1, 'MIX still reaches the wet leg');
        assert.equal(dry.value, 0, 'MIX still reaches the dry leg');

        // …and switching the whole unit out is still a wire.
        window.oaSetBuss('on', false);
        assert.equal(bus.engine.input.parameters.get('wet').value, 0);
        assert.equal(bus.engine.input.parameters.get('dry').value, 1);
    });

    test('a saved setting carrying a blend still loads', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        // The field is kept precisely so this does not throw or drop the rest.
        window.oaLoadPlugins({ buss: { on: true, mix: 0.35, parallel: true, thresh: -6 } }, {});
        assert.equal(window.oaBussUnit().thresh, -6, 'the rest of the setting was lost');
    });
});

describe('sample rate', () => {
    test('one number answers for every context, and a context always wins', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        assert.ok(window.OA_SAMPLE_RATE > 0, 'the app has no sample rate');
        assert.equal(
            window.oaSampleRate(null), window.OA_SAMPLE_RATE,
            'with no context, the answer is not the app rate',
        );
        assert.equal(
            window.oaSampleRate(w.ctx), w.ctx.sampleRate,
            'a live context did not win over the constant',
        );
    });

    test('an offline context is built at the app rate, sized in seconds', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const rate = window.oaSampleRate();

        const off = window.oaOfflineContext(1, 0.5);
        assert.ok(off, 'no offline context was built');
        assert.equal(off.sampleRate, rate, 'the offline render is at a different rate than the mix');
        assert.equal(off.length, Math.ceil(0.5 * rate), 'seconds were converted against another clock');
    });

    test('what the modules build lands on that rate too', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const rate = window.oaSampleRate(w.ctx);

        // The reverb: an impulse response is seconds of tail turned into frames.
        const ir = window.oaBuildImpulse(w.ctx, window.oaReverbUnit(0));
        assert.equal(ir.sampleRate, rate, 'the room was drawn against another clock');

        // The drum synth: one shared noise buffer, keyed on the rate.
        const noise = window.oaNoiseBuffer(w.ctx);
        assert.equal(noise.sampleRate, rate, 'the noise buffer was built for another rate');
        assert.equal(
            window.oaNoiseBuffer(w.ctx), noise,
            'the noise buffer was rebuilt — the rate key is not matching itself',
        );
    });
});
