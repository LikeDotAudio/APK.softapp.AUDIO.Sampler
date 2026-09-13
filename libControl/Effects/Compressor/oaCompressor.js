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
 * Header: oaCompressor.js
 * Purpose: A FET limiting amplifier on every channel — an automatic volume
 *   control that pulls the peaks down so the whole channel can come up.
 * Description: A compressor is a volume fader that rides itself. Below a
 *   threshold it does nothing at all; above it, it turns the signal down by a
 *   fraction of however far over the line the signal went. That fraction is the
 *   RATIO: at 4:1, four decibels over the threshold are allowed out as one, so
 *   the loud parts stop running away from the quiet parts. Squash the peaks and
 *   the average level can be raised — which is the OUTPUT knob's whole job — so
 *   the channel ends up louder and steadier without ever clipping.
 *
 *   The classic this is modelled on has no threshold knob. The threshold is
 *   fixed inside the box and INPUT drives the signal into it: turn the input up
 *   and more of the waveform crosses the line, so the unit works harder. That
 *   is why the input and output knobs are always turned in opposite directions
 *   — one decides how much squashing happens, the other puts back the level the
 *   squashing took away.
 *
 *   The two time knobs are where the character lives:
 *
 *     ATTACK    How long the gain takes to come down once the signal crosses.
 *               Fast (20µs) catches the very front of a stick hit and softens
 *               it. Slow (800µs) lets the transient punch through untouched and
 *               only clamps the body behind it — which is how you make a drum
 *               hit HARDER with a compressor instead of duller.
 *
 *     RELEASE   How long the gain takes to come back after the signal drops.
 *               Too fast and the noise floor breathes up and down between hits
 *               (pumping). Too slow and one loud hit holds the channel down
 *               through everything after it.
 *
 *               Both knobs run BACKWARDS, like the original: fully clockwise is
 *               the FASTEST setting, not the slowest.
 *
 *     ALL       Every ratio button pushed in at once. On the real unit that was
 *               a fault condition people fell in love with: the threshold
 *               collapses, the knee smears, the attack lags behind itself and
 *               the whole thing pumps and distorts. Modelled here as ratio 20
 *               with the threshold dropped ~12dB, a very wide knee and a lagged
 *               attack.
 *
 *   WHERE THE SMOOTHING GOES. The textbook version smooths the detected LEVEL
 *   and derives a gain from it. This smooths the GAIN REDUCTION instead: the
 *   static curve is evaluated instantly on the rectified peak, and the attack
 *   and release constants are applied to the number of decibels of reduction on
 *   its way to that target. It costs the same and it is better behaved — the
 *   knobs then mean exactly what the panel says they mean ("time for the gain
 *   to come down"), and the ratio stays honest at every point of the envelope
 *   rather than drifting while the level detector catches up.
 *
 *   STEREO IS LINKED. One detector reads the louder of the two channels and
 *   both are turned down together. Compressing the sides independently makes a
 *   hard-panned hit shove the image sideways every time it lands.
 *
 *   The DSP runs in an AudioWorklet, per sample, off the main thread; where
 *   worklets are unavailable it falls back to the browser's own compressor node
 *   wired into the same topology. See oaFxBus.js for where it sits in the
 *   channel: after the DRIVE pedal and after the pan, as an insert on the dry
 *   path. The effect sends are tapped ahead of it, so the reverbs and the tapes
 *   are fed the channel's natural dynamics while the direct sound is squashed.
 *
 *   TRANSPARENT UNTIL ASKED: a channel that has never been compressed builds no
 *   nodes at all and connects to the output exactly as it did before.
 */

// The colour the strip is labelled in, wherever it appears — the mixer's
// COMPRESS button, the panel title, the in-circuit lamp. Kept as the theme
// accent rather than a fixed orange so it stays with the faceplate when the
// colour picker moves. Used only in CSS positions, which is what lets a var()
// stand in for a hex here.
window.OA_COMP_COLOR = 'var(--accent)';

// How far apart the two ends of each time knob are. Straight off the original's
// spec sheet: 20-800 microseconds of attack, 50-1100 milliseconds of release.
const OA_COMP_ATK_SLOW = 0.0008;
const OA_COMP_ATK_FAST = 0.00002;
const OA_COMP_REL_SLOW = 1.1;
const OA_COMP_REL_FAST = 0.05;

// Both time knobs are swept exponentially and BACKWARDS — 0 is the slow end
// (fully counter-clockwise) and 1 is the fast end (fully clockwise). Linear
// travel would spend most of the knob between 600 and 800 microseconds, where
// nothing audible happens; the ear hears time constants as ratios.
window.oaCompAttackTime = function (n) {
    return OA_COMP_ATK_SLOW * Math.pow(OA_COMP_ATK_FAST / OA_COMP_ATK_SLOW, Math.max(0, Math.min(1, n)));
};
window.oaCompReleaseTime = function (n) {
    return OA_COMP_REL_SLOW * Math.pow(OA_COMP_REL_FAST / OA_COMP_REL_SLOW, Math.max(0, Math.min(1, n)));
};

const dbFmt = function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'; };

/**
 * The front panel. `ticks` are the numbers engraved around the knob's collar —
 * evenly spaced across the travel, low end first.
 */
window.OA_COMP_PARAMS = [
    {
        key: 'input', kind: 'continuous', label: 'Input', min: -12, max: 36, def: 0, fmt: dbFmt,
        ticks: ['-12', '-6', '0', '6', '12', '18', '24', '30', '36'],
        hint: 'How hard the signal is driven into a fixed threshold. This IS the threshold control.',
    },
    {
        key: 'output', kind: 'continuous', label: 'Output', min: -24, max: 24, def: 0, fmt: dbFmt,
        ticks: ['-24', '-18', '-12', '-6', '0', '6', '12', '18', '24'],
        hint: 'Makeup gain — put back the level the compression took away.',
    },
    {
        key: 'attack', kind: 'continuous', label: 'Attack', min: 0, max: 1, def: 0.45,
        ticks: ['1', '2', '3', '4', '5', '6', '7'],
        fmt: function (v) {
            const us = window.oaCompAttackTime(v) * 1e6;
            return us >= 1000 ? (us / 1000).toFixed(2) + ' ms' : Math.round(us) + ' µs';
        },
        hint: 'Time to clamp down. Clockwise is FASTER. Slow lets the transient through first.',
    },
    {
        key: 'release', kind: 'continuous', label: 'Release', min: 0, max: 1, def: 0.5,
        ticks: ['1', '2', '3', '4', '5', '6', '7'],
        fmt: function (v) {
            const ms = window.oaCompReleaseTime(v) * 1000;
            return ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : Math.round(ms) + ' ms';
        },
        hint: 'Time to let go again. Clockwise is FASTER. Too fast and the channel breathes.',
    },
    {
        key: 'mix', kind: 'continuous', label: 'Blend', min: 0, max: 1, def: 1,
        ticks: ['0', '25', '50', '75', '100'],
        fmt: function (v) { return Math.round(v * 100) + '%'; },
        hint: 'Wet against the untouched channel. Below 100% is parallel compression: the peaks are controlled but the transients survive underneath.',
    },
];

/**
 * The ratio buttons. The threshold is the same for all four numbered settings —
 * it has to be, or the buttons stop meaning what they say: give 8:1 a higher
 * threshold than 20:1 and there are input levels where pressing the HARDER
 * ratio compresses LESS, which is indefensible on a panel with no threshold
 * knob to explain it with. What does change with the ratio is the KNEE: a
 * gentle setting eases in over a wide bend, a limiter snaps to its ceiling.
 *
 * `lag` multiplies the attack constant and is 1 everywhere except ALL.
 */
window.OA_COMP_RATIOS = [
    { key: '4',  label: '4',  ratio: 4,  thresh: -24, knee: 9,  lag: 1,
      hint: '4:1 — gentle. Levels a part without announcing itself.' },
    { key: '8',  label: '8',  ratio: 8,  thresh: -24, knee: 7,  lag: 1,
      hint: '8:1 — firm. You can hear it working, and that is the point.' },
    { key: '12', label: '12', ratio: 12, thresh: -24, knee: 5,  lag: 1,
      hint: '12:1 — heavy. Peaks are held down hard.' },
    { key: '20', label: '20', ratio: 20, thresh: -24, knee: 3,  lag: 1,
      hint: '20:1 — a limiter. Effectively a ceiling the signal cannot cross.' },
    { key: 'all', label: 'ALL', ratio: 20, thresh: -36, knee: 16, lag: 3.5,
      hint: 'Every button in at once. Threshold collapses, the knee smears and the attack lags — it pumps, it distorts, it is enormous.' },
];

window.oaCompRatio = function (key) {
    return window.OA_COMP_RATIOS.find(function (r) { return r.key === key; })
        || window.OA_COMP_RATIOS[0];
};

// Where the meter needle is pointing. GR is the one that matters; the two OUT
// positions are a level meter on the compressor's output, calibrated so 0VU
// sits at -18 or -14 dBFS respectively.
window.OA_COMP_METERS = [
    { key: 'gr',  label: 'GR',  hint: 'Gain reduction — how many dB are being taken off, right to left.' },
    { key: '+8',  label: '+8',  ref: -14, hint: 'Output level, 0VU at -14 dBFS.' },
    { key: '+4',  label: '+4',  ref: -18, hint: 'Output level, 0VU at -18 dBFS.' },
    { key: 'off', label: 'OFF', hint: 'Needle parked.' },
];

// The factory settings live in oaCompressorPresets.js, loaded first.

// Fill in whatever a saved unit is missing and drop anything out of range, so a
// hand-edited or half-written localStorage entry still comes up playable.
const cmpUnit = function (saved) {
    const s = saved || {};
    const out = { on: !!s.on, ratio: window.oaCompRatio(s.ratio).key, meter: 'gr' };
    if (window.OA_COMP_METERS.some(function (m) { return m.key === s.meter; })) out.meter = s.meter;
    window.OA_COMP_PARAMS.forEach(function (p) {
        const v = Number(s[p.key]);
        out[p.key] = isFinite(v) ? Math.max(p.min, Math.min(p.max, v)) : p.def;
    });
    return out;
};

window.OA_COMP = (function () {
    let saved = null;
    try { saved = JSON.parse(window.localStorage.getItem('oaComp')); } catch (e) {}
    const units = (saved && Array.isArray(saved.units)) ? saved.units : [];
    // Sized for the LARGEST grid, like every other per-channel array, so
    // shrinking the pad layout and growing it back finds pad 25's settings.
    const out = [];
    for (let i = 0; i < window.OA_PAD_MAX; i++) out.push(cmpUnit(units[i]));
    return { units: out };
})();

window.oaCompUnit = function (idx) {
    return window.OA_COMP.units[idx] || window.OA_COMP.units[0];
};

window.oaSaveComp = function () {
    try {
        window.localStorage.setItem('oaComp', JSON.stringify({
            units: window.OA_COMP.units.map(function (u) {
                const o = { on: u.on, ratio: u.ratio, meter: u.meter };
                window.OA_COMP_PARAMS.forEach(function (p) { o[p.key] = u[p.key]; });
                return o;
            })
        }));
    } catch (e) {}
};

/** Is this channel's compressor doing anything at all? */
window.oaCompActive = function (idx) {
    const u = window.oaCompUnit(idx);
    return !!u.on && u.mix > 0.0005;
};

// ---------------------------------------------------------------------------
// The worklet. Shipped as a source string and registered from a Blob URL: the
// whole app is one compiled bundle, and a worklet module has to be a separate
// fetchable file. Registered alongside the tape echo by oaPrepareFx().
// ---------------------------------------------------------------------------
const OA_COMP_WORKLET_SRC = `
class OaLimiter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'inGain',  defaultValue: 1,      minValue: 0,       maxValue: 64,  automationRate: 'k-rate' },
      { name: 'outGain', defaultValue: 1,      minValue: 0,       maxValue: 32,  automationRate: 'k-rate' },
      { name: 'attack',  defaultValue: 0.0002, minValue: 0.00001, maxValue: 0.01, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.25,   minValue: 0.01,    maxValue: 2,   automationRate: 'k-rate' },
      { name: 'ratio',   defaultValue: 4,      minValue: 1,       maxValue: 20,  automationRate: 'k-rate' },
      { name: 'thresh',  defaultValue: -24,    minValue: -60,     maxValue: 0,   automationRate: 'k-rate' },
      { name: 'knee',    defaultValue: 9,      minValue: 0,       maxValue: 24,  automationRate: 'k-rate' },
      { name: 'mix',     defaultValue: 1,      minValue: 0,       maxValue: 1,   automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.gr = 0;        // gain reduction currently applied, in dB (never negative)
    this.grPeak = 0;    // worst reduction since the last report
    this.blocks = 0;
    this.lastSent = -1;
    this.quiet = 1e9;
  }

  // The output stage cannot pass an arbitrarily large number, and neither could
  // the transformer this is standing in for. Dead linear below 0.7 so ordinary
  // material is untouched, then bent asymptotically into a ceiling at 1.0 — so
  // a heavy makeup setting saturates instead of clipping into a square edge.
  sat(x) {
    const a = x < 0 ? -x : x;
    if (a <= 0.7) return x;
    const over = (a - 0.7) / 0.3;
    const y = 0.7 + 0.3 * (over < 3 ? Math.tanh(over) : 1);
    return x < 0 ? -y : y;
  }

  // Report the needle position back to the panel. Throttled to roughly every
  // 20ms, and silent once the channel has settled at zero — sixteen channels
  // posting a message per 128 samples would be a message every 0.36ms.
  report() {
    const v = Math.round(this.grPeak * 100) / 100;
    if (v === 0 && this.lastSent === 0) return;
    this.lastSent = v;
    this.port.postMessage(v);
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
      this.gr = 0;
      this.grPeak = 0;
      this.report();
      return true;
    }

    const mix = params.mix[0];

    // Blend at zero is a wire. Copy it through rather than running a detector
    // over silence-adjacent arithmetic sixteen times a buffer.
    if (mix <= 1e-6) {
      outL.set(inL);
      if (outR !== outL) outR.set(inR || inL);
      this.gr = 0;
      this.grPeak = 0;
      this.report();
      return true;
    }

    let inPeak = 0;
    for (let i = 0; i < n; i++) {
      const a = inL[i] > 0 ? inL[i] : -inL[i];
      if (a > inPeak) inPeak = a;
    }
    // Nothing coming in and the gain already back up: there is no work to do.
    if (inPeak < 1e-7 && this.gr < 1e-3) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      this.gr = 0;
      this.grPeak = 0;
      this.quiet += n;
      this.blocks++;
      if (this.blocks >= 4) { this.blocks = 0; this.report(); }
      return true;
    }
    this.quiet = 0;

    const inGain = params.inGain[0];
    const outGain = params.outGain[0];
    const ratio = params.ratio[0];
    const thresh = params.thresh[0];
    const knee = params.knee[0];
    const slope = 1 - 1 / ratio;        // fraction of every dB over the line that gets removed
    const half = knee * 0.5;

    // One-pole coefficients. A time constant of t seconds reaches ~63% of the
    // way to its target in t; that is the standard definition and it is what
    // the numbers on the panel mean.
    const aCoef = 1 - Math.exp(-1 / Math.max(1, params.attack[0] * sampleRate));
    const rCoef = 1 - Math.exp(-1 / Math.max(1, params.release[0] * sampleRate));

    const dry = 1 - mix;
    let gr = this.gr;
    let peak = this.grPeak;

    for (let i = 0; i < n; i++) {
      const l = inL[i];
      const r = inR ? inR[i] : l;

      // STEREO-LINKED PEAK DETECTION. The louder side decides for both, so a
      // hard-panned hit turns the pair down together instead of walking the
      // image across the room.
      const al = l > 0 ? l : -l;
      const ar = r > 0 ? r : -r;
      const det = (al > ar ? al : ar) * inGain;

      // Rectified peak straight into the static curve — no smoothing here. The
      // ballistics go on the gain, two lines further down.
      const db = det > 1e-9 ? 8.6858896 * Math.log(det) : -180;   // 20*log10(x)
      const over = db - thresh;

      // The knee. Below it nothing happens, above it the full ratio applies,
      // and across the knee width the two are joined by a parabola so the
      // compressor eases in rather than switching on at a corner. A corner is
      // a discontinuity in the gain, and a discontinuity is a click.
      let target;
      if (over <= -half) target = 0;
      else if (over >= half) target = over * slope;
      else {
        const t = over + half;
        target = slope * t * t / (2 * knee);
      }

      // ATTACK when the reduction is deepening, RELEASE when it is letting go.
      gr += (target - gr) * (target > gr ? aCoef : rCoef);
      if (gr > peak) peak = gr;

      // dB of reduction back to a linear multiplier: 10^(-gr/20).
      const g = Math.exp(-0.11512925 * gr) * inGain * outGain;

      const wetL = this.sat(l * g);
      const wetR = this.sat(r * g);
      outL[i] = wetL * mix + l * dry;
      if (outR !== outL) outR[i] = wetR * mix + r * dry;
    }

    this.gr = gr;
    this.grPeak = peak;
    this.blocks++;
    if (this.blocks >= 4) {
      this.blocks = 0;
      this.report();
      // Decay the reported peak rather than resetting it, so the needle falls
      // smoothly between reports instead of flickering to zero and back.
      this.grPeak = gr;
    }
    return true;
  }
}
registerProcessor('oa-limiter', OaLimiter);
`;

let oaCompUrl = null;
// Read by oaPrepareFx() in oaTapeDelay.js, which registers every worklet module
// the effects need in one pass on first use of a context.
window.oaCompModuleUrl = function () {
    if (!oaCompUrl) {
        oaCompUrl = URL.createObjectURL(new Blob([OA_COMP_WORKLET_SRC], { type: 'application/javascript' }));
    }
    return oaCompUrl;
};

// The live values behind the panel, resolved through the ratio button and the
// on/off switch. One place, so the worklet and the native chain cannot drift.
const compSettings = function (unit) {
    const r = window.oaCompRatio(unit.ratio);
    const on = !!unit.on;
    return {
        inGain: on ? Math.pow(10, unit.input / 20) : 1,
        outGain: on ? Math.pow(10, unit.output / 20) : 1,
        attack: window.oaCompAttackTime(unit.attack) * r.lag,
        release: window.oaCompReleaseTime(unit.release),
        ratio: r.ratio,
        thresh: r.thresh,
        knee: r.knee,
        // The switch and the blend knob are the same lever as far as the DSP is
        // concerned: at 0 the wet path contributes nothing and the output is
        // the input, sample for sample.
        mix: on ? unit.mix : 0,
    };
};

const workletEngine = function (ctx, unit, bus) {
    const node = new AudioWorkletNode(ctx, 'oa-limiter', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
    });
    const s = compSettings(unit);
    Object.keys(s).forEach(function (k) {
        const p = node.parameters.get(k);
        if (p) p.value = s[k];
    });
    node.port.onmessage = function (e) { bus.gr = e.data; };

    return {
        input: node,
        output: node,
        apply: function (u) {
            const next = compSettings(u);
            const t = ctx.currentTime;
            Object.keys(next).forEach(function (k) {
                const p = node.parameters.get(k);
                // Short enough to feel immediate, long enough that dragging a
                // knob is a slide rather than a staircase of zipper noise.
                if (p) p.setTargetAtTime(next[k], t, 0.02);
            });
        },
        gr: null,
    };
};

/**
 * The same topology from native nodes, for browsers without AudioWorklet. The
 * browser's own compressor is a feed-forward peak design with a soft knee, so
 * the shape is right; what it will not do is the ALL-buttons lag, and it adds
 * a few milliseconds of its own latency that the worklet does not.
 */
const nativeEngine = function (ctx, unit) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const pre = ctx.createGain();
    const post = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();

    input.connect(dry);
    dry.connect(output);
    input.connect(pre);
    pre.connect(comp);
    comp.connect(post);
    post.connect(wet);
    wet.connect(output);

    const apply = function (u) {
        const s = compSettings(u);
        const t = ctx.currentTime;
        pre.gain.setTargetAtTime(s.inGain, t, 0.02);
        post.gain.setTargetAtTime(s.outGain, t, 0.02);
        wet.gain.setTargetAtTime(s.mix, t, 0.02);
        dry.gain.setTargetAtTime(1 - s.mix, t, 0.02);
        comp.threshold.setTargetAtTime(s.thresh, t, 0.02);
        comp.knee.setTargetAtTime(s.knee, t, 0.02);
        comp.ratio.setTargetAtTime(s.ratio, t, 0.02);
        // The native node's attack and release cannot go below 0 or above 1s.
        comp.attack.setTargetAtTime(Math.max(0, Math.min(1, s.attack)), t, 0.02);
        comp.release.setTargetAtTime(Math.max(0.01, Math.min(1, s.release)), t, 0.02);
    };
    apply(unit);

    return {
        input: input, output: output, apply: apply,
        // No message port here — the meter reads the node's own reduction,
        // which the spec reports as a NEGATIVE number of dB.
        gr: function () { return -comp.reduction; },
    };
};

/**
 * The channel's compressor, built once per AudioContext and shared by every
 * voice on that channel — which is the point. A compressor built per hit would
 * start with its gain wide open every time, so a fast run of hits would never
 * duck each other and the release knob would have nothing to act on.
 *
 * Returns null for a channel that has never been switched on, and the caller
 * connects to `dest` exactly as it did before. Once built the strip stays:
 * switching the unit off sets its blend to zero, which passes the input through
 * untouched rather than tearing a live node out of a running graph.
 *
 * THE DESTINATION IS FIXED AT BUILD TIME, and that is not an oversight — one
 * strip serves every voice on the channel, so there is exactly one answer to
 * where it goes and the router is the only thing that knows it. Later calls
 * hand back the strip that exists and ignore `dest`. The same contract the
 * GATE states in the same words, which is the point: three of these four ports
 * took a destination and this one did not, so a router with its own bus
 * structure — APK:OS's Mixer, where a channel goes to a VCA and not to the
 * master — could use the gate, the pedal and the EQ, and had to reach into
 * `ctx.__oaComps` to use the compressor. Now all four are the same shape.
 */
const compStrip = function (ctx, idx, dest) {
    const strips = ctx.__oaComps || (ctx.__oaComps = []);
    if (strips[idx]) return strips[idx];
    if (!window.oaCompActive(idx)) return null;

    const unit = window.oaCompUnit(idx);
    const input = ctx.createGain();
    const output = ctx.createGain();
    // Unrouted, the strip's output is the channel's contribution to the mix, so
    // it goes to the MASTER BUS rather than straight out — the buss compressor
    // has to hear a compressed channel the way the listener will. A router that
    // sums its channels somewhere else says so.
    output.connect(dest || (window.oaMasterInput ? window.oaMasterInput(ctx) : ctx.destination));

    const bus = { input: input, output: output, engine: null, gr: 0, analyser: null };

    try {
        // A voice may be built before the module has finished registering. The
        // native chain is synchronous and always available, so an unresolved
        // worklet falls back rather than leaving the channel silent while it
        // waits — which on an OfflineAudioContext would be the whole render.
        bus.engine = ctx.__oaWorkletOk ? workletEngine(ctx, unit, bus) : nativeEngine(ctx, unit);
    } catch (e) {
        console.warn('⚠️ [Compressor] worklet node failed, using native chain:', e && e.message);
        bus.engine = nativeEngine(ctx, unit);
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
// node to play into, or null meaning "there is no compressor here, carry on to
// the output as you were" — which is the same answer the DRIVE pedal gives, so
// the router treats every optional insert the same way.
// ---------------------------------------------------------------------------

/**
 * THE INPUT PORT for channel `idx`, or null when this channel has never been
 * switched on. Null is a real answer, not a failure: it is what keeps an
 * uncompressed channel's graph exactly as it was before this file existed.
 */
window.oaCompInput = function (ctx, idx, dest) {
    const bus = compStrip(ctx, idx, dest);
    return bus ? bus.input : null;
};

/**
 * Build every strip that is switched on, once the worklet answer is in.
 *
 * This loop lived in oaWarmFx(), which had to know both that a strip exists per
 * PAD and that building one early is what keeps it off the native fallback.
 * Neither is the router's business; both are this file's.
 *
 * `destFor(i)` is asked where channel i's compressor should go, exactly as
 * `oaGateWarm` asks: the router owns that answer because the router owns the
 * channel order. Omitted, every strip lands on the master bus as before.
 */
window.oaCompWarm = function (ctx, destFor) {
    for (let i = 0; i < window.OA_PAD_MAX; i++) {
        compStrip(ctx, i, destFor ? destFor(i) : null);
    }
};

/** How many strips exist on this context — for the voice diagnostic. */
window.oaCompStripCount = function (ctx) {
    return ((ctx && ctx.__oaComps) || []).filter(Boolean).length;
};

/** Gain reduction on this channel right now, in dB. 0 when nothing is running. */
window.oaCompGR = function (idx) {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaComps && ctx.__oaComps[idx];
    if (!bus) return 0;
    if (bus.engine && bus.engine.gr) return Math.max(0, bus.engine.gr());
    return Math.max(0, bus.gr || 0);
};

const pushToBus = function (idx) {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaComps && ctx.__oaComps[idx];
    if (bus && bus.engine) bus.engine.apply(window.oaCompUnit(idx));
};

window.oaSetComp = function (idx, key, value) {
    const u = window.oaCompUnit(idx);
    if (key === 'on') u.on = !!value;
    else if (key === 'ratio') u.ratio = window.oaCompRatio(value).key;
    else if (key === 'meter') u.meter = value;
    else {
        const p = window.OA_COMP_PARAMS.find(function (q) { return q.key === key; });
        if (!p) return;
        u[key] = Math.max(p.min, Math.min(p.max, Number(value) || 0));
    }
    window.oaSaveComp();
    // The meter switch is a panel decoration — it changes nothing in the audio.
    if (key !== 'meter') pushToBus(idx);
    window.dispatchEvent(new CustomEvent('oa-comp-changed', { detail: { idx: idx, key: key } }));
};

window.oaApplyCompPreset = function (idx, name) {
    const preset = window.OA_COMP_PRESETS[name];
    if (!preset) return;
    const u = window.oaCompUnit(idx);
    u.on = !!preset.on;
    u.ratio = window.oaCompRatio(preset.ratio).key;
    window.OA_COMP_PARAMS.forEach(function (p) {
        if (typeof preset[p.key] === 'number') u[p.key] = Math.max(p.min, Math.min(p.max, preset[p.key]));
    });
    window.oaSaveComp();
    pushToBus(idx);
    window.dispatchEvent(new CustomEvent('oa-comp-changed', { detail: { idx: idx, preset: name } }));
};

/**
 * Tear every strip out of a context. Called when a context is closed and by the
 * leak tests: a channel strip is one of only two things in this file that
 * outlive a voice, so if anything here holds on, this is where it shows.
 */
window.oaDisposeComp = function (ctx) {
    const strips = ctx && ctx.__oaComps;
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
    id: 'comp',
    label: 'Compressor',
    event: 'oa-comp-changed',
    units: function () { return window.OA_PAD_MAX; },
    params: window.OA_COMP_PARAMS,
    presets: window.OA_COMP_PRESETS,
    state: function (i) { return window.oaCompUnit(i); },
    set: function (i, key, value) { window.oaSetComp(i, key, value); },
    preset: function (i, name) { window.oaApplyCompPreset(i, name); },

    // GR is the only measurement this unit has that the shared four do not
    // already cover. The ratio and meter-mode switches are SETTINGS and come
    // back through state() — a frame carries what is measured, not what is set.
    slots: window.OA_SLOT.USER + 1,
    layout: { GR: window.OA_SLOT.USER },

    read: function (ctx, i, frame) {
        const S = window.OA_SLOT;
        frame[S.ACTIVE] = window.oaCompActive(i) ? 1 : 0;
        const bus = ctx && ctx.__oaComps && ctx.__oaComps[i];
        if (!bus) {
            frame[S.PEAK_L] = 0;
            frame[S.PEAK_R] = 0;
            frame[S.USER] = 0;
            return;
        }
        // One analyser on the strip output, so both sides read the same number.
        // Honest: the DSP is stereo-linked, and a split meter here would be
        // showing a difference the compressor deliberately does not create.
        const peak = window.oaAnalyserPeak(bus.analyser);
        window.oaWritePeak(frame, S.PEAK_L, peak);
        window.oaWritePeak(frame, S.PEAK_R, peak);
        frame[S.USER] = window.oaCompGR(i);
    },

    dispose: window.oaDisposeComp,

    /** Every channel's strip, including the ones switched off. */
    save: function () {
        return {
            units: window.OA_COMP.units.map(function (u) {
                const o = { on: u.on, ratio: u.ratio, meter: u.meter };
                window.OA_COMP_PARAMS.forEach(function (p) { o[p.key] = u[p.key]; });
                return o;
            }),
        };
    },

    /**
     * Put them back through oaSetComp(), which clamps, persists, pushes the new
     * values at whichever engine is running and fires the change event.
     *
     * `on` goes LAST. Every other setter pushes to the bus, and pushing a half
     * loaded strip that is already switched on means the channel is briefly
     * compressed by a mixture of the old settings and the new ones — audible if
     * the import happens while the sequencer is running, which is exactly when
     * someone would notice and have no idea why.
     */
    load: function (data) {
        const units = Array.isArray(data && data.units) ? data.units : [];
        units.slice(0, window.OA_PAD_MAX).forEach(function (u, i) {
            if (!u) return;
            if (u.ratio) window.oaSetComp(i, 'ratio', u.ratio);
            if (u.meter) window.oaSetComp(i, 'meter', u.meter);
            window.OA_COMP_PARAMS.forEach(function (p) {
                if (u[p.key] !== undefined) window.oaSetComp(i, p.key, u[p.key]);
            });
            window.oaSetComp(i, 'on', !!u.on);
        });
    },
});
