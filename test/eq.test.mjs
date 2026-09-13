// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: eq.test.mjs
 * Purpose: Prove the tenth plugin does what its faceplate says — PLAN-18.03.
 * Description: The EQ is the one unit in this tree whose whole output is a
 *   SHAPE, so a test that only checked it registered would prove nothing worth
 *   knowing. These check the arithmetic against values a textbook fixes
 *   independently of this implementation:
 *
 *     a shelf is at HALF its gain at the corner frequency;
 *     a bell is at its full gain at the centre and nowhere else;
 *     bands in series ADD in decibels;
 *     flat is EXACTLY flat, and builds no nodes at all.
 *
 *   The last one is the one that would rot quietly. "Transparent until asked"
 *   is a claim about the node graph, not about the sound, and the only way to
 *   hold it is to assert that oaEqNode() hands back null.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld, BACKEND_SOURCES } from './harness.mjs';

/** The curve value nearest a given frequency, and the frequency it landed on. */
const atHz = (window, curve, hz) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < curve.length; i++) {
        const d = Math.abs(window.oaEqCurveFreq(i) - hz);
        if (d < bestD) { bestD = d; best = i; }
    }
    return curve[best];
};

/**
 * One band's magnitude at one frequency, measured by RENDERING it.
 *
 * An impulse goes through the Direct Form I difference equation the browser's
 * BiquadFilterNode implements, and the spectrum of what comes out is read at
 * `hz` by direct summation. This shares no arithmetic with `oaEqBandDb`, which
 * evaluates H(e^jw) in closed form from the same coefficients — so the two
 * agreeing is a real second opinion rather than the same expression twice.
 *
 * WHAT IT CATCHES, measured by breaking the source and watching (2026-08-29):
 * reading the second harmonic as the first, and dropping the denominator's
 * imaginary part, each take all five rendered tests red — and they report it as
 * "the plot says -8.6 dB and the rendered filter measures -3.1 dB", which is the
 * defect stated rather than inferred from a shape being wrong.
 *
 * WHAT IT DOES NOT CATCH, and this is the limit worth knowing: `renderedDb`
 * takes its coefficients from `oaEqCoeffs` too. A wrong coefficient set moves
 * both readings by the same amount and this comparison stays silent. The
 * shelf/bell/pass assertions above are what hold `oaEqCoeffs` to a shape a
 * textbook fixes independently, and un-normalising `b0` was measured taking six
 * of them red. The two halves are not redundant; neither covers the other.
 *
 * 32,768 samples at 48 kHz is ~0.68 s of decay, which puts the truncation error
 * twelve orders of magnitude below the tolerances asserted here.
 */
const renderedDb = (window, band, hz, sr, N = 32768) => {
    const c = window.oaEqCoeffs(band, sr);
    const w = 2 * Math.PI * hz / sr;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, re = 0, im = 0;
    for (let n = 0; n < N; n++) {
        const x = n === 0 ? 1 : 0;
        const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        re += y * Math.cos(w * n);
        im -= y * Math.sin(w * n);
    }
    return 10 * Math.log10(re * re + im * im);
};

/** A node factory just rich enough for oaEqNode, with no AudioContext behind it. */
const fakeCtx = () => {
    const mk = (kind) => ({
        __kind: kind,
        __out: [],
        connect(t) { this.__out.push(t); },
        frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 },
    });
    return { createGain: () => mk('gain'), createBiquadFilter: () => mk('biquad') };
};

describe('the equaliser', () => {
    test('it is registered, metered and projects onto ParamSpec', async () => {
        const { window } = await createWarmWorld();
        assert.ok(window.oaPluginIds().includes('eq'), 'no eq plugin is registered');

        // PLAN-18.01's adapter must drive it with no per-effect code.
        const specs = window.oaPluginParamSpecs('eq', 0);
        assert.equal(specs.length, 7, 'the eq should project seven controls');
        specs.forEach((s) => {
            assert.equal(s.type, 'number', `${s.name}: an EQ has no detents`);
            assert.equal(s.writable, true, `${s.name}: the console must be able to write it`);
        });

        // The shared first four slots — the Mixer meters any plugin without
        // knowing which plugin it is.
        const frame = window.oaPluginFrame('eq', 0);
        assert.ok(frame.length >= window.OA_SLOT.USER + 3, 'the eq frame is too short for its bands');
    });

    test('flat is exactly flat, and builds nothing at all', async () => {
        const { window } = await createWarmWorld();
        assert.equal(window.oaEqActive(0), false, 'a default channel claims to be equalising');

        const curve = window.oaEqCurve(0);
        for (let i = 0; i < curve.length; i++) {
            assert.equal(curve[i], 0, `flat EQ bends ${window.oaEqCurveFreq(i).toFixed(0)} Hz`);
        }

        // The claim that matters: not "EQ set flat" — which still costs three
        // biquads on every voice — but EQ not present.
        const chain = [];
        assert.equal(window.oaEqNode(fakeCtx(), 0, {}, chain), null, 'a flat EQ built nodes');
        assert.equal(chain.length, 0, 'a flat EQ left nodes in the retirement list');
    });

    test('a shelf is half its gain at the corner and all of it in the stopband', async () => {
        const { window } = await createWarmWorld();
        window.oaSetEq(0, 'loFreq', 100);
        window.oaSetEq(0, 'loGain', 6);
        const c = window.oaEqCurve(0);

        // The defining property of a shelving filter, and it is fixed by the
        // definition rather than by this implementation.
        assert.ok(Math.abs(atHz(window, c, 100) - 3) < 0.25,
            `low shelf at its corner should be +3 dB, got ${atHz(window, c, 100).toFixed(2)}`);
        assert.ok(Math.abs(atHz(window, c, 20) - 6) < 0.25,
            `low shelf well below the corner should reach +6 dB, got ${atHz(window, c, 20).toFixed(2)}`);
        assert.ok(Math.abs(atHz(window, c, 10000)) < 0.05,
            'a low shelf moved the top end');
    });

    test('a bell cuts at its centre and leaves the rest alone', async () => {
        const { window } = await createWarmWorld();
        window.oaSetEq(0, 'midFreq', 1000);
        window.oaSetEq(0, 'midQ', 2);
        window.oaSetEq(0, 'midGain', -9);
        const c = window.oaEqCurve(0);

        assert.ok(Math.abs(atHz(window, c, 1000) + 9) < 0.2,
            `a -9 dB bell should be -9 dB at centre, got ${atHz(window, c, 1000).toFixed(2)}`);
        assert.ok(Math.abs(atHz(window, c, 100)) < 0.5, 'the bell reached two decades down');
        assert.ok(Math.abs(atHz(window, c, 10000)) < 0.5, 'the bell reached a decade up');
    });

    test('bands in series add in decibels', async () => {
        const { window } = await createWarmWorld();
        window.oaSetEq(0, 'loGain', 6);
        const lo = Float32Array.from(window.oaEqCurve(0));
        window.oaSetEq(0, 'loGain', 0);
        window.oaSetEq(0, 'hiGain', 4);
        const hi = Float32Array.from(window.oaEqCurve(0));
        window.oaSetEq(0, 'loGain', 6);
        const both = window.oaEqCurve(0);

        for (let i = 0; i < both.length; i++) {
            assert.ok(Math.abs(both[i] - (lo[i] + hi[i])) < 1e-4,
                `two bands did not add at ${window.oaEqCurveFreq(i).toFixed(0)} Hz`);
        }
    });

    test('only the bands that bite become filters', async () => {
        const { window } = await createWarmWorld();
        window.oaSetEq(0, 'loGain', 6);          // one band, not three
        const chain = [];
        const input = window.oaEqNode(fakeCtx(), 0, {}, chain);
        assert.ok(input, 'a lifted low shelf built nothing');
        const biquads = chain.filter((n) => n.__kind === 'biquad');
        assert.equal(biquads.length, 1, `expected one filter, got ${biquads.length}`);
        assert.equal(biquads[0].type, 'lowshelf');
        assert.equal(biquads[0].frequency.value, window.oaEqUnit(0).loFreq);
        assert.equal(biquads[0].gain.value, 6);
    });

    // PLAN-18.03 step 4. Every SPOG strip publishes ch{n}_eq_hi/_mid/_lo as
    // 0..1 with 0.5 flat, and until this unit existed they were read by nothing.
    // The conversion has to be exact at 0.5 or a strip nobody has touched would
    // tilt the sound the moment a bridge came up.
    test("SPOG's trims map to decibels, and 0.5 is exactly flat", async () => {
        const { window } = await createWarmWorld();
        assert.equal(window.oaEqFromTrim(0.5), 0, 'a untouched SPOG knob is not flat');
        assert.equal(window.oaEqToTrim(0), 0.5, 'flat does not come back as an untouched knob');
        assert.equal(window.oaEqFromTrim(1), 18);
        assert.equal(window.oaEqFromTrim(0), -18);

        for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
            assert.ok(Math.abs(window.oaEqToTrim(window.oaEqFromTrim(t)) - t) < 1e-9,
                `trim ${t} did not survive the round trip`);
        }

        // And driving a strip's knob has to be audible, which is the whole
        // point of the item: three surfaces, and until now no unit.
        window.oaEqSetBand(0, 'hi', 'gain', window.oaEqFromTrim(0.9));
        assert.equal(window.oaEqActive(0), true, 'a SPOG trim did not reach the sound');
    });

    test('the named three are fixed, and the free bands are not', async () => {
        const { window } = await createWarmWorld();
        const named = window.oaEqBands(0);
        assert.deepEqual(named.map((b) => b.id), ['lo', 'mid', 'hi']);
        assert.deepEqual(named.map((b) => b.type), ['lowshelf', 'peaking', 'highshelf']);

        // A fixed band's role IS its identity: SPOG binds to these ids, so a
        // retype or a switch-off has to be refused rather than half-applied.
        window.oaEqSetBand(0, 'lo', 'type', 'notch');
        window.oaEqSetBand(0, 'lo', 'on', false);
        assert.equal(window.oaEqBands(0)[0].type, 'lowshelf', 'a fixed band was retyped');
        assert.equal(window.oaEqBands(0)[0].on, true, 'a fixed band was switched off');
        assert.equal(window.oaEqRemoveBand(0, 'lo'), false, 'a fixed band was removed');

        // A free band is the parametric panel's, and behaves the other way.
        const id = window.oaEqAddBand(0, { type: 'highpass', freq: 80, q: 0.7 });
        assert.equal(id, 'free0');
        assert.equal(window.oaEqBands(0).length, 4);
        window.oaEqSetBand(0, id, 'type', 'notch');
        assert.equal(window.oaEqBands(0)[3].type, 'notch');
        assert.equal(window.oaEqRemoveBand(0, id), true);
        assert.equal(window.oaEqBands(0).length, 3);
    });

    test('a channel cannot grow more bands than it can afford', async () => {
        const { window } = await createWarmWorld();
        for (let i = 0; i < window.OA_EQ_FREE_MAX; i++) {
            assert.ok(window.oaEqAddBand(0, {}), `band ${i} was refused early`);
        }
        assert.equal(window.oaEqAddBand(0, {}), null, 'the free-band cap does not hold');
    });

    test('a pass filter shapes the sound whatever its gain says', async () => {
        const { window } = await createWarmWorld();
        // A bell at 0 dB is a wire and is skipped; a highpass at 0 dB is not.
        const id = window.oaEqAddBand(0, { type: 'highpass', freq: 200, q: 0.707, gain: 0 });
        assert.equal(window.oaEqActive(0), true, 'a highpass was treated as a wire');
        const c = window.oaEqCurve(0);
        assert.ok(atHz(window, c, 20) < -12, `a 200 Hz highpass barely touched 20 Hz: ${atHz(window, c, 20).toFixed(1)} dB`);
        assert.ok(Math.abs(atHz(window, c, 10000)) < 0.1, 'a highpass moved the top end');
        window.oaEqRemoveBand(0, id);
    });

    test('a half-written saved unit still comes up playable', async () => {
        const { window } = await createWarmWorld();
        window.oaPlugin('eq').load({
            units: [{ loGain: 999, midFreq: 'banana', free: [{ type: 'nonsense', freq: -5 }] }],
        });
        const u = window.oaEqUnit(0);
        assert.equal(u.loGain, 18, 'an out-of-range gain was not clamped');
        assert.equal(u.midFreq, 1000, 'a non-numeric frequency did not fall back to its default');
        assert.equal(u.free[0].type, 'peaking', 'an unknown filter type was kept');
        assert.equal(u.free[0].freq, 20, 'a negative frequency was not clamped');
    });
});

/**
 * The unit measured rather than described — PLAN-18.03 step 4.
 *
 * "Verify it headlessly rather than by ear." These render the filter and read
 * the result back, so what is asserted is the behaviour of the coefficients the
 * browser will actually run, not a second reading of the algebra that produced
 * them. No room, no ears, no AudioContext.
 */
describe('the equaliser, rendered', () => {
    const SWEEP = [20, 60, 100, 300, 1000, 3000, 8000, 15000];
    const BANDS = [
        ['a lifted low shelf',   { type: 'lowshelf',  freq: 100,  gain: 6,  q: 0.707 }],
        ['a cut high shelf',     { type: 'highshelf', freq: 8000, gain: -4, q: 0.707 }],
        ['a cutting bell',       { type: 'peaking',   freq: 1000, gain: -9, q: 2 }],
        ['a lowpass',            { type: 'lowpass',   freq: 2000, gain: 0,  q: 0.707 }],
        ['a highpass',           { type: 'highpass',  freq: 200,  gain: 0,  q: 0.707 }],
    ];

    for (const [label, band] of BANDS) {
        test(`${label} sounds like the curve that is drawn for it`, async () => {
            const { window } = await createWarmWorld();
            const sr = window.oaSampleRate();
            for (const hz of SWEEP) {
                const drawn = window.oaEqBandDb(band, hz, sr);
                const heard = renderedDb(window, band, hz, sr);
                assert.ok(Math.abs(drawn - heard) < 0.01,
                    `${label} at ${hz} Hz: the plot says ${drawn.toFixed(3)} dB and the `
                    + `rendered filter measures ${heard.toFixed(3)} dB`);
            }
        });
    }

    test('a notch really does swallow its centre, past the plotting floor', async () => {
        const { window } = await createWarmWorld();
        const sr = window.oaSampleRate();
        const band = { type: 'notch', freq: 1000, gain: 0, q: 4 };

        // The one frequency where the two readings are MEANT to disagree:
        // oaEqBandDb floors at -120 dB so a plot stays finite, while the filter
        // itself keeps going. Asserting the floor and the depth separately is
        // what stops the floor from quietly becoming the whole answer.
        assert.equal(window.oaEqBandDb(band, 1000, sr), -120, 'the plotting floor moved');
        assert.ok(renderedDb(window, band, 1000, sr) < -200,
            'a notch did not actually reach its centre');
        for (const hz of [100, 300, 3000, 15000]) {
            assert.ok(Math.abs(window.oaEqBandDb(band, hz, sr) - renderedDb(window, band, hz, sr)) < 0.01,
                `the notch diverged from its curve at ${hz} Hz, away from the floor`);
        }
    });

    test('every filter the EQ can build is stable', async () => {
        const { window } = await createWarmWorld();
        const sr = window.oaSampleRate();
        const types = ['lowshelf', 'highshelf', 'peaking', 'notch', 'lowpass', 'highpass'];

        // Poles inside the unit circle, by the standard triangle on a
        // normalised biquad. An unstable filter is not a wrong shape, it is a
        // channel that grows without bound. Forcing a peaking pole outside the
        // circle was measured taking eight tests red -- but this is the only one
        // that names WHY, and the only assertion that visits all 270 of the
        // type/frequency/gain/Q corners rather than the handful a shape test
        // needs to make its point.
        for (const type of types) {
            for (const freq of [20, 100, 1000, 10000, 20000]) {
                for (const gain of [-18, 0, 18]) {
                    for (const q of [0.1, 0.707, 18]) {
                        const c = window.oaEqCoeffs({ type, freq, gain, q }, sr);
                        const where = `${type} ${freq}Hz ${gain}dB Q${q}`;
                        assert.ok(Number.isFinite(c.b0 + c.b1 + c.b2 + c.a1 + c.a2),
                            `${where}: a coefficient is not finite`);
                        assert.ok(Math.abs(c.a2) < 1,
                            `${where}: |a2| = ${Math.abs(c.a2).toFixed(4)}, a pole is on or outside the unit circle`);
                        assert.ok(Math.abs(c.a1) < 1 + c.a2,
                            `${where}: |a1| = ${Math.abs(c.a1).toFixed(4)} against 1 + a2 = ${(1 + c.a2).toFixed(4)}`);
                    }
                }
            }
        }
    });

    test('a whole channel renders as the sum of its bands', async () => {
        const { window } = await createWarmWorld();
        const sr = window.oaSampleRate();
        window.oaSetEq(0, 'loFreq', 120);
        window.oaSetEq(0, 'loGain', 6);
        window.oaSetEq(0, 'midFreq', 1000);
        window.oaSetEq(0, 'midQ', 2);
        window.oaSetEq(0, 'midGain', -9);
        window.oaSetEq(0, 'hiGain', 3);

        // Bands run in SERIES, so the rendered decibels of each add up to the
        // channel the display draws. This is the claim `oaEqCurve` makes about
        // a stacked EQ, checked against five separately rendered filters.
        const bands = window.oaEqBands(0).filter((b) => b.on);
        assert.ok(bands.length >= 3, 'the three named bands are not all live');
        for (const hz of SWEEP) {
            const summed = bands.reduce((t, b) => t + renderedDb(window, b, hz, sr), 0);
            const drawn = window.oaEqBandDb(bands[0], hz, sr)
                + bands.slice(1).reduce((t, b) => t + window.oaEqBandDb(b, hz, sr), 0);
            assert.ok(Math.abs(summed - drawn) < 0.02,
                `at ${hz} Hz the rendered channel is ${summed.toFixed(3)} dB `
                + `and the drawn channel is ${drawn.toFixed(3)} dB`);
        }
    });
});

describe('the SPOG bridge lands on the shelf', () => {
    // The receiving half of PLAN-18.12. The orchestrator translates SPOG's
    // protobuf envelope, arbitrates the seat-rank fight and republishes the
    // WINNER in decibels on APK.audio/Gui/DrumKit/<pad>/eq/<key>. Everything
    // below that line is this module, and it is deliberately tiny: parse the
    // topic, read `.value`, call oaSetEq.

    test('a decibel write on a strip topic reaches that pad\'s high shelf', async () => {
        const { window } = await createWarmWorld();
        assert.equal(window.oaEqUnit(0).hiGain, 0, 'the pad did not start flat');

        // 18 dB is what the translator sends for a trim of 1.0 — the value
        // oaEqFromTrim(1) states, converted once, at the other end.
        const took = window.oaEqBridgeApply('APK.audio/Gui/DrumKit/0/eq/hiGain', { value: 18 });
        assert.equal(took, true, 'the bridge refused a topic it owns');
        assert.equal(window.oaEqUnit(0).hiGain, 18);
        assert.equal(window.oaEqActive(0), true, 'a SPOG strip did not change the sound');
    });

    test('the pad in the topic is the pad that moves', async () => {
        const { window } = await createWarmWorld();
        window.oaEqBridgeApply('APK.audio/Gui/DrumKit/2/eq/loGain', { value: -18 });
        assert.equal(window.oaEqUnit(2).loGain, -18);
        assert.equal(window.oaEqUnit(0).loGain, 0, 'a write to pad 2 moved pad 0');
    });

    test('it converts NOTHING — the decibels it is handed are the decibels it sets', async () => {
        const { window } = await createWarmWorld();
        // A trim would be 0.75 here. If this module ever grew its own
        // conversion, 0.75 would arrive as 9 dB instead of being clamped to
        // itself, and the two ends would drift by exactly the mapping.
        window.oaEqBridgeApply('APK.audio/Gui/DrumKit/1/eq/midGain', { value: 0.75 });
        assert.equal(window.oaEqUnit(1).midGain, 0.75);
    });

    test('a topic or a payload it does not own is refused, not guessed at', async () => {
        const { window } = await createWarmWorld();
        for (const topic of [
            'APK.audio/Gui/DrumKit/0/sample',            // the pads' own topic
            'APK.audio/Gui/DrumKit/0/eq/midFreq',        // a param no strip publishes
            'APK.audio/Gui/DrumKit/999/eq/hiGain',       // a pad that does not exist
            'APK.audio/Gui/DrumKit/-1/eq/hiGain',
            'SPOG/x/twists/y/params/ch1-eq-hi',          // the far side of the bridge
        ]) {
            assert.equal(window.oaEqBridgeApply(topic, { value: 12 }), false, topic);
        }
        assert.equal(window.oaEqBridgeApply('APK.audio/Gui/DrumKit/0/eq/hiGain', { value: 'loud' }), false);
        assert.equal(window.oaEqBridgeApply('APK.audio/Gui/DrumKit/0/eq/hiGain', null), false);
        assert.equal(window.oaEqUnit(0).hiGain, 0, 'a refused write moved the shelf anyway');
    });

    test('the door is always there, and it asks for the whole strip range at once', async () => {
        // WHAT THIS CASE USED TO SAY WAS THE OPPOSITE, AND IT WAS GREEN.
        // It asserted `window.oaBusSubscribe === undefined` with the comment
        // "the published site: no broker, so mqttBus never defines the door",
        // and `oaEqBridgeStart() === null` under it. Both were false of the
        // bundle: `mqttBus.js` is entry 1 of `sources.json`, it defines
        // `oaBusSubscribe` at module level unconditionally, and it is loaded
        // long before `oaEqBridge.js` at entry 27. The assertion passed only
        // because the harness's hand-maintained source list did not load
        // `mqttBus.js` at all — PLAN-703.01.
        //
        // "No broker" is about DIALLING, not about the door, which is exactly
        // what oaEqBridge.js's own header says: on the published site this
        // module registers one callback that is never called.
        const { window } = await createWarmWorld();
        assert.equal(typeof window.oaBusSubscribe, 'function',
            'mqttBus.js ships in the bundle; the door is defined whether or not a broker answers');

        let asked = null;
        window.oaBusSubscribe = (filter, cb) => { asked = { filter, cb }; return () => {}; };
        assert.equal(typeof window.oaEqBridgeStart(), 'function');
        assert.equal(asked.filter, 'APK.audio/Gui/DrumKit/+/eq/+');
        assert.equal(asked.cb, window.oaEqBridgeApply);
    });

    test('without the door the bridge stands down rather than throwing', async () => {
        // The guard `if (!window.oaBusSubscribe) return null` is unreachable
        // from the bundle, because mqttBus.js always precedes this file. It is
        // still the module's contract, so it is proved against a world composed
        // WITHOUT mqttBus.js rather than against a false claim about the real one.
        const { window } = await createWarmWorld({
            sources: BACKEND_SOURCES.filter((f) => f !== 'libControl/App/mqttBus.js'),
        });
        assert.equal(window.oaBusSubscribe, undefined);
        assert.equal(window.oaEqBridgeStart(), null);
    });
});
