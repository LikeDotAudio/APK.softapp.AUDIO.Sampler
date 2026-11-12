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
 * Header: plugins/bussComp.mjs
 * Purpose: The buss compressor on the master bus.
 * Description: One plugin's test pattern, loaded by ../plugins.test.mjs, whose
 *   header describes the pattern every plugin here follows. Not a *.test.mjs on
 *   its own: the case floor counts files, and this is one suite of that one file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from '../harness.mjs';
import { peak } from './helpers.mjs';

// ---------------------------------------------------------------------------
// Buss compressor — the master bus
// ---------------------------------------------------------------------------

/**
 * Run the shipping buss compressor over a block and hand back what came out.
 *
 * Unlike the limiter's helper this fills every parameter from the worklet's own
 * descriptors first, then overrides what the test names. The processor reads
 * fifteen params on every block, and a test that forgot one would be exercising
 * `undefined[0]` rather than the DSP.
 */
const runBuss = (Processor, overrides, input, blocks = 1, inputR = null) => {
    const proc = new Processor();
    const p = {};
    Processor.parameterDescriptors.forEach((d) => { p[d.name] = [d.defaultValue]; });
    Object.keys(overrides).forEach((k) => { p[k] = [overrides[k]]; });

    const n = input.length;
    let out = null;
    let outR = null;
    for (let b = 0; b < blocks; b++) {
        const oL = new Float32Array(n);
        const oR = new Float32Array(n);
        proc.process([[input, inputR || input]], [[oL, oR]], p);
        out = oL;
        outR = oR;
    }
    return { out, outR, proc };
};

/** A tone at `hz`, `n` samples long, so the side-chain filter has something to bite on. */
const tone = (hz, n, amp = 0.5, rate = 48000) => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.sin(2 * Math.PI * hz * i / rate) * amp;
    return a;
};

/**
 * Walk a long signal through the processor in 128-sample blocks, the way a
 * browser would, and hand back the whole output.
 *
 * The block-at-a-time helper above re-feeds ONE array, which is exactly right
 * for a steady level and quietly wrong for a tone: the phase snaps back to zero
 * every 128 samples, so what reaches the detector is a 375 Hz sawtooth wearing a
 * sine's amplitude. That edge is precisely the high-frequency content a
 * side-chain filter test is trying to prove is NOT there.
 */
const streamBuss = (Processor, overrides, signal) => {
    const proc = new Processor();
    const p = {};
    Processor.parameterDescriptors.forEach((d) => { p[d.name] = [d.defaultValue]; });
    Object.keys(overrides).forEach((k) => { p[k] = [overrides[k]]; });

    const out = new Float32Array(signal.length);
    for (let i = 0; i + 128 <= signal.length; i += 128) {
        const chunk = signal.subarray(i, i + 128);
        const oL = new Float32Array(128);
        const oR = new Float32Array(128);
        proc.process([[chunk, chunk]], [[oL, oR]], p);
        out.set(oL, i);
    }
    return { proc, out };
};

/** Mean of the last `n` samples — a DC reading, so it has to span whole cycles. */
const meanTail = (a, n) => {
    let sum = 0;
    for (let i = a.length - n; i < a.length; i++) sum += a[i];
    return sum / n;
};

describe('buss compressor', () => {
    test('its worklet registers and the panel gets its parameters', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-buss-comp');
        assert.ok(Processor, 'the buss compressor processor never registered');

        const declared = Processor.parameterDescriptors.map((d) => d.name).sort();
        assert.deepEqual(
            declared,
            ['attack', 'dist', 'dry', 'fb', 'fourK', 'hpf', 'lowThd', 'makeup',
             'ratio', 'relMode', 'release', 'scSum', 'thresh', 'trim', 'wet'],
            'the worklet and the panel disagree about which parameters exist',
        );
    });

    test('out of circuit is a wire, sample for sample', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-buss-comp');

        const input = tone(220, 128, 0.9);
        // Every setting extreme, and still bit for bit the input, because the
        // unit is out. The whole mix goes through this node — "almost the
        // input" would be a permanent, unfixable veil over the record.
        const { out } = runBuss(Processor, {
            trim: 1, wet: 0, dry: 1, thresh: -40, ratio: 20,
            attack: 0.0001, release: 0.05, makeup: 8, fourK: 1, dist: 9,
        }, input, 4);

        for (let i = 0; i < 128; i++) {
            assert.equal(out[i], input[i], `sample ${i} changed with the unit out of circuit`);
        }
    });

    test('a signal over the threshold comes out quieter than one under it', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-buss-comp');

        const params = {
            trim: 1, wet: 1, dry: 0, thresh: -24, ratio: 20,
            attack: 0.0001, release: 0.05, makeup: 1,
        };

        const quiet = new Float32Array(128).fill(0.02);   // about -34dB, under
        const loud = new Float32Array(128).fill(0.5);     // about -6dB, well over

        const q = runBuss(Processor, params, quiet, 40);
        const l = runBuss(Processor, params, loud, 40);

        assert.ok(peak(q.out) / 0.02 > 0.98, 'a signal under the threshold was turned down');
        assert.ok(peak(l.out) / 0.5 < 0.5, 'a signal well over the threshold was barely touched');
        assert.ok(q.proc.gr < 0.1, 'gain reduction reported below the threshold');
        assert.ok(l.proc.gr > 6, `only ${l.proc.gr.toFixed(1)}dB of reduction at 20:1, 18dB over`);
    });

    test('a negative ratio makes a louder input come out QUIETER', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-buss-comp');

        // This is the whole definition of a negative ratio and the one thing
        // about it that cannot be got from a normal compressor: past the
        // threshold the transfer curve turns over and heads back down.
        const params = {
            trim: 1, wet: 1, dry: 0, thresh: -24, ratio: -0.5,
            attack: 0.0001, release: 0.05, makeup: 1,
        };

        const softer = runBuss(Processor, params, new Float32Array(128).fill(0.15), 60);
        const louder = runBuss(Processor, params, new Float32Array(128).fill(0.6), 60);

        assert.ok(
            peak(louder.out) < peak(softer.out),
            `4x the input gave ${peak(louder.out).toFixed(5)} out against ${peak(softer.out).toFixed(5)} — the ratio is not running backwards`,
        );
        louder.out.forEach((v, i) => assert.ok(Number.isFinite(v), `sample ${i} is ${v}`));
    });

    test('the side-chain filter deafens the detector to the bottom end', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-buss-comp');

        const params = {
            trim: 1, wet: 1, dry: 0, thresh: -24, ratio: 10,
            attack: 0.0005, release: 0.1, makeup: 1, hpf: 200,
        };

        // Half a second of each, streamed continuously — a phase-continuous tone
        // is the only kind this question can be asked of.
        const low = streamBuss(Processor, params, tone(50, 24000, 0.5));
        const high = streamBuss(Processor, params, tone(2000, 24000, 0.5));

        // Same level, two octaves apart either side of the filter: the record
        // must not duck every time the kick lands.
        assert.ok(high.proc.gr > 4, `the detector barely heard 2kHz (${high.proc.gr.toFixed(2)}dB)`);
        assert.ok(
            low.proc.gr < high.proc.gr / 3,
            `50Hz pulled ${low.proc.gr.toFixed(2)}dB against 2kHz's ${high.proc.gr.toFixed(2)}dB — the filter is not in the side chain`,
        );
    });

    test('AUTO releases a transient fast and a sustained passage slowly', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-buss-comp');

        const params = {
            trim: 1, wet: 1, dry: 0, thresh: -30, ratio: 10,
            attack: 0.0005, relMode: 1, makeup: 1,
        };
        const rate = 48000;
        const loud = (n) => new Float32Array(n).fill(0.5);

        // Two signals, identical except for how long the loud part lasts, each
        // followed by the same second of silence. What is being measured is what
        // the compressor is still doing at the END of that silence.
        const held = new Float32Array(rate * 2);
        held.set(loud(rate), 0);                     // one second of material
        const hit = new Float32Array(rate * 2);
        hit.set(loud(256), 0);                       // one five-millisecond stab

        const a = streamBuss(Processor, params, held);
        const b = streamBuss(Processor, params, hit);

        // The fast stage is long gone in both after a second — a 100ms constant
        // is ten time constants deep by then. Everything left is the long stage.
        const applied = (p) => Math.max(p.gr, p.grSlow);

        assert.ok(
            applied(b.proc) < 0.3,
            `a stab was still pulling ${applied(b.proc).toFixed(3)}dB a second later — AUTO would duck the mix after every hit`,
        );
        assert.ok(
            applied(a.proc) > 1,
            `a second of loud material let go completely within a second (${applied(a.proc).toFixed(3)}dB left) — the long stage is not charging`,
        );
        assert.ok(
            applied(a.proc) > applied(b.proc) * 5,
            `sustained ${applied(a.proc).toFixed(3)}dB against a transient's ${applied(b.proc).toFixed(3)}dB — the two stages are not behaving differently`,
        );
    });

    test('feed-back mode compresses less hard than feed-forward', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-buss-comp');

        const params = {
            trim: 1, wet: 1, dry: 0, thresh: -30, ratio: 20,
            attack: 0.0005, release: 0.1, makeup: 1,
        };
        const loud = new Float32Array(128).fill(0.5);

        const ff = runBuss(Processor, Object.assign({}, params, { fb: 0 }), loud, 120);
        const fb = runBuss(Processor, Object.assign({}, params, { fb: 1 }), loud, 120);

        // The detector is reading a signal that is already being turned down, so
        // it stops asking for more. That settling point is the "relaxed"
        // character, and it lands at roughly half the reduction.
        assert.ok(
            fb.proc.gr < ff.proc.gr,
            `F/B pulled ${fb.proc.gr.toFixed(1)}dB against feed-forward's ${ff.proc.gr.toFixed(1)}dB`,
        );
        assert.ok(fb.proc.gr > 1, 'F/B stopped compressing altogether');
    });

    test('44K mode colours the signal without a runaway or an offset', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-buss-comp');

        const params = {
            trim: 1, wet: 1, dry: 0, thresh: -12, ratio: 4,
            attack: 0.003, release: 0.3, makeup: 1,
        };
        const input = tone(120, 24000, 0.8);          // half a second, 60 cycles

        const clean = streamBuss(Processor, Object.assign({}, params, { fourK: 0 }), input);
        const dirty = streamBuss(Processor, Object.assign({}, params, { fourK: 1, dist: 9 }), input);

        let changed = false;
        for (let i = 0; i < input.length; i++) {
            if (Math.abs(clean.out[i] - dirty.out[i]) > 1e-4) { changed = true; break; }
        }
        assert.ok(changed, '44K mode at full distortion changed nothing');

        assert.ok(peak(dirty.out) <= 1.0001, `44K mode reached ${peak(dirty.out)}`);
        dirty.out.forEach((v, i) => assert.ok(Number.isFinite(v), `sample ${i} is ${v}`));

        // The asymmetric shaper is what makes the even harmonics, and an
        // asymmetric shaper generates DC along with them. Unblocked, that offset
        // eats the headroom of every record played through the master bus.
        //
        // Averaged over whole cycles, or it is not a DC reading: 120Hz at 48k is
        // 400 samples a cycle, so the last 8000 are exactly twenty of them.
        assert.ok(
            Math.abs(meanTail(dirty.out, 8000)) < 0.005,
            `44K mode left a DC offset of ${meanTail(dirty.out, 8000).toFixed(5)}`,
        );
    });

    test('silence in, silence out, and the meter parks', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-buss-comp');
        const { out, proc } = runBuss(Processor, {
            trim: 1, wet: 1, dry: 0, thresh: -40, ratio: 10, makeup: 4,
        }, new Float32Array(128), 20);

        assert.equal(peak(out), 0, 'silence came out non-silent');
        assert.ok(proc.gr < 1e-3, 'the meter is holding reduction over silence');
    });

    test('every stepped position lands inside the worklet\'s declared bounds', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const Processor = w.processors.get('oa-buss-comp');
        const spec = (name) => Processor.parameterDescriptors.find((d) => d.name === name);

        // A value outside a declared bound is silently pinned by the browser, so
        // the panel would be lying about what the box is doing.
        window.OA_BUSS_ATTACKS.forEach((ms, i) => {
            const t = window.oaBussAttackTime(i);
            assert.ok(t >= spec('attack').minValue && t <= spec('attack').maxValue,
                `attack position ${i} (${ms}ms) is outside the worklet's range`);
        });
        window.OA_BUSS_RELEASES.forEach((r, i) => {
            const v = window.oaBussRelease(i);
            assert.ok(v.sec >= spec('release').minValue && v.sec <= spec('release').maxValue,
                `release position ${i} (${r.label}) is outside the worklet's range`);
            assert.ok(v.auto >= 0 && v.auto <= 2, `release position ${i} has auto mode ${v.auto}`);
        });
        window.OA_BUSS_RATIOS.forEach((ratio, i) => {
            const v = window.oaBussRatio(i);
            assert.equal(v, ratio, `ratio position ${i} did not resolve to ${ratio}`);
            assert.ok(v >= spec('ratio').minValue && v <= spec('ratio').maxValue,
                `ratio position ${i} (${ratio}) is outside the worklet's range`);
            // Zero is the one value the gain computer cannot take: 1 - 1/0.
            assert.ok(Math.abs(v) > 0.01, `ratio position ${i} is effectively zero`);
        });
    });

    test('every preset drives the graph without throwing', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        for (const name of Object.keys(window.OA_BUSS_PRESETS)) {
            assert.doesNotThrow(() => window.oaPluginPreset('buss', 0, name), `preset ${name}`);
            const u = window.oaPluginState('buss', 0);
            window.oaPluginParams('buss', 0).forEach((p) => {
                assert.ok(u[p.key] >= p.min && u[p.key] <= p.max,
                    `preset ${name} left ${p.key} at ${u[p.key]}, outside ${p.min}..${p.max}`);
            });
        }
    });

    test('the master bus is one node, and everything reaches it', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        const port = window.oaMasterInput(w.ctx);
        assert.ok(port, 'there is no master bus to sum into');
        assert.equal(window.oaMasterInput(w.ctx), port, 'a second ask built a second master bus');
        assert.equal(window.oaMasterBusCount(w.ctx), 1);

        // Asking again must not put another node in the graph — the master is
        // built once and shared, and every voice asks for it.
        const before = w.ctx.createdCount();
        window.oaMasterInput(w.ctx);
        assert.equal(w.ctx.createdCount(), before, 'asking for the master bus built nodes');

        window.oaDisposePlugins(w.ctx);
        assert.equal(w.ctx.__oaBuss, null, 'the master bus survived dispose');
    });

    test('the fade walks the master to silence and back', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        window.oaPluginSet('buss', 0, 'rate', 2);
        assert.equal(window.oaBussFade(), 1, 'the master started attenuated');

        window.oaPluginSet('buss', 0, 'fade', true);
        w.ctx.advance(1);
        const half = window.oaBussFade();
        assert.ok(half > 0.3 && half < 0.7, `a second into a 2s fade the master is at ${half.toFixed(3)}`);

        w.ctx.advance(1.5);
        assert.equal(window.oaBussFade(), 0, 'the fade did not reach silence');

        // …and back up. Timed by DISTANCE REMAINING, so aborting half way down
        // returns at the rate it left rather than snapping.
        window.oaPluginSet('buss', 0, 'fade', false);
        w.ctx.advance(2.5);
        assert.equal(window.oaBussFade(), 1, 'the fade did not come back');
    });
});
