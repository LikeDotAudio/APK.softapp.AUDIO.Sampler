// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: gate.test.mjs
 * Purpose: Prove the ninth plugin does what its faceplate says — PLAN-189.01.
 * Description: The gate's completion criterion is not "it registers", it is
 *   **it does not chatter on a signal sitting at the threshold** — and the plan
 *   that carved it was blocked for three sittings on the belief that this could
 *   only be judged by ear. It cannot only be judged by ear. Chatter is a
 *   NUMBER: the count of OPEN → CLOSED edges the state machine makes over a
 *   known stretch of audio, which `OaGate` keeps on `this.closes` for exactly
 *   this purpose.
 *
 *   So this file is in two halves, and the second one is the substance:
 *
 *     THE TRANSFER FUNCTION. `oaGateCurve()` is what the panel plots, and the
 *     worklet evaluates the same three lines per sample in another realm where
 *     it cannot call in to them. Two statements of one function is one too
 *     many, so the rendered DSP is measured and compared against the plotted
 *     curve at nine levels. A wrong transfer function is then VISIBLE, which is
 *     the whole reason PLAN-189.01 asked for the plot.
 *
 *     THE CHATTER COUNT. A signal wobbling half a decibel either side of the
 *     threshold is run through the real `process()` for one second of audio and
 *     the transitions are counted. The assertion is BOUNDED, not zero, because
 *     zero would also be the answer if the gate never opened at all — so the
 *     same signal is run through a gate with the hold and the hysteresis taken
 *     away, and that one has to chatter. A test that cannot fail measures
 *     nothing, and this pair is the proof that this one can.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from './harness.mjs';

const SR = 48000;
const BLOCK = 128;

/** Linear amplitude for a level in dBFS, and back. */
const amp = (db) => Math.pow(10, db / 20);
const dbOf = (a) => (a > 1e-12 ? 20 * Math.log10(a) : -240);

/** Every parameter the worklet declares, at the panel's own defaults. */
const GATE_DEFAULTS = {
    thresh: -40, range: -60, ratio: 8, knee: 6, hyst: 3,
    attack: 0.001, hold: 0.04, release: 0.2,
};

/**
 * Run the shipping gate over `blocks` blocks of `input` and hand back the last
 * block plus the processor itself — `proc.closes` is the chatter count and
 * `proc.red` is where the attenuation settled.
 */
const runGate = (Processor, params, input, blocks = 1) => {
    const proc = new Processor();
    const p = {};
    Object.keys(Object.assign({}, GATE_DEFAULTS, params)).forEach((k) => {
        p[k] = [Object.assign({}, GATE_DEFAULTS, params)[k]];
    });
    let out = null;
    for (let b = 0; b < blocks; b++) {
        const outL = new Float32Array(input.length);
        const outR = new Float32Array(input.length);
        proc.process([[input, input]], [[outL, outR]], p);
        out = outL;
    }
    return { out, proc };
};

/**
 * The settled gain, in decibels, that a steady input at `db` dBFS comes out
 * with. Long enough for the slowest ballistic asked for here to have arrived.
 */
const settledGainDb = (Processor, params, db, blocks = 400) => {
    const a = amp(db);
    const input = new Float32Array(BLOCK).fill(a);
    const { out } = runGate(Processor, params, input, blocks);
    let peak = 0;
    for (let i = 0; i < out.length; i++) {
        const v = out[i] < 0 ? -out[i] : out[i];
        if (v > peak) peak = v;
    }
    return dbOf(peak) - db;
};

const peak = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('the gate', () => {
    test('it is registered, metered and projects onto ParamSpec', async () => {
        const { window } = await createWarmWorld();
        assert.ok(window.oaPluginIds().includes('gate'), 'no gate plugin is registered');

        // PLAN-18.01's adapter must drive it with no per-effect code.
        const specs = window.oaPluginParamSpecs('gate', 0);
        assert.equal(specs.length, 8, 'the gate should project eight controls');
        specs.forEach((s) => {
            assert.equal(s.type, 'number', `${s.name}: a gate has no detents`);
            assert.equal(s.writable, true, `${s.name}: the console must be able to write it`);
        });

        // PLAN-18.04, and the reason this plan asked for `kind` from the start
        // rather than as a tenth retrofit.
        window.oaPluginParams('gate', 0).forEach((p) => {
            assert.equal(p.kind, 'continuous', `${p.key}: kind is "${p.kind}"`);
        });

        // The shared first four slots plus this unit's own two.
        const frame = window.oaPluginFrame('gate', 0);
        const L = window.oaPluginLayout('gate');
        assert.ok(frame.length >= L.OPEN + 1, 'the gate frame has no room for its OPEN slot');
        assert.notEqual(L.GR, L.OPEN, 'GR and OPEN share a slot');
    });

    test('its worklet registers and the panel gets its parameters', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-gate');
        assert.ok(Processor, 'the gate processor never registered');

        const declared = Processor.parameterDescriptors.map((d) => d.name).sort();
        assert.deepEqual(
            declared,
            ['attack', 'hold', 'hyst', 'knee', 'range', 'ratio', 'release', 'thresh'],
            'the worklet and the panel disagree about which parameters exist',
        );

        // Every panel control has to reach the DSP. `on` is not a parameter —
        // it is the range knob, which is the point of the wire test below.
        const panel = new Set(w.window.OA_GATE_PARAMS.map((p) => p.key));
        declared.forEach((k) => assert.ok(panel.has(k), `the worklet has "${k}" and the panel does not`));
    });

    // ------------------------------------------------------------------
    // Bypass is a wire
    // ------------------------------------------------------------------

    test('range at 0 dB is a wire, sample for sample', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-gate');

        const input = new Float32Array(BLOCK);
        for (let i = 0; i < BLOCK; i++) input[i] = Math.sin(i / 8) * 0.9;

        const { out } = runGate(Processor, { range: 0, thresh: 0, ratio: 20, hyst: 0, hold: 0 }, input, 4);

        // Every other setting extreme, and still bit for bit the input, because
        // a shut gate at range 0 attenuates by nothing. "Almost the input" is a
        // bug: sixteen channels of almost is a channel of not.
        for (let i = 0; i < BLOCK; i++) {
            assert.equal(out[i], input[i], `sample ${i} changed at range 0`);
        }
    });

    test('a default channel is out of circuit and builds no nodes', async () => {
        const w = await createWarmWorld();
        assert.equal(w.window.oaGateActive(0), false, 'a default channel claims to be gating');
        // The claim that matters: not "gate set to do nothing" — which still
        // costs a worklet on every channel — but gate not present.
        assert.equal(w.window.oaGateInput(w.ctx, 0, w.ctx.destination), null, 'an out gate built a strip');
        assert.equal(w.window.oaGateStripCount(w.ctx), 0, 'the rack warmed a strip nobody asked for');
    });

    test('switching it off is the same lever as turning the range to nothing', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        window.oaPluginSet('gate', 0, 'range', -40);
        window.oaSetGate(0, 'on', true);
        assert.equal(window.oaGateActive(0), true, 'a switched-on gate with range is not active');
        window.oaPluginSet('gate', 0, 'range', 0);
        assert.equal(window.oaGateActive(0), false, 'range 0 is not treated as a wire');
    });

    // ------------------------------------------------------------------
    // The transfer function — what the panel draws
    // ------------------------------------------------------------------

    test('the static curve is an expander, fixed by definition rather than by this code', async () => {
        const { window } = await createWarmWorld();
        const R = (db) => window.oaGateReductionDb(db, -30, 6, 0, -48);

        // Above the threshold a gate is not there.
        assert.equal(R(-10), 0, 'a gate attenuated a signal above its threshold');
        assert.equal(R(-30), 0, 'a gate attenuated a signal exactly at its threshold');

        // Below it, every decibel the signal falls costs (ratio - 1) more.
        // 6:1, six decibels under the line: 6 * 5 = 30 dB of attenuation.
        assert.ok(Math.abs(R(-36) - 30) < 1e-9, `6 dB under at 6:1 should be 30 dB down, got ${R(-36)}`);
        assert.ok(Math.abs(R(-32) - 10) < 1e-9, `2 dB under at 6:1 should be 10 dB down, got ${R(-32)}`);

        // …until the range floor, which is a floor and not a suggestion.
        assert.equal(R(-90), 48, 'the range floor did not hold');
        assert.equal(R(-240), 48, 'the range floor did not hold at silence');

        // Ratio 1 is no expansion at all — the identity, at every level.
        for (const db of [-10, -30, -50, -80]) {
            assert.equal(window.oaGateReductionDb(db, -30, 1, 0, -48), 0, `ratio 1 attenuated at ${db} dB`);
        }
    });

    test('the knee is continuous, in value and in slope', async () => {
        const { window } = await createWarmWorld();
        const K = 12;
        const R = (db) => window.oaGateReductionDb(db, -30, 8, K, -80);

        // A corner in the gain is a discontinuity, and a discontinuity is a
        // click. Walked across the whole knee, no step may exceed what the
        // steepest allowed slope could produce over the same distance.
        const step = 0.05;
        const maxJump = (8 - 1) * step * 1.0001;
        let prev = R(-30 + K);
        for (let db = -30 + K; db >= -30 - K; db -= step) {
            const here = R(db);
            assert.ok(here - prev <= maxJump && here >= prev - 1e-12,
                `the knee jumps ${(here - prev).toFixed(4)} dB at ${db.toFixed(2)} dBFS`);
            prev = here;
        }

        // And it meets the two straight lines it joins, at both ends.
        assert.ok(Math.abs(R(-30 + K / 2)) < 1e-9, 'the knee does not reach unity at its top');
        assert.ok(Math.abs(R(-30 - K / 2) - (K / 2) * 7) < 1e-9, 'the knee does not meet the ratio line at its bottom');
    });

    test('the plotted curve is a stable array, and it is the transfer function', async () => {
        const { window } = await createWarmWorld();
        window.oaSetGate(0, 'thresh', -30);
        window.oaSetGate(0, 'range', -48);
        window.oaSetGate(0, 'ratio', 6);
        window.oaSetGate(0, 'knee', 0);
        window.oaSetGate(0, 'on', true);

        const c = window.oaPluginCurve('gate', 0);
        assert.ok(c instanceof Float32Array, 'the gate should publish its transfer curve');
        assert.equal(window.oaPluginCurve('gate', 0), c, 'the gate curve was rebuilt');

        const u = window.oaGateUnit(0);
        for (let i = 0; i < c.length; i++) {
            const db = window.oaGateCurveDb(i);
            const want = db - window.oaGateReductionDb(db, u.thresh, u.ratio, u.knee, u.range);
            assert.ok(Math.abs(c[i] - want) < 1e-3, `the plot disagrees at ${db} dBFS: ${c[i]} vs ${want}`);
        }

        // Out of circuit the panel draws the identity, not a shape the sound
        // does not have.
        window.oaSetGate(0, 'on', false);
        const off = window.oaGateCurve(0);
        for (let i = 0; i < off.length; i++) {
            assert.ok(Math.abs(off[i] - window.oaGateCurveDb(i)) < 1e-3,
                `an out-of-circuit gate is plotted bending ${window.oaGateCurveDb(i)} dBFS`);
        }
    });

    /**
     * The one that matters for PLAN-189.01 step 4: the DSP and the PLOT are two
     * statements of one function, in two realms, and they have to agree.
     *
     * Measured by rendering, not by re-evaluating the plot's own arithmetic —
     * the worklet's loop is the second opinion. The hysteresis and hold are set
     * to zero here on purpose: the static curve is what the gate settles to,
     * and the timer's job is tested three tests down.
     */
    test('the rendered gate settles onto the curve the panel plots', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const Processor = w.processors.get('oa-gate');

        const settings = { thresh: -30, range: -48, ratio: 6, knee: 0, hyst: 0, hold: 0, attack: 0.0005, release: 0.005 };
        window.oaSetGate(0, 'on', true);
        ['thresh', 'range', 'ratio', 'knee', 'hyst'].forEach((k) => window.oaSetGate(0, k, settings[k]));

        const plotted = window.oaGateCurve(0);
        const at = (db) => {
            let best = 0, bestD = Infinity;
            for (let i = 0; i < plotted.length; i++) {
                const d = Math.abs(window.oaGateCurveDb(i) - db);
                if (d < bestD) { bestD = d; best = i; }
            }
            return plotted[best] - window.oaGateCurveDb(best);
        };

        for (const db of [-6, -18, -29, -31, -34, -38, -44, -60, -80]) {
            const rendered = settledGainDb(Processor, settings, db);
            assert.ok(
                Math.abs(rendered - at(db)) < 0.35,
                `at ${db} dBFS the panel plots ${at(db).toFixed(2)} dB of gain and the DSP renders ${rendered.toFixed(2)}`,
            );
        }
    });

    test('a signal over the threshold comes out untouched and one under it does not', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-gate');
        const settings = { thresh: -30, range: -40, ratio: 10, knee: 0, hyst: 0, hold: 0, attack: 0.0005, release: 0.005 };

        assert.ok(Math.abs(settledGainDb(Processor, settings, -10)) < 0.05,
            'a signal well over the threshold was turned down');
        assert.ok(settledGainDb(Processor, settings, -45) < -30,
            'a signal well under the threshold was barely touched');
    });

    // ------------------------------------------------------------------
    // The hold timer — the thing this plan put first
    // ------------------------------------------------------------------

    /**
     * A gate is more dangerous to get wrong than a compressor, and this is the
     * measurement that says so out loud. A signal wobbling half a decibel
     * either side of the threshold — the exact case PLAN-189.01's second
     * completion criterion names — carried on a 200 Hz tone, for one second.
     *
     * WHAT THE BOUND MEANS. The envelope genuinely crosses the line three times
     * a second, so up to three transitions is the gate WORKING; the carrier
     * crosses zero four hundred times a second, and following that is the
     * defect. The two numbers are two orders of magnitude apart, which is why
     * this is a measurement rather than a judgement call. Measured with the
     * shipping defaults at this threshold: 3.
     *
     * AND IT CANNOT PASS VACUOUSLY, in two ways. Zero transitions is also what
     * a gate that never opened would report, so the output energy is measured
     * too — a gate that stayed shut would pass almost none of it. And the same
     * signal is run through the same processor with the hold and the hysteresis
     * removed, which has to chatter. A test that cannot fail measures nothing.
     */
    test('a signal sitting at the threshold does not chatter', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-gate');

        const THRESH = -30;
        const blocks = Math.round(SR / BLOCK);          // one second of audio

        /** 200 Hz, its envelope wobbling ±0.5 dB across the threshold at 3 Hz. */
        const hover = (b) => {
            const buf = new Float32Array(BLOCK);
            for (let i = 0; i < BLOCK; i++) {
                const n = b * BLOCK + i;
                const env = amp(THRESH + 0.5 * Math.sin(2 * Math.PI * 3 * n / SR));
                buf[i] = env * Math.sin(2 * Math.PI * 200 * n / SR);
            }
            return buf;
        };

        const run = (params) => {
            const proc = new Processor();
            const p = {};
            const all = Object.assign({}, GATE_DEFAULTS, params);
            Object.keys(all).forEach((k) => { p[k] = [all[k]]; });
            let energyIn = 0, energyOut = 0;
            for (let b = 0; b < blocks; b++) {
                const input = hover(b);
                const outL = new Float32Array(BLOCK);
                const outR = new Float32Array(BLOCK);
                proc.process([[input, input]], [[outL, outR]], p);
                for (let i = 0; i < BLOCK; i++) {
                    energyIn += input[i] * input[i];
                    energyOut += outL[i] * outL[i];
                }
            }
            return { proc, passed: energyOut / energyIn };
        };

        // The shipping defaults at this threshold: 40 ms of hold and 3 dB of
        // hysteresis. A 200 Hz tone has a zero crossing every 2.5 ms, and the
        // envelope stays inside the hysteresis band once the gate is open.
        const held = run({ thresh: THRESH, hold: 0.04, hyst: 3 });
        assert.ok(
            held.proc.closes <= 6,
            `the gate opened and shut ${held.proc.closes} times in a second on a signal sitting at the threshold`,
        );

        // …and it was OPEN for essentially all of it, or the count above is a
        // gate that never opened wearing a passing test's clothes.
        assert.ok(
            held.passed > 0.6,
            `the gate passed only ${(held.passed * 100).toFixed(0)}% of the signal's energy, so it was shut, not quiet`,
        );

        // The control. Same signal, same processor, hold and hysteresis taken
        // away — the failure this design exists to prevent, measured rather
        // than described.
        const bare = run({ thresh: THRESH, hold: 0, hyst: 0 });
        assert.ok(
            bare.proc.closes > 100,
            `with no hold and no hysteresis the gate should chatter, and it only made ${bare.proc.closes} transitions — this test can no longer fail`,
        );
    });

    test('hold is what covers a zero crossing, and it is measured in half-cycles', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-gate');

        // A 40 Hz tone at -12 dBFS is 18 dB clear of a -30 dB threshold and
        // still falls THROUGH it twice a cycle, for about a millisecond each
        // time. Hysteresis shortens that window but cannot remove it — only the
        // hold timer covers it — so hysteresis is held at zero here and the
        // hold is the only thing that changes between the two runs.
        const blocks = Math.round(SR / BLOCK);
        const tone = (b) => {
            const buf = new Float32Array(BLOCK);
            for (let i = 0; i < BLOCK; i++) {
                const n = b * BLOCK + i;
                buf[i] = amp(-12) * Math.sin(2 * Math.PI * 40 * n / SR);
            }
            return buf;
        };
        const run = (params) => {
            const proc = new Processor();
            const p = {};
            const all = Object.assign({}, GATE_DEFAULTS, params);
            Object.keys(all).forEach((k) => { p[k] = [all[k]]; });
            for (let b = 0; b < blocks; b++) {
                proc.process([[tone(b), tone(b)]], [[new Float32Array(BLOCK), new Float32Array(BLOCK)]], p);
            }
            return proc;
        };

        const short = run({ thresh: -30, hold: 0.0002, hyst: 0 });
        const long = run({ thresh: -30, hold: 0.04, hyst: 0 });

        // 40 Hz, two crossings a cycle: eighty a second, and a 0.2 ms hold
        // catches none of them.
        assert.ok(short.closes >= 70,
            `a 0.2 ms hold cannot cover a 1 ms zero crossing, and this made only ${short.closes} transitions`);
        assert.equal(long.closes, 0,
            `a 40 ms hold covers a 1 ms zero crossing, and this made ${long.closes} transitions`);
    });

    /**
     * The other half, isolated — and it was added because the mutation test
     * demanded it: deleting the hysteresis from the state machine left every
     * test above green, because with 40 ms of hold in hand nothing here needed
     * two thresholds. A defence nothing measures is a defence that will be
     * deleted by someone tidying up.
     *
     * So: HOLD SET TO ZERO, and a level dithering half a decibel either side of
     * the threshold with no carrier under it — the one shape a hold timer
     * cannot help with, because there is no zero crossing to bridge, only a
     * line being crossed thousands of times a second. Hysteresis is then the
     * only thing standing between the gate and 24,000 transitions.
     */
    test('hysteresis alone holds a dithering level, with no hold timer at all', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-gate');

        const THRESH = -30;
        const blocks = Math.round(SR / BLOCK);

        // A deterministic dither: the same numbers every run, so a failure is a
        // change in the gate and never a change in the weather.
        let seed = 20260902;
        const rand = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        const dithered = () => {
            const buf = new Float32Array(BLOCK);
            for (let i = 0; i < BLOCK; i++) buf[i] = amp(THRESH + 0.5 * (rand() * 2 - 1));
            return buf;
        };

        const run = (params) => {
            seed = 20260902;
            const proc = new Processor();
            const p = {};
            const all = Object.assign({}, GATE_DEFAULTS, params);
            Object.keys(all).forEach((k) => { p[k] = [all[k]]; });
            for (let b = 0; b < blocks; b++) {
                proc.process([[dithered(), dithered()]], [[new Float32Array(BLOCK), new Float32Array(BLOCK)]], p);
            }
            return proc;
        };

        const one = run({ thresh: THRESH, hold: 0, hyst: 0 });
        const two = run({ thresh: THRESH, hold: 0, hyst: 3 });

        assert.ok(one.closes > 1000,
            `one threshold and a dithering level should chatter, and it made only ${one.closes} transitions`);
        assert.equal(two.closes, 0,
            `3 dB of hysteresis should hold a level dithering 0.5 dB, and it let go ${two.closes} times`);
    });

    test('the gate opens on the transient rather than after it', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-gate');

        // A drum channel cannot afford a slow gate: the front of the stick is
        // the part that is gone. At 0.2 ms the first block has to be most of
        // the way open already.
        const hit = new Float32Array(BLOCK).fill(amp(-6));
        const fast = runGate(Processor, { thresh: -30, range: -60, attack: 0.0002, hold: 0.05 }, hit, 1);
        const slow = runGate(Processor, { thresh: -30, range: -60, attack: 0.05, hold: 0.05 }, hit, 1);

        assert.ok(peak(fast.out) > amp(-6) * 0.9,
            `a 0.2 ms attack should be open within a block, and it reached ${dbOf(peak(fast.out) / amp(-6)).toFixed(1)} dB`);
        assert.ok(peak(slow.out) < peak(fast.out),
            'the attack knob does not change how fast the gate opens');
    });

    // ------------------------------------------------------------------
    // The extremes
    // ------------------------------------------------------------------

    test('every knob at both ends stays legal', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        const Processor = w.processors.get('oa-gate');

        const input = new Float32Array(BLOCK);
        for (let i = 0; i < BLOCK; i++) input[i] = Math.sin(i / 5) * 0.95;

        for (const p of window.OA_GATE_PARAMS) {
            for (const end of [p.min, p.max]) {
                window.oaSetGate(0, p.key, end);
                window.oaSetGate(0, 'on', true);
                const u = window.oaGateUnit(0);
                const { out } = runGate(Processor, {
                    thresh: u.thresh, range: u.range, ratio: u.ratio, knee: u.knee, hyst: u.hyst,
                    attack: u.attack / 1000, hold: u.hold / 1000, release: u.release / 1000,
                }, input, 8);
                out.forEach((v, i) => assert.ok(Number.isFinite(v),
                    `${p.key} at ${end}: sample ${i} is ${v}`));
                assert.ok(peak(out) <= peak(input) + 1e-6,
                    `${p.key} at ${end}: a gate made the signal LOUDER`);
            }
            window.oaSetGate(0, p.key, p.def);
        }
    });

    test('silence in, silence out, and the meter parks', async () => {
        const w = await createWarmWorld();
        const Processor = w.processors.get('oa-gate');
        const { out, proc } = runGate(Processor, { thresh: -60, hold: 0, hyst: 0 }, new Float32Array(BLOCK), 40);
        assert.equal(peak(out), 0, 'silence came out non-silent');
        assert.equal(proc.open, false, 'the gate is holding itself open over silence');
    });

    test('a half-written saved unit still comes up playable', async () => {
        const { window } = await createWarmWorld();
        window.oaPlugin('gate').load({
            units: [{ on: true, thresh: 999, hold: 'banana', ratio: -4 }],
        });
        const u = window.oaGateUnit(0);
        assert.equal(u.thresh, 0, 'an out-of-range threshold was not clamped');
        assert.equal(u.hold, 40, 'a non-numeric hold did not fall back to its default');
        assert.equal(u.ratio, 1, 'a negative ratio was not clamped');
        assert.ok(window.OA_GATE_PARAMS.every((p) => Number.isFinite(u[p.key])),
            'a half-written unit left a non-numeric setting behind');
    });

    test('a preset that names a knob the panel does not have is ignored, not stored', async () => {
        const { window } = await createWarmWorld();
        Object.entries(window.OA_GATE_PRESETS).forEach(([name, preset]) => {
            assert.equal(typeof preset.label, 'string', `preset "${name}" has no label`);
            Object.keys(preset).forEach((k) => {
                if (k === 'label' || k === 'on') return;
                assert.ok(window.OA_GATE_PARAMS.some((p) => p.key === k),
                    `preset "${name}" sets "${k}", which is not on the faceplate`);
            });
        });

        // And every one of them lands inside its knob's travel, so a factory
        // setting cannot be silently clamped into a different sound.
        Object.entries(window.OA_GATE_PRESETS).forEach(([name, preset]) => {
            window.oaApplyGatePreset(0, name);
            const u = window.oaGateUnit(0);
            window.OA_GATE_PARAMS.forEach((p) => {
                if (typeof preset[p.key] !== 'number') return;
                assert.equal(u[p.key], preset[p.key], `preset "${name}" had ${p.key} clamped on the way in`);
            });
        });
    });
});
