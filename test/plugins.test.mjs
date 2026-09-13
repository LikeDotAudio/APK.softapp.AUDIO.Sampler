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
 * Header: plugins.test.mjs
 * Purpose: One test pattern per plugin — what this particular box has to do.
 * Description: contract.test.mjs checks that every plugin obeys the interface;
 *   this checks that each one is still the effect it claims to be. The pattern
 *   is the same for all of them and comes in three parts:
 *
 *     BYPASS IS A WIRE. Every effect here promises that at its off setting it
 *     builds nothing, or passes the signal through untouched. That promise is
 *     easy to break by accident and impossible to notice by ear, because "very
 *     slightly wrong" sounds like nothing at all until it is stacked sixteen
 *     times.
 *
 *     THE EXTREMES ARE LEGAL. Every knob to each end of its travel, in every
 *     combination the panel allows, without an AudioParam throwing. This is
 *     where the real failures live: an exponential ramp to zero, a NaN out of a
 *     divide, a frequency above Nyquist. The fake AudioParam throws on all of
 *     them exactly as a browser does, so a voice that would have died silently
 *     in a user's session fails here instead.
 *
 *     THE DSP DOES WHAT THE PANEL SAYS. Where the processing runs in a worklet,
 *     the real process() is run over real arrays — the actual shipping DSP, not
 *     a description of it.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld, createWorld } from './harness.mjs';

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

const peak = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

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

// ---------------------------------------------------------------------------
// Drum synth
// ---------------------------------------------------------------------------

describe('drum synth', () => {
    test('every engine renders at its defaults', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        for (const name of Object.keys(window.OA_SYNTH_ENGINES)) {
            const engine = window.OA_SYNTH_ENGINES[name];
            const patch = window.oaSynthPatch({ engine: name });
            assert.doesNotThrow(
                () => engine.render(w.ctx, patch, 0, 0.9, w.ctx.destination),
                `${name} threw at its own defaults`,
            );
        }
    });

    /**
     * The big one. Every engine, every knob, at both ends of its travel, with
     * everything else at default — and then all knobs at each extreme together.
     * The failures this catches are the ones that reach a user as a voice that
     * simply stops working: an exponential ramp to zero, a NaN from a divide by
     * a parameter that reached zero, a negative duration. The fake AudioParam
     * throws on all of those the way a browser does.
     */
    test('every engine survives every knob at both extremes', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        for (const name of Object.keys(window.OA_SYNTH_ENGINES)) {
            const engine = window.OA_SYNTH_ENGINES[name];
            const keys = Object.keys(engine.params);

            const patches = [];
            // One knob at a time.
            keys.forEach((k) => {
                const spec = engine.params[k];
                const values = spec.options ? spec.options : [spec.min, spec.max];
                values.forEach((v) => {
                    patches.push({ label: `${k}=${v}`, patch: window.oaSynthPatch({ engine: name, [k]: v }) });
                });
            });
            // Then everything at once, both ways.
            ['min', 'max'].forEach((end) => {
                const p = { engine: name };
                keys.forEach((k) => {
                    const spec = engine.params[k];
                    p[k] = spec.options ? spec.options[end === 'min' ? 0 : spec.options.length - 1] : spec[end];
                });
                patches.push({ label: `all ${end}`, patch: window.oaSynthPatch(p) });
            });

            for (const { label, patch } of patches) {
                assert.doesNotThrow(
                    () => engine.render(w.ctx, patch, w.ctx.currentTime, 0.9, w.ctx.destination),
                    `${name} threw with ${label}`,
                );
                const dur = engine.render(w.ctx, patch, w.ctx.currentTime, 0.9, w.ctx.destination);
                assert.ok(
                    typeof dur === 'number' && isFinite(dur) && dur > 0,
                    `${name} with ${label} reported a duration of ${dur}`,
                );
            }
        }
    });

    test('a volume of zero does not blow up an exponential envelope', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        // A muted track, a velocity of 0, a fader at the bottom — all of these
        // arrive here as a volume of zero, and every engine ramps exponentially.
        for (const name of Object.keys(window.OA_SYNTH_ENGINES)) {
            assert.doesNotThrow(
                () => window.OA_SYNTH_ENGINES[name].render(
                    w.ctx, window.oaSynthPatch({ engine: name }), 0, 0, w.ctx.destination,
                ),
                `${name} threw at volume 0`,
            );
        }
    });

    test('a patch out of storage is held to what the engine can do', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        // What a hand-edited localStorage entry, or a song file from a build
        // with different ranges, actually looks like on the way in.
        const patch = window.oaSynthPatch({
            engine: 'membrane', pitchStart: 1e9, decay: -50, wave: 'not-a-wave', click: NaN,
        });
        const spec = window.OA_SYNTH_ENGINES.membrane.params;
        assert.ok(patch.pitchStart <= spec.pitchStart.max, `pitchStart came through as ${patch.pitchStart}`);
        assert.ok(patch.decay >= spec.decay.min, `decay came through as ${patch.decay}`);
        assert.ok(spec.wave.options.includes(patch.wave), `wave came through as "${patch.wave}"`);
        assert.ok(Number.isFinite(patch.click), `click came through as ${patch.click}`);

        assert.doesNotThrow(() => window.OA_SYNTH_ENGINES.membrane.render(
            w.ctx, patch, 0, 0.9, w.ctx.destination,
        ), 'a sanitised patch still threw');
    });

    test('an unknown engine falls back rather than failing', async () => {
        const w = await createWarmWorld();
        const patch = w.window.oaSynthPatch({ engine: 'engine-from-a-later-build' });
        assert.ok(w.window.OA_SYNTH_ENGINES[patch.engine], `fell back to "${patch.engine}", which does not exist`);
    });

    test('the noise buffer is made once and shared', async () => {
        const w = await createWarmWorld();
        const a = w.window.oaNoiseBuffer(w.ctx);
        const b = w.window.oaNoiseBuffer(w.ctx);
        // Two seconds of float noise per hit would be the single most expensive
        // thing in the app.
        assert.equal(a, b, 'a fresh noise buffer was allocated on the second call');
    });
});

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

// ---------------------------------------------------------------------------
// Save and restore
//
// The failure this guards against is silent and shipped once already: the pedal
// and the channel compressor were added after the song exporter was written,
// nothing in it named them, and every exported song came back with those two
// effects at their defaults. No error, no warning — the settings simply were
// not in the file.
//
// So the test is not "does the reverb round-trip", it is "does EVERY registered
// effect round-trip", enumerated from the registry rather than from a list here
// that would rot exactly the same way the exporter's did.
// ---------------------------------------------------------------------------

describe('save and restore', () => {
    test('every effect with settings can be saved', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        const saveable = window.oaSaveablePlugins();
        // Everything that has settings. The voice counter is the one plugin
        // with nothing to remember, and it is deliberately not in this list.
        ['reverb', 'delay', 'chorus', 'drive', 'comp', 'buss', 'drumsynth'].forEach((id) => {
            assert.ok(saveable.includes(id), `${id} cannot be saved — it would be missing from every song`);
        });
        assert.ok(!saveable.includes('voices'), 'the voice counter is saving state it does not have');
    });

    test('what comes back is what went in', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        // Move something on every effect, away from its default in each case.
        window.oaSetReverb(0, 'rtMid', 4.25);
        window.oaSetReverbSend(0, 2, 0.6);
        window.oaSetDelay(1, 'feedback', 0.77);
        window.oaSetDelayChorus(1, 7);
        window.oaSetDrive(3, 'mode', 'fuzz');
        window.oaSetDrive(3, 'mix', 0.7);
        window.oaSetComp(2, 'input', 14);
        window.oaSetComp(2, 'on', true);
        window.oaSetBuss('thresh', -7);
        window.oaSetBuss('ratio', 6);
        window.oaSetBuss('sc', 90);
        window.oaSetBuss('fourK', true);
        window.oaSetBuss('on', true);

        // Through JSON, because that is what a song file is — a save() that
        // hands back something JSON cannot carry would pass a naive comparison
        // and lose the setting on the way to disk.
        const saved = JSON.parse(JSON.stringify(window.oaSavePlugins()));

        // Put every one of them back to something else.
        window.oaSetReverb(0, 'rtMid', 1.0);
        window.oaSetReverbSend(0, 2, 0);
        window.oaSetDelay(1, 'feedback', 0.1);
        window.oaSetDelayChorus(1, 0);
        window.oaSetDrive(3, 'mode', 'od');
        window.oaSetDrive(3, 'mix', 0);
        window.oaSetComp(2, 'input', 0);
        window.oaSetComp(2, 'on', false);
        window.oaSetBuss('thresh', 12);
        window.oaSetBuss('ratio', 0);
        window.oaSetBuss('sc', 0);
        window.oaSetBuss('fourK', false);
        window.oaSetBuss('on', false);

        const loaded = window.oaLoadPlugins(saved, { bpm: 120 });
        assert.ok(loaded.includes('reverb') && loaded.includes('delay')
            && loaded.includes('drive') && loaded.includes('comp')
            && loaded.includes('buss'),
            `only ${loaded.join(', ')} restored`);

        assert.equal(window.oaReverbUnit(0).rtMid, 4.25, 'the reverb time did not come back');
        assert.equal(window.oaReverbUnit(0).sends[2], 0.6, 'the reverb send did not come back');
        assert.equal(window.oaDelayUnit(1).feedback, 0.77, 'the tape feedback did not come back');
        assert.equal(window.oaDelayUnit(1).chorus, 7, 'the width mode did not come back');
        assert.equal(window.oaDriveUnit(3).mode, 'fuzz', 'the pedal voicing did not come back');
        assert.equal(window.oaDriveUnit(3).mix, 0.7, 'the pedal blend did not come back');
        assert.equal(window.oaCompUnit(2).input, 14, 'the compressor input did not come back');
        assert.equal(window.oaCompUnit(2).on, true, 'the compressor came back switched off');
        assert.equal(window.oaBussUnit().thresh, -7, 'the buss threshold did not come back');
        assert.equal(window.oaBussUnit().ratio, 6, 'the buss ratio did not come back');
        assert.equal(window.oaBussUnit().sc, 90, 'the buss side-chain filter did not come back');
        assert.equal(window.oaBussUnit().fourK, true, 'the buss came back without 44K mode');
        assert.equal(window.oaBussUnit().on, true, 'the buss came back out of circuit');
    });

    test('a grid-locked tape head is re-derived at the new song\'s tempo', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        // An eighth note at 120bpm is 250ms. Saved at 120, loaded into a song
        // running at 90, it has to become an eighth AT 90 — 333ms — not stay at
        // the 250 it was cut at. That is the whole reason a lock is stored as a
        // count of 16ths rather than as a time.
        window.oaSetDelaySync(0, 'L', 2, 120);
        assert.ok(Math.abs(window.oaDelayUnit(0).timeL - 0.25) < 1e-6, 'the lock did not take at 120');

        const saved = JSON.parse(JSON.stringify(window.oaSavePlugins()));
        window.oaLoadPlugins(saved, { bpm: 90 });

        assert.ok(Math.abs(window.oaDelayUnit(0).timeL - 1 / 3) < 1e-3,
            `an eighth at 90bpm should be 333ms, got ${Math.round(window.oaDelayUnit(0).timeL * 1000)}ms`);
        assert.equal(window.oaDelayUnit(0).syncL, 2, 'the head came back off the grid');
    });

    test('a malformed effect in the file does not take the rest of the import down', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        window.oaSetReverb(0, 'rtMid', 3.5);
        const saved = JSON.parse(JSON.stringify(window.oaSavePlugins()));
        window.oaSetReverb(0, 'rtMid', 1.0);

        // A hand-edited file, or one from a build whose drive plugin stored
        // something else entirely.
        saved.drive = { units: 'not an array' };

        const loaded = window.oaLoadPlugins(saved, { bpm: 120 });
        assert.ok(loaded.includes('reverb'), 'one bad effect stopped the others loading');
        assert.equal(window.oaReverbUnit(0).rtMid, 3.5, 'the reverb did not restore');
    });
});
