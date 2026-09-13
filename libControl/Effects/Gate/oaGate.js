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
 * Header: oaGate.js
 * Purpose: A noise gate on every channel — a downward expander with a hold
 *   timer, which is the compressor turned upside down.
 * Description: A compressor turns the signal down when it gets LOUD. A gate
 *   turns it down when it gets QUIET, and for the same reason: to widen the
 *   distance between the part you want and the part you do not. Above the
 *   threshold it does nothing at all; below it, every decibel the signal falls
 *   is multiplied by the RATIO on its way out — at 8:1, a signal 3 dB under the
 *   line comes out 24 dB under it. RANGE is the floor that expansion is allowed
 *   to reach, and range 0 dB is a wire.
 *
 *   WHY THE HOLD TIMER IS FIRST. Every other knob here is forgiving. Hold is
 *   not, because a peak detector reading a periodic signal sees a ZERO CROSSING
 *   twice a cycle: a 40 Hz sine sitting comfortably above the threshold still
 *   falls to nothing every 12.5 ms, and a gate with no hold shuts in each of
 *   those gaps and reopens on the next peak. That is chatter, it is 80 events a
 *   second, and it is audible on every signal it touches — which is why this
 *   file was written hold-first and why gate.test.mjs counts the transitions
 *   rather than describing them.
 *
 *   THREE THINGS STOP CHATTER, AND THEY ARE NOT THE SAME THING:
 *
 *     HOLD       once open, the gate stays open for at least this long after
 *                the signal has fallen through the closing threshold. It covers
 *                the zero crossings of the lowest frequency on the channel.
 *
 *     HYSTERESIS the gate OPENS at the threshold and CLOSES `hyst` decibels
 *                BELOW it. A signal parked exactly on the line therefore has
 *                nowhere to chatter to: having opened, it will not close until
 *                the channel has genuinely dropped away. Two thresholds, not
 *                one — the same trick a thermostat uses, for the same reason.
 *
 *     RELEASE    the ballistic. It smooths what the state machine decided; it
 *                cannot rescue a decision that was wrong 80 times a second.
 *
 *   ATTACK IS THE OPENING TIME, RELEASE IS THE CLOSING TIME. That is the
 *   opposite sense to the compressor next door, where attack is the time to
 *   turn DOWN — and it is the right way round for both, because on each unit
 *   attack is the time to get out of the way of the signal arriving. A slow
 *   gate attack clips the front off a stick hit, which is the one defect a drum
 *   channel cannot afford, so every drum preset here opens in under half a
 *   millisecond.
 *
 *   THE TIMES ARE IN MILLISECONDS AND THE PANEL SAYS SO. The compressor's two
 *   time knobs run backwards and exponentially because the box it is an homage
 *   to did; there is no such original here, and `DynamicsEnvelope` — the panel
 *   that draws an attack, a hold and a release stage — plots milliseconds. One
 *   unit, all the way through.
 *
 *   WHERE THE SMOOTHING GOES: on the REDUCTION, in decibels, exactly as
 *   oaCompressor.js does it. The static curve is evaluated instantly on the
 *   rectified peak and the ballistics are applied to the number of decibels of
 *   attenuation on its way to that target, so the knobs mean what the panel
 *   says and the ratio stays honest across the whole envelope.
 *
 *   STEREO IS LINKED. One detector reads the louder of the two channels and
 *   both are shut together. Gating the sides independently makes a quiet
 *   hard-panned tail vanish from one speaker only, which is worse than either
 *   keeping it or losing it.
 *
 *   NO WORKLET, NO GATE — AND IT SAYS SO. Unlike the compressor there is no
 *   native node that expands, so a browser without AudioWorklet gets a
 *   pass-through, and the frame's ACTIVE slot reports 0 so the panel greys
 *   rather than claiming to be gating something. A surface reporting success
 *   with no measured consequence is the defect this tree keeps naming.
 *
 *   WHERE IT SITS: after the pan and BEFORE the compressor, which oaFxBus.js
 *   decides and this file does not. Gate then compress is the console order —
 *   a compressor in front of a gate spends its time lifting the noise floor the
 *   gate was going to remove, and then the gate has to chase a moving target.
 *
 *   TRANSPARENT UNTIL ASKED: a channel that has never been gated builds no
 *   nodes at all and connects on to its destination exactly as it did before.
 */

/** The colour the strip is labelled in, wherever the gate appears. */
window.OA_GATE_COLOR = '#9ad17f';

const gateDb = function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'; };
const gateMs = function (v) {
    return v >= 1000 ? (v / 1000).toFixed(2) + ' s'
        : v >= 10 ? Math.round(v) + ' ms'
        : v.toFixed(2) + ' ms';
};

/**
 * The front panel. `ticks` are the numbers engraved around the knob's collar —
 * evenly spaced across the travel, low end first, and a LEGEND rather than an
 * enumeration (see oaPlugin.js). Every one of these is a magnitude, so every
 * one declares `kind: 'continuous'`: there is not a detent on this faceplate.
 */
window.OA_GATE_PARAMS = [
    {
        key: 'thresh', kind: 'continuous', label: 'Threshold', min: -80, max: 0, def: -40, fmt: gateDb,
        ticks: ['-80', '-60', '-40', '-20', '0'],
        hint: 'Where the gate OPENS. It closes lower — see Hysteresis.',
    },
    {
        key: 'range', kind: 'continuous', label: 'Range', min: -80, max: 0, def: -60, fmt: gateDb,
        ticks: ['-80', '-60', '-40', '-20', '0'],
        hint: 'How far down a shut gate turns the channel. 0 dB is a wire; -12 ducks the spill without cutting a tail off.',
    },
    {
        key: 'ratio', kind: 'continuous', label: 'Ratio', min: 1, max: 20, def: 8,
        ticks: ['1', '5', '10', '15', '20'],
        fmt: function (v) { return v.toFixed(1) + ':1'; },
        hint: 'The slope below the threshold. 1 is no expansion at all, 20 is effectively a switch.',
    },
    {
        key: 'knee', kind: 'continuous', label: 'Knee', min: 0, max: 24, def: 6, fmt: gateDb,
        ticks: ['0', '6', '12', '18', '24'],
        hint: 'How wide a bend joins "open" to "expanding". A corner is a discontinuity in the gain, and a discontinuity is a click.',
    },
    {
        key: 'hyst', kind: 'continuous', label: 'Hysteresis', min: 0, max: 12, def: 3, fmt: gateDb,
        ticks: ['0', '3', '6', '9', '12'],
        hint: 'How far BELOW the threshold the gate closes. This is what stops a signal parked on the line from chattering.',
    },
    {
        key: 'attack', kind: 'continuous', label: 'Attack', min: 0.05, max: 50, def: 1, fmt: gateMs,
        ticks: ['0.05', '10', '20', '30', '40', '50'],
        hint: 'Time to OPEN. Slow clips the front off a stick hit; drums want under half a millisecond.',
    },
    {
        key: 'hold', kind: 'continuous', label: 'Hold', min: 0, max: 500, def: 40, fmt: gateMs,
        ticks: ['0', '100', '200', '300', '400', '500'],
        hint: 'How long it stays open after the signal drops. Must outlast one cycle of the lowest note on the channel or the gate chatters.',
    },
    {
        key: 'release', kind: 'continuous', label: 'Release', min: 5, max: 2000, def: 200, fmt: gateMs,
        ticks: ['5', '500', '1000', '1500', '2000'],
        hint: 'Time to CLOSE once the hold has run out. Fast cuts tails off; slow leaves the spill in.',
    },
];

// ---------------------------------------------------------------------------
// The static curve — one statement of it, shared by the DSP and the plot
// ---------------------------------------------------------------------------

/**
 * How many decibels of attenuation a steady input of `db` dBFS earns, given a
 * threshold, a ratio, a knee width and a range floor. Never negative: a gate
 * turns things down and never up.
 *
 * The knee is the compressor's parabola MIRRORED. With `over = db - thresh` and
 * `half = knee/2`:
 *
 *     over >= +half   nothing happens
 *     over <= -half   the full ratio applies, so reduction = -over * (ratio-1)
 *     between         a parabola joining the two, matching both value and slope
 *                     at each end — which is what stops the click.
 *
 * THIS IS THE ONLY PLACE THE TRANSFER FUNCTION IS WRITTEN. The worklet below
 * evaluates the same three lines per sample (a worklet is a source string in
 * another realm and cannot call in here), and `gate.test.mjs` asserts the two
 * agree by RENDERING the worklet and comparing — because the panel plots this
 * one, and a plot that disagrees with the sound is worse than no plot.
 */
window.oaGateReductionDb = function (db, thresh, ratio, knee, range) {
    const slope = Math.max(0, ratio - 1);
    const half = Math.max(0, knee) * 0.5;
    const over = db - thresh;
    let red;
    if (over >= half) red = 0;
    else if (over <= -half || half <= 0) red = -over * slope;
    else red = slope * (over - half) * (over - half) / (2 * knee);
    const depth = -Math.min(0, range);
    return red > depth ? depth : red;
};

/** The plotted transfer curve runs from here to 0 dBFS, one point per decibel. */
window.OA_GATE_CURVE_LO = -96;
window.OA_GATE_CURVE_POINTS = 97;

/** The input level, in dBFS, that curve point `i` was measured at. */
window.oaGateCurveDb = function (i) {
    const n = window.OA_GATE_CURVE_POINTS;
    const k = Math.max(0, Math.min(n - 1, i));
    return window.OA_GATE_CURVE_LO + k * (-window.OA_GATE_CURVE_LO / (n - 1));
};

/**
 * The channel's transfer function: OUTPUT dBFS against input dBFS, 97 points.
 *
 * Returns a Float32Array the back end owns and reuses. Read it, plot it, do not
 * write it — the same contract as the drive pedal's table and the EQ's
 * response.
 *
 * It is the STATIC curve, so it is what the gate settles to and not what it
 * does on the way there; the hold timer and the ballistics are a picture in
 * time, which is the other panel's job.
 */
const GATE_CURVES = {};
window.oaGateCurve = function (idx) {
    const n = window.OA_GATE_CURVE_POINTS;
    if (!GATE_CURVES[idx]) GATE_CURVES[idx] = new Float32Array(n);
    const out = GATE_CURVES[idx];
    const u = window.oaGateUnit(idx);
    const on = window.oaGateActive(idx);
    for (let i = 0; i < n; i++) {
        const db = window.oaGateCurveDb(i);
        out[i] = on ? db - window.oaGateReductionDb(db, u.thresh, u.ratio, u.knee, u.range) : db;
    }
    return out;
};

// ---------------------------------------------------------------------------
// The stored unit
// ---------------------------------------------------------------------------

// Fill in whatever a saved unit is missing and drop anything out of range, so a
// hand-edited or half-written localStorage entry still comes up playable.
const gateUnit = function (saved) {
    const s = saved || {};
    const out = { on: !!s.on };
    window.OA_GATE_PARAMS.forEach(function (p) {
        const v = Number(s[p.key]);
        out[p.key] = isFinite(v) ? Math.max(p.min, Math.min(p.max, v)) : p.def;
    });
    return out;
};

window.OA_GATE = (function () {
    let saved = null;
    try { saved = JSON.parse(window.localStorage.getItem('oaGate')); } catch (e) {}
    const units = (saved && Array.isArray(saved.units)) ? saved.units : [];
    // Sized for the LARGEST grid, like every other per-channel array, so
    // shrinking the pad layout and growing it back finds pad 25's settings.
    const out = [];
    for (let i = 0; i < window.OA_PAD_MAX; i++) out.push(gateUnit(units[i]));
    return { units: out };
})();

window.oaGateUnit = function (idx) {
    return window.OA_GATE.units[idx] || window.OA_GATE.units[0];
};

window.oaSaveGate = function () {
    try {
        window.localStorage.setItem('oaGate', JSON.stringify({
            units: window.OA_GATE.units.map(function (u) {
                const o = { on: u.on };
                window.OA_GATE_PARAMS.forEach(function (p) { o[p.key] = u[p.key]; });
                return o;
            })
        }));
    } catch (e) {}
};

/**
 * Is this channel's gate doing anything at all? Range 0 dB is a wire even with
 * the switch in — the same lever the compressor's blend knob is.
 */
window.oaGateActive = function (idx) {
    const u = window.oaGateUnit(idx);
    return !!u.on && u.range < -0.0005;
};

// ---------------------------------------------------------------------------
// The worklet. Shipped as a source string and registered from a Blob URL: the
// whole app is one compiled bundle, and a worklet module has to be a separate
// fetchable file. Registered alongside the tape echo by oaPrepareFx().
// ---------------------------------------------------------------------------

const OA_GATE_WORKLET_SRC = `
class OaGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'thresh',  defaultValue: -40,   minValue: -90,     maxValue: 0,    automationRate: 'k-rate' },
      { name: 'range',   defaultValue: -60,   minValue: -90,     maxValue: 0,    automationRate: 'k-rate' },
      { name: 'ratio',   defaultValue: 8,     minValue: 1,       maxValue: 20,   automationRate: 'k-rate' },
      { name: 'knee',    defaultValue: 6,     minValue: 0,       maxValue: 24,   automationRate: 'k-rate' },
      { name: 'hyst',    defaultValue: 3,     minValue: 0,       maxValue: 24,   automationRate: 'k-rate' },
      { name: 'attack',  defaultValue: 0.001, minValue: 0.00005, maxValue: 0.05, automationRate: 'k-rate' },
      { name: 'hold',    defaultValue: 0.04,  minValue: 0,       maxValue: 0.5,  automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.2,   minValue: 0.005,   maxValue: 2,    automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.red = 0;         // attenuation currently applied, in dB (never negative)
    // A GATE COMES UP SHUT. The attenuation cannot be initialised in here
    // because the depth it should start at is the RANGE parameter, which does
    // not exist until the first process() call — so the first block sets it,
    // once. A gate that came up open would pass a block of whatever the channel
    // is carrying before it closed, and on a session restore that is a burst of
    // room tone at full level; it would also make the attack knob unmeasurable
    // on the first hit, which is exactly how this was found.
    this.primed = false;
    this.redPeak = 0;     // deepest attenuation since the last report
    this.open = false;    // the state machine's decision, not the gain
    this.holdLeft = 0;    // seconds of hold still owed, counted down per sample
    // Every OPEN -> CLOSED edge this processor has ever made. Chatter is a
    // NUMBER, and this is the number: gate.test.mjs holds a signal on the
    // threshold, runs a second of audio through and asserts this stays small.
    // It is deliberately monotonic and never reset — a counter that something
    // clears is a counter a test can be fooled by.
    this.closes = 0;
    this.blocks = 0;
    this.lastSent = -1;
  }

  // Report the meter back to the panel. Throttled to roughly every 20ms, and
  // silent once the channel has settled wide open — sixteen channels posting a
  // message per 128 samples would be a message every 0.36ms.
  report() {
    const v = Math.round(this.redPeak * 100) / 100;
    if (v === 0 && this.lastSent === 0) return;
    this.lastSent = v;
    this.port.postMessage({ gr: v, open: this.open ? 1 : 0 });
  }

  process(inputs, outputs, params) {
    const output = outputs[0];
    if (!output || !output.length) return true;
    const outL = output[0];
    const outR = output[1] || output[0];
    const n = outL.length;

    const input = inputs[0];
    const inL = (input && input.length) ? input[0] : null;
    const inR = (input && input.length > 1) ? input[1] : inL;

    if (!inL) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      this.report();
      return true;
    }

    const range = params.range[0];

    // Range at 0 dB is a wire — a shut gate would attenuate by nothing. Copy it
    // through rather than running a state machine over arithmetic that cannot
    // change a sample.
    if (range >= -1e-6) {
      outL.set(inL);
      if (outR !== outL) outR.set(inR || inL);
      this.red = 0;
      this.redPeak = 0;
      this.open = true;
      this.report();
      return true;
    }

    const thresh = params.thresh[0];
    const closeAt = thresh - params.hyst[0];
    const ratio = params.ratio[0];
    const knee = params.knee[0];
    const hold = params.hold[0];
    const slope = ratio - 1 > 0 ? ratio - 1 : 0;
    const half = knee * 0.5;
    const depth = -range;

    // One-pole coefficients. A time constant of t seconds reaches ~63% of the
    // way to its target in t; that is the standard definition and it is what
    // the numbers on the panel mean. ATTACK is the OPENING time here.
    const aCoef = 1 - Math.exp(-1 / Math.max(1, params.attack[0] * sampleRate));
    const rCoef = 1 - Math.exp(-1 / Math.max(1, params.release[0] * sampleRate));
    const dt = 1 / sampleRate;

    if (!this.primed) { this.primed = true; this.red = depth; }

    let red = this.red;
    let open = this.open;
    let holdLeft = this.holdLeft;
    let peak = this.redPeak;

    for (let i = 0; i < n; i++) {
      const l = inL[i];
      const r = inR ? inR[i] : l;

      // STEREO-LINKED PEAK DETECTION. The louder side decides for both.
      const al = l > 0 ? l : -l;
      const ar = r > 0 ? r : -r;
      const det = al > ar ? al : ar;
      const db = det > 1e-9 ? 8.6858896 * Math.log(det) : -180;   // 20*log10(x)

      // THE STATE MACHINE. Two thresholds and one timer, in that order:
      // anything at or above the OPENING threshold opens the gate and recharges
      // the hold; below the CLOSING threshold the timer runs down and the gate
      // shuts when it reaches zero; and BETWEEN the two the last decision
      // stands, which is the whole of what hysteresis means.
      if (db >= thresh) {
        open = true;
        holdLeft = hold;
      } else if (open && db < closeAt) {
        if (holdLeft > 0) holdLeft -= dt;
        else { open = false; this.closes++; }
      }

      // The static curve, evaluated instantly on the rectified peak — no
      // smoothing here. The ballistics go on the attenuation, two lines down.
      // An OPEN gate is out of the way entirely: the hold timer's whole job is
      // to keep the curve from being applied during a zero crossing.
      let target;
      if (open) target = 0;
      else {
        const over = db - thresh;
        if (over >= half) target = 0;
        else if (over <= -half || half <= 0) target = -over * slope;
        else target = slope * (over - half) * (over - half) / (2 * knee);
        if (target > depth) target = depth;
      }

      // ATTACK when the gate is opening (attenuation falling toward zero),
      // RELEASE when it is closing. This is the opposite sense to the
      // compressor, and it is the right way round on both.
      red += (target - red) * (target < red ? aCoef : rCoef);
      if (red > peak) peak = red;

      // dB of attenuation back to a linear multiplier: 10^(-red/20).
      const g = Math.exp(-0.11512925 * red);
      outL[i] = l * g;
      if (outR !== outL) outR[i] = r * g;
    }

    this.red = red;
    this.open = open;
    this.holdLeft = holdLeft;
    this.redPeak = peak;
    this.blocks++;
    if (this.blocks >= 4) {
      this.blocks = 0;
      this.report();
      // Decay the reported peak rather than resetting it, so the meter falls
      // smoothly between reports instead of flickering to zero and back.
      this.redPeak = red;
    }
    return true;
  }
}
registerProcessor('oa-gate', OaGate);
`;

let oaGateUrl = null;
// Read by oaPrepareFx() in oaTapeDelay.js, which registers every worklet module
// the effects need in one pass on first use of a context.
window.oaGateModuleUrl = function () {
    if (!oaGateUrl) {
        oaGateUrl = URL.createObjectURL(new Blob([OA_GATE_WORKLET_SRC], { type: 'application/javascript' }));
    }
    return oaGateUrl;
};

// The live values behind the panel, resolved through the on/off switch. One
// place, so the worklet and the panel's plotted curve cannot drift.
//
// The switch and the RANGE knob are the same lever as far as the DSP is
// concerned: at 0 dB a shut gate attenuates by nothing and the output is the
// input, sample for sample.
const gateSettings = function (unit) {
    const on = !!unit.on;
    return {
        thresh: unit.thresh,
        range: on ? unit.range : 0,
        ratio: unit.ratio,
        knee: unit.knee,
        hyst: unit.hyst,
        // The panel counts in milliseconds; the DSP counts in seconds.
        attack: unit.attack / 1000,
        hold: unit.hold / 1000,
        release: unit.release / 1000,
    };
};

const workletEngine = function (ctx, unit, bus) {
    const node = new AudioWorkletNode(ctx, 'oa-gate', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
    });
    const s = gateSettings(unit);
    Object.keys(s).forEach(function (k) {
        const p = node.parameters.get(k);
        if (p) p.value = s[k];
    });
    node.port.onmessage = function (e) {
        const d = e.data || {};
        bus.gr = d.gr || 0;
        bus.open = !!d.open;
    };

    return {
        input: node,
        output: node,
        gating: true,
        apply: function (u) {
            const next = gateSettings(u);
            const t = ctx.currentTime;
            Object.keys(next).forEach(function (k) {
                const p = node.parameters.get(k);
                // Short enough to feel immediate, long enough that dragging a
                // knob is a slide rather than a staircase of zipper noise.
                if (p) p.setTargetAtTime(next[k], t, 0.02);
            });
        },
    };
};

let warnedNoWorklet = false;
/**
 * The fallback, and it is a WIRE — said out loud rather than approximated.
 *
 * The compressor can fall back on the browser's own DynamicsCompressorNode
 * because the spec ships one. There is no expander node and no way to build a
 * per-sample state machine out of native nodes, so the honest answer on a
 * browser without AudioWorklet is that this channel is not gated. `gating` is
 * false, the frame's ACTIVE slot follows it, and the panel greys — which is the
 * difference between a missing feature and a silent one.
 */
const nativeEngine = function (ctx) {
    if (!warnedNoWorklet) {
        warnedNoWorklet = true;
        console.warn('⚠️ [Gate] no AudioWorklet on this context — the gate is a wire here.');
    }
    const node = ctx.createGain();
    return {
        input: node,
        output: node,
        gating: false,
        apply: function () {},
    };
};

/**
 * The channel's gate, built once per AudioContext and shared by every voice on
 * that channel — which is the point. A gate built per hit would start closed
 * every time and spend its attack time on each note, so a fast run would be
 * chopped at the front and the hold knob would have nothing to act on.
 *
 * Returns null for a channel that has never been switched on, and the caller
 * connects to `dest` exactly as it did before. Once built the strip stays:
 * switching the unit off sets its range to 0 dB, which passes the input through
 * untouched rather than tearing a live node out of a running graph.
 *
 * THE DESTINATION IS FIXED AT BUILD TIME, and that is not an oversight — one
 * strip serves every voice on the channel, so there is exactly one answer to
 * where it goes and the router (oaFxBus.js) is the only thing that knows it.
 * Later calls hand back the strip that exists and ignore `dest`.
 */
const gateStrip = function (ctx, idx, dest) {
    const strips = ctx.__oaGates || (ctx.__oaGates = []);
    if (strips[idx]) return strips[idx];
    if (!window.oaGateActive(idx)) return null;

    const unit = window.oaGateUnit(idx);
    const input = ctx.createGain();
    const output = ctx.createGain();
    output.connect(dest || (window.oaMasterInput ? window.oaMasterInput(ctx) : ctx.destination));

    const bus = { input: input, output: output, engine: null, gr: 0, open: false, analyser: null };

    try {
        // A voice may be built before the module has finished registering. The
        // wire is synchronous and always available, so an unresolved worklet
        // falls back rather than leaving the channel silent while it waits —
        // which on an OfflineAudioContext would be the whole render.
        bus.engine = ctx.__oaWorkletOk ? workletEngine(ctx, unit, bus) : nativeEngine(ctx);
    } catch (e) {
        console.warn('⚠️ [Gate] worklet node failed, passing through:', e && e.message);
        bus.engine = nativeEngine(ctx);
    }
    input.connect(bus.engine.input);
    bus.engine.output.connect(output);

    if (ctx.createAnalyser) {
        const a = ctx.createAnalyser();
        a.fftSize = 1024;
        output.connect(a);
        bus.analyser = a;
    }

    strips[idx] = bus;
    return bus;
};

// ---------------------------------------------------------------------------
// THE AUDIO PORTS.
//
// The strip builder and the strip object are FILE-LOCAL. A channel gets back a
// node to play into, or null meaning "there is no gate here, carry on to the
// destination as you were" — the same answer the DRIVE pedal and the EQ give,
// so the router treats every optional insert the same way.
// ---------------------------------------------------------------------------

/**
 * THE INPUT PORT for channel `idx`, or null when this channel has never been
 * switched on. Null is a real answer, not a failure: it is what keeps an
 * ungated channel's graph exactly as it was before this file existed.
 */
window.oaGateInput = function (ctx, idx, dest) {
    const bus = gateStrip(ctx, idx, dest);
    return bus ? bus.input : null;
};

/**
 * Build every strip that is switched on, once the worklet answer is in.
 * `destFor(i)` is asked where channel i's gate should go; the router owns that
 * answer because the router owns the channel order.
 */
window.oaGateWarm = function (ctx, destFor) {
    for (let i = 0; i < window.OA_PAD_MAX; i++) {
        gateStrip(ctx, i, destFor ? destFor(i) : null);
    }
};

/** How many strips exist on this context — for the voice diagnostic. */
window.oaGateStripCount = function (ctx) {
    return ((ctx && ctx.__oaGates) || []).filter(Boolean).length;
};

/** Attenuation on this channel right now, in dB. 0 when nothing is running. */
window.oaGateGR = function (idx) {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaGates && ctx.__oaGates[idx];
    return bus ? Math.max(0, bus.gr || 0) : 0;
};

/** Is the gate on this channel open right now? */
window.oaGateIsOpen = function (idx) {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaGates && ctx.__oaGates[idx];
    return !!(bus && bus.open);
};

const pushToBus = function (idx) {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaGates && ctx.__oaGates[idx];
    if (bus && bus.engine) bus.engine.apply(window.oaGateUnit(idx));
};

window.oaSetGate = function (idx, key, value) {
    const u = window.oaGateUnit(idx);
    if (key === 'on') u.on = !!value;
    else {
        const p = window.OA_GATE_PARAMS.find(function (q) { return q.key === key; });
        if (!p) return;
        const v = Number(value);
        u[key] = Math.max(p.min, Math.min(p.max, isFinite(v) ? v : p.def));
    }
    window.oaSaveGate();
    pushToBus(idx);
    window.dispatchEvent(new CustomEvent('oa-gate-changed', { detail: { idx: idx, key: key } }));
};

window.oaApplyGatePreset = function (idx, name) {
    const preset = window.OA_GATE_PRESETS[name];
    if (!preset) return;
    const u = window.oaGateUnit(idx);
    u.on = !!preset.on;
    window.OA_GATE_PARAMS.forEach(function (p) {
        if (typeof preset[p.key] === 'number') u[p.key] = Math.max(p.min, Math.min(p.max, preset[p.key]));
    });
    window.oaSaveGate();
    pushToBus(idx);
    window.dispatchEvent(new CustomEvent('oa-gate-changed', { detail: { idx: idx, preset: name } }));
};

/**
 * Tear every strip out of a context. Called when a context is closed and by the
 * leak tests: a channel strip outlives a voice, so if anything here holds on,
 * this is where it shows.
 */
window.oaDisposeGate = function (ctx) {
    const strips = ctx && ctx.__oaGates;
    if (!strips) return;
    strips.forEach(function (bus) {
        if (!bus) return;
        // The worklet's message port keeps a reference to `bus` through the
        // onmessage closure. Cutting it is what actually lets the strip go.
        if (bus.engine && bus.engine.input && bus.engine.input.port) {
            bus.engine.input.port.onmessage = null;
        }
        window.oaDisconnectAll([
            bus.input, bus.output, bus.analyser,
            bus.engine && bus.engine.input,
            bus.engine && bus.engine.output,
        ]);
    });
    strips.length = 0;
};

// ---------------------------------------------------------------------------
// The back end, as the front panel sees it. Everything above this line is DSP;
// everything the editor is allowed to touch is declared here. See oaPlugin.js.
// ---------------------------------------------------------------------------

window.oaRegisterPlugin({
    id: 'gate',
    label: 'Gate',
    event: 'oa-gate-changed',
    units: function () { return window.OA_PAD_MAX; },
    params: window.OA_GATE_PARAMS,
    presets: window.OA_GATE_PRESETS,
    state: function (i) { return window.oaGateUnit(i); },
    set: function (i, key, value) { window.oaSetGate(i, key, value); },
    preset: function (i, name) { window.oaApplyGatePreset(i, name); },

    // Two measurements the shared four do not already cover, and they are not
    // the same thing: GR is where the gain ended up, OPEN is what the state
    // machine decided. A panel that draws only GR cannot tell a gate holding
    // open on a decaying tail from one that has already shut and is releasing.
    slots: window.OA_SLOT.USER + 2,
    layout: {
        GR: window.OA_SLOT.USER,
        OPEN: window.OA_SLOT.USER + 1,
    },

    read: function (ctx, i, frame) {
        const S = window.OA_SLOT;
        const bus = ctx && ctx.__oaGates && ctx.__oaGates[i];
        // ACTIVE follows the ENGINE, not the switch: a context with no
        // AudioWorklet has a wire here, and saying otherwise would be a panel
        // reporting a process that is not running.
        const gating = !!(bus && bus.engine && bus.engine.gating);
        frame[S.ACTIVE] = (window.oaGateActive(i) && gating) ? 1 : 0;
        if (!bus) {
            frame[S.PEAK_L] = 0;
            frame[S.PEAK_R] = 0;
            frame[S.USER] = 0;
            frame[S.USER + 1] = 0;
            return;
        }
        // One analyser on the strip output, so both sides read the same number.
        // Honest: the DSP is stereo-linked, and a split meter here would show a
        // difference the gate deliberately does not create.
        const peak = window.oaAnalyserPeak(bus.analyser);
        window.oaWritePeak(frame, S.PEAK_L, peak);
        window.oaWritePeak(frame, S.PEAK_R, peak);
        frame[S.USER] = window.oaGateGR(i);
        frame[S.USER + 1] = bus.open ? 1 : 0;
    },

    /** The static transfer curve: output dBFS against input dBFS, 97 points. */
    curve: function (i) { return window.oaGateCurve(i); },

    dispose: window.oaDisposeGate,

    /** Every channel's gate, including the ones switched off. */
    save: function () {
        return {
            units: window.OA_GATE.units.map(function (u) {
                const o = { on: u.on };
                window.OA_GATE_PARAMS.forEach(function (p) { o[p.key] = u[p.key]; });
                return o;
            }),
        };
    },

    /**
     * Put them back through oaSetGate(), which clamps, persists, pushes the new
     * values at whichever engine is running and fires the change event.
     *
     * `on` goes LAST, for the same reason the compressor's does: every other
     * setter pushes to the bus, and pushing a half-loaded strip that is already
     * switched on means the channel is briefly gated by a mixture of the old
     * settings and the new ones — and a gate caught mid-import with the old
     * threshold and the new range is silence, which is very audible.
     */
    load: function (data) {
        const units = Array.isArray(data && data.units) ? data.units : [];
        units.slice(0, window.OA_PAD_MAX).forEach(function (u, i) {
            if (!u) return;
            window.OA_GATE_PARAMS.forEach(function (p) {
                if (u[p.key] !== undefined) window.oaSetGate(i, p.key, u[p.key]);
            });
            window.oaSetGate(i, 'on', !!u.on);
        });
    },
});
