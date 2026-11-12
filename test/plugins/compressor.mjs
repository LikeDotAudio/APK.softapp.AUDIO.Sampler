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
 * Header: plugins/compressor.mjs
 * Purpose: The channel compressor (limiter): its worklet, bypass and the shipping DSP.
 * Description: One plugin's test pattern, loaded by ../plugins.test.mjs, whose
 *   header describes the pattern every plugin here follows. Not a *.test.mjs on
 *   its own: the case floor counts files, and this is one suite of that one file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld, createWorld } from '../harness.mjs';
import { peak } from './helpers.mjs';

// ---------------------------------------------------------------------------
// Compressor
// ---------------------------------------------------------------------------

/** Run the shipping limiter over a block and hand back what came out. */
const runLimiter = (Processor, params, input, blocks = 1) => {
    const proc = new Processor();
    const n = input.length;
    let out = null;
    const p = {};
    Object.keys(params).forEach((k) => { p[k] = [params[k]]; });
    for (let b = 0; b < blocks; b++) {
        const outL = new Float32Array(n);
        const outR = new Float32Array(n);
        proc.process([[input, input]], [[outL, outR]], p);
        out = outL;
    }
    return { out, proc };
};

describe('compressor', () => {
    test('its worklet registers and the panel gets its parameters', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-limiter');
        assert.ok(Processor, 'the limiter processor never registered');

        const declared = Processor.parameterDescriptors.map((d) => d.name).sort();
        assert.deepEqual(
            declared,
            ['attack', 'inGain', 'knee', 'mix', 'outGain', 'ratio', 'release', 'thresh'],
            'the worklet and the panel disagree about which parameters exist',
        );
    });

    test('blend at zero is a wire, sample for sample', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-limiter');

        const input = new Float32Array(128);
        for (let i = 0; i < 128; i++) input[i] = Math.sin(i / 8) * 0.9;

        const { out } = runLimiter(Processor, {
            inGain: 8, outGain: 4, attack: 0.0002, release: 0.25,
            ratio: 20, thresh: -36, knee: 3, mix: 0,
        }, input);

        // Driven hard with every setting extreme — and still bit for bit the
        // input, because blend is zero. "Almost the input" is a bug.
        for (let i = 0; i < 128; i++) {
            assert.equal(out[i], input[i], `sample ${i} changed at blend 0`);
        }
    });

    test('a signal over the threshold comes out quieter than one under it', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-limiter');

        const params = {
            inGain: 1, outGain: 1, attack: 0.00002, release: 0.05,
            ratio: 20, thresh: -24, knee: 3, mix: 1,
        };

        const quiet = new Float32Array(128).fill(0.02);   // about -34dB, under
        const loud = new Float32Array(128).fill(0.5);     // about -6dB, well over

        // Enough blocks for the attack to settle at this ratio.
        const q = runLimiter(Processor, params, quiet, 40);
        const l = runLimiter(Processor, params, loud, 40);

        const quietGain = peak(q.out) / 0.02;
        const loudGain = peak(l.out) / 0.5;

        assert.ok(quietGain > 0.98, `a signal under the threshold was turned down (gain ${quietGain.toFixed(3)})`);
        assert.ok(loudGain < 0.5, `a signal well over the threshold was barely touched (gain ${loudGain.toFixed(3)})`);
        assert.ok(q.proc.gr < 0.1, 'gain reduction reported below the threshold');
        assert.ok(l.proc.gr > 6, `only ${l.proc.gr.toFixed(1)}dB of reduction at 20:1, 18dB over`);
    });

    test('the output cannot run away, however hard it is driven', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-limiter');

        const input = new Float32Array(128).fill(0.95);
        const { out } = runLimiter(Processor, {
            inGain: 64, outGain: 32, attack: 0.01, release: 2,
            ratio: 1, thresh: 0, knee: 0, mix: 1,
        }, input, 20);

        // Ratio 1 and a 0dB threshold means no compression at all, and 64x
        // input into 32x makeup. The saturator is the only thing between that
        // and a number the output stage cannot pass.
        assert.ok(peak(out) <= 1.0001, `output reached ${peak(out)}`);
        out.forEach((v, i) => assert.ok(Number.isFinite(v), `sample ${i} is ${v}`));
    });

    test('silence in, silence out, and the meter parks', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-limiter');
        const { out, proc } = runLimiter(Processor, {
            inGain: 8, outGain: 8, attack: 0.0002, release: 0.25,
            ratio: 12, thresh: -24, knee: 5, mix: 1,
        }, new Float32Array(128), 10);

        assert.equal(peak(out), 0, 'silence came out non-silent');
        assert.equal(proc.gr, 0, 'the meter is holding reduction over silence');
    });

    test('every ratio button and both time knobs at both ends stay legal', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        for (const r of window.OA_COMP_RATIOS) {
            for (const attack of [0, 1]) {
                for (const release of [0, 1]) {
                    window.oaPluginSet('comp', 0, 'ratio', r.key);
                    window.oaPluginSet('comp', 0, 'attack', attack);
                    window.oaPluginSet('comp', 0, 'release', release);
                    window.oaPluginSet('comp', 0, 'input', 36);
                    window.oaPluginSet('comp', 0, 'output', 24);
                    window.oaPluginSet('comp', 0, 'on', true);

                    const t = window.oaCompAttackTime(attack) * r.lag;
                    const rel = window.oaCompReleaseTime(release);
                    assert.ok(t > 0 && isFinite(t), `${r.key}: attack ${t}`);
                    assert.ok(rel > 0 && isFinite(rel), `${r.key}: release ${rel}`);

                    // The worklet declares hard bounds; a value outside them is
                    // silently pinned by the browser, so the panel would be
                    // lying about what the box is doing.
                    const Processor = w.processors.get('oa-limiter');
                    const spec = Processor.parameterDescriptors.find((d) => d.name === 'attack');
                    assert.ok(
                        t >= spec.minValue && t <= spec.maxValue,
                        `${r.key} at attack ${attack} gives ${t}s, outside the worklet's ${spec.minValue}..${spec.maxValue}`,
                    );
                }
            }
        }
    });

    test('a channel that was never switched on builds nothing', async () => {
        const w = await createWorld();
        const { window } = w;
        // A fresh world, nothing warmed: an untouched channel must not put a
        // single node in the graph.
        const before = w.ctx.createdCount();
        assert.equal(window.oaCompInput(w.ctx, 3), null, 'a clean channel built a strip');
        assert.equal(w.ctx.createdCount(), before, 'a clean channel built nodes anyway');
    });
});
