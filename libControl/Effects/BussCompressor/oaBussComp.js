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
 * Header: oaBussComp.js
 * Purpose: THE MASTER BUS — the one node the whole mix sums into — and the
 *   VCA bus compressor sitting across it.
 * Description: This file owns THE ONE MASTER BUS. Everything audible sums into
 *   it, rather than each path connecting straight to `ctx.destination` — a mix
 *   that exists only inside the browser's own summing node is a mix nothing can
 *   compress, meter or fade.
 *
 *       channels ─┐
 *       strips ───┤
 *       reverbs ──┼─▶ [master in] ─▶ [BUS COMPRESSOR] ─▶ [fade] ─▶ destination
 *       tapes ────┘                                          │
 *                                                            └─▶ L/R analysers
 *
 *   The bus is NOT optional the way the channel compressor is. A channel that
 *   was never compressed builds nothing and wires straight out; there is only
 *   ever one master, everything needs somewhere to sum, and the meters and the
 *   fade need it whether or not the compressor is in circuit. What IS optional
 *   is the compression: with IN out, the unit is a wire, sample for sample.
 *
 *   WHAT IT IS. The bus compressor from the centre section of a 44K-series
 *   desk — the sound of the last forty years of records glued together. A VCA
 *   design: fast, predictable, and famous for making a mix sound like one thing
 *   instead of thirty things. The feature set follows the current version of
 *   that circuit rather than the original, which is where the side-chain
 *   filter, the mix law, the two detection modes and the negative ratios come
 *   from:
 *
 *     THRESHOLD   Where compression starts. Everything else on the panel is
 *                 about HOW it happens; this is about how often.
 *
 *     RATIO       How much of every dB over the line is taken away. The last
 *                 three positions are NEGATIVE ratios, which is not a typo: at
 *                 -0.5:1 a signal one dB over the threshold comes out two dB
 *                 BELOW it. The louder it gets the quieter it comes out. Used
 *                 either to nail a peak that nothing else will hold, or on
 *                 purpose, for the pumping.
 *
 *     ATTACK      How long the gain takes to come down. .1 ms catches the stick
 *                 hit itself; 30 ms lets the whole transient through and only
 *                 clamps the body behind it, which is what makes a mix sound
 *                 PUNCHIER after compression rather than flatter.
 *
 *     RELEASE     How long it takes to let go, plus the two automatic settings.
 *                 AUTO is the one people leave it on: a two-stage circuit, 100 ms
 *                 short and 12 s long, so a snare releases in a tenth of a second
 *                 while the bed of the mix underneath it comes back over ten.
 *                 One knob position cannot do that; two time constants can.
 *                 AUTO 2 (50 ms / 6 s) is the same trick, more awake.
 *
 *     MAKE-UP     Put back the level the compression took. Post-VCA, which is
 *                 why turning it up does not make the unit compress harder.
 *
 *     S/C FILTER  A high-pass in the SIDE CHAIN — the detector stops hearing the
 *                 bass, the audio path keeps it. Without this, every kick drum
 *                 ducks the entire record. It is the single most useful control
 *                 on a bus compressor and the one most often left out.
 *
 *     MIX         Parallel compression in one knob: squash it hard, then blend
 *                 the untouched mix back in underneath.
 *
 *     F/B         Feed the detector from AFTER the VCA instead of before it.
 *                 The detector then hears a signal that is already being turned
 *                 down, so it stops pulling as hard — the grab softens into a
 *                 lean. Slower, rounder, more "relaxed".
 *
 *     LOW THD     A compressor with a fast release follows the individual cycles
 *                 of a bass note rather than its envelope, and a gain that moves
 *                 at 50 Hz IS 50 Hz distortion. This limits how fast the release
 *                 may run so the gain rides the note instead of the waveform.
 *
 *     44K MODE     The 44K-series VCA ran unbalanced. Unbalanced means even-order
 *                 harmonics, and even-order harmonics are what "thick" sounds
 *                 like. Nine intensities, distortion generated by shaping rather
 *                 than by overload, so it costs no headroom.
 *
 *     TRIM        Gain into the whole unit, so a quiet mix can be brought up to
 *                 where the threshold range is useful without moving every fader.
 *
 *     RATE-S      Seconds for the FADE button to take the master to silence, the
 *                 way an engineer used to pull the master fader at the end of a
 *                 mix. It rides the bus gain AFTER the compressor, so a fade does
 *                 not make the compressor let go on the way down.
 *
 *   The DSP runs in an AudioWorklet, per sample, off the main thread. Where
 *   worklets are unavailable it falls back to a native chain built around the
 *   browser's own compressor node — the shape is right, but a native node has no
 *   side-chain input and no way to run a ratio backwards, so the filter, F/B, 44K
 *   and the negative ratios are all worklet-only. See `nativeEngine` below for
 *   exactly what is lost.
 */

window.OA_BUSS_COLOR = '#6fd3f5';

/**
 * The stepped positions. Every one of these is a pot detent on the real unit,
 * so they are a LIST rather than a range: the panel knob picks an index and the
 * formatter turns it back into the engraved number.
 *
 * Steps rather than a continuous sweep because that is what the hardware does,
 * and because it makes a setting sayable. "Attack 3, release auto, four to one"
 * is a recall; "attack 3.4718 ms" is not.
 */
window.OA_BUSS_ATTACKS = [0.1, 0.3, 1, 3, 6, 10, 15, 20, 30, 40];        // ms

/**
 * Release positions. The last two are the automatic settings and carry no
 * number, which is why this list holds objects rather than bare seconds: `auto`
 * is the two-stage mode index, 0 for the fixed positions.
 *
 *   AUTO    100 ms short stage, 12 s long
 *   AUTO 2   50 ms short stage,  6 s long
 */
window.OA_BUSS_RELEASES = [
    { label: '.05', sec: 0.05, auto: 0 },
    { label: '.1',  sec: 0.1,  auto: 0 },
    { label: '.15', sec: 0.15, auto: 0 },
    { label: '.2',  sec: 0.2,  auto: 0 },
    { label: '.3',  sec: 0.3,  auto: 0 },
    { label: '.4',  sec: 0.4,  auto: 0 },
    { label: '.6',  sec: 0.6,  auto: 0 },
    { label: '.8',  sec: 0.8,  auto: 0 },
    { label: '1.2', sec: 1.2,  auto: 0 },
    { label: 'A',   sec: 0.1,  auto: 1 },
    { label: 'A2',  sec: 0.05, auto: 2 },
];

/**
 * Ratio positions, gentlest first. The last three are the negative ones.
 *
 * The gain computer takes `1 - 1/ratio` as the fraction of every dB over the
 * threshold that gets removed, and that one expression covers the whole list
 * without a special case: 4:1 removes 0.75 of each dB, 20:1 removes 0.95, and
 * -0.5:1 removes 3.0 — three dB off for every one dB over, which drives the
 * output BELOW the threshold. That is what a negative ratio is.
 */
window.OA_BUSS_RATIOS = [1.3, 1.5, 2, 3, 4, 5, 10, 20, -2.5, -1.5, -0.5];

const bussRatioLabel = function (r) {
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/** Panel dB reference. 0 on the THRESHOLD collar is this many dBFS. */
const OA_BUSS_THRESH_REF = -18;

const pick = function (list, i) {
    const n = Math.max(0, Math.min(list.length - 1, Math.round(Number(i) || 0)));
    return list[n];
};

window.oaBussAttackTime = function (i) { return pick(window.OA_BUSS_ATTACKS, i) / 1000; };
window.oaBussRelease = function (i) { return pick(window.OA_BUSS_RELEASES, i); };
window.oaBussRatio = function (i) { return pick(window.OA_BUSS_RATIOS, i); };

const dbFmt = function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'; };

/**
 * The front panel. `ticks` are the numbers engraved around each knob's collar,
 * evenly spaced across the travel, low end first — the same convention the
 * channel compressor's faceplate uses.
 */
window.OA_BUSS_PARAMS = [
    {
        key: 'thresh', kind: 'continuous', label: 'Threshold', min: -20, max: 20, def: 0, fmt: dbFmt,
        ticks: ['-20', '-10', '0', '+10', '+20'],
        hint: 'Where compression starts. Down is more. 0 sits at -18 dBFS, so a mix peaking near full scale is already well over it.',
    },
    {
        key: 'makeup', kind: 'continuous', label: 'Make-Up', min: -10, max: 20, def: 0, fmt: dbFmt,
        ticks: ['-10', '0', '+10', '+20'],
        hint: 'Put back the level the compression took away. Post-VCA — turning this up does not compress harder.',
    },
    {
        key: 'attack', kind: 'discrete', label: 'Attack', min: 0, max: window.OA_BUSS_ATTACKS.length - 1, def: 5,
        ticks: ['.1', '1', '6', '15', '30'],
        fmt: function (v) { return pick(window.OA_BUSS_ATTACKS, v) + ' ms'; },
        hint: 'Time to clamp down. Fast softens the transient; slow lets it through and only holds the body — which is how a mix comes out punchier.',
    },
    {
        key: 'release', kind: 'discrete', label: 'Release', min: 0, max: window.OA_BUSS_RELEASES.length - 1, def: 9,
        ticks: ['.05', '.2', '.6', '1.2', 'A2'],
        fmt: function (v) {
            const r = pick(window.OA_BUSS_RELEASES, v);
            return r.auto ? (r.auto === 1 ? 'AUTO' : 'AUTO 2') : r.sec.toFixed(2) + ' s';
        },
        hint: 'Time to let go. AUTO is two time constants at once — fast for transients, slow for the bed underneath — and is where most mixes want it.',
    },
    {
        key: 'ratio', kind: 'discrete', label: 'Ratio', min: 0, max: window.OA_BUSS_RATIOS.length - 1, def: 4,
        ticks: ['1.3', '3', '10', '-2.5', '-0.5'],
        fmt: function (v) { return bussRatioLabel(pick(window.OA_BUSS_RATIOS, v)) + ':1'; },
        hint: '4:1 is the classic bus setting. The last three are negative: past the threshold the output goes DOWN as the input goes up.',
    },
    {
        key: 'sc', kind: 'continuous', label: 'SC Filter', min: 0, max: 300, def: 0,
        ticks: ['OUT', '100', '200', '300'],
        fmt: function (v) { return v < 5 ? 'OUT' : Math.round(v / 10) * 10 + ' Hz'; },
        hint: '12 dB/oct high-pass in the DETECTOR only. Stops the kick and the bass from ducking the whole record; the low end itself is untouched.',
    },
    {
        // DEPRECATED — off the faceplate, and bussSettings() no longer reads it.
        // Kept in the schema so an older saved unit and the presets that carry a
        // blend still load; see the note in bussSettings().
        key: 'mix', kind: 'continuous', label: 'Mix', min: 0, max: 1, def: 1, deprecated: true,
        ticks: ['DRY', '25', '50', '75', 'WET'],
        fmt: function (v) { return Math.round(v * 100) + '%'; },
        hint: 'Wet against the untouched mix. Below 100% is parallel compression: peaks held, transients alive underneath.',
    },
    {
        key: 'trim', kind: 'continuous', label: 'Trim', min: -18, max: 18, def: 0, fmt: dbFmt,
        ticks: ['-18', '-9', '0', '+9', '+18'],
        hint: 'Gain into the whole unit, so a quiet mix can reach the useful part of the threshold range without moving every fader.',
    },
    {
        key: 'rate', kind: 'continuous', label: 'Rate-S', min: 1, max: 60, def: 20,
        ticks: ['1', '15', '30', '45', '60'],
        fmt: function (v) { return Math.round(v) + ' s'; },
        hint: 'Seconds the FADE button takes to walk the master to silence — and, pressed again, back up.',
    },
    {
        key: 'dist', kind: 'continuous', label: 'Distortion', min: 1, max: 9, def: 5,
        ticks: ['1', '3', '5', '7', '9'],
        fmt: function (v) { return Math.round(v) + ' / 9'; },
        hint: 'How much grit 44K MODE adds. There is a sweet spot per mix where the material thickens rather than dirties — hunt for it.',
    },
];

/**
 * The switches. These are not knobs and they are not in `params`, because a
 * param has a min and a max and these have neither — they come back through
 * state() and go out through set() as plain booleans.
 */
window.OA_BUSS_SWITCHES = [
    { key: 'on', label: 'IN', big: true,
      hint: 'The whole circuit in or out. Out is a wire — trim, compression, saturation and all.' },
    { key: 'fourK', label: 'ANALOG', big: true,
      hint: '44K MODE. The unbalanced 44K-series VCA and its even-order harmonics. Thickness, not loudness.' },
    { key: 'fb', label: 'F/B',
      hint: 'Detector fed from AFTER the VCA. It hears a signal already being turned down, so it stops pulling as hard — slower, rounder, more relaxed.' },
    { key: 'lowThd', label: 'LOW THD',
      hint: 'Stops a fast release from following the cycles of a bass note. A gain that moves at 50 Hz IS 50 Hz distortion.' },
    { key: 'scSum', label: 'Σ S/C',
      hint: 'Sum the two sides into one detector instead of rectifying each. More sensitive to what is up the middle — kick, snare, bass.' },
    // DEPRECATED with MIX, which is the only thing it changed.
    { key: 'parallel', label: 'PARALLEL', deprecated: true,
      hint: 'MIX keeps the dry mix at 100% and rides the wet in on top, rather than crossfading between them. Fully wet auditions the compressed path alone.' },
];

// The factory settings live in oaBussCompPresets.js, loaded first — the stepped
// controls are stored there as POT POSITIONS rather than values, so that file
// carries the tables' meaning alongside the numbers.

const BUSS_FLAGS = ['on', 'fb', 'lowThd', 'fourK', 'scSum', 'parallel'];

// Fill in whatever a saved unit is missing and drop anything out of range, so a
// hand-edited or half-written localStorage entry still comes up playable.
const bussUnit = function (saved) {
    const s = saved || {};
    const out = {};
    BUSS_FLAGS.forEach(function (k) { out[k] = !!s[k]; });
    window.OA_BUSS_PARAMS.forEach(function (p) {
        const v = Number(s[p.key]);
        out[p.key] = isFinite(v) ? Math.max(p.min, Math.min(p.max, v)) : p.def;
    });
    return out;
};

window.OA_BUSS = (function () {
    let saved = null;
    try { saved = JSON.parse(window.localStorage.getItem('oaBuss')); } catch (e) {}
    return bussUnit(saved);
})();

/** There is one master bus, so the unit index is decoration. */
window.oaBussUnit = function () { return window.OA_BUSS; };

window.oaSaveBuss = function () {
    try {
        const o = {};
        BUSS_FLAGS.forEach(function (k) { o[k] = window.OA_BUSS[k]; });
        window.OA_BUSS_PARAMS.forEach(function (p) { o[p.key] = window.OA_BUSS[p.key]; });
        window.localStorage.setItem('oaBuss', JSON.stringify(o));
    } catch (e) {}
};

/**
 * Is the compressor doing anything at all, or is the bus a wire?
 *
 * MIX is the wet fader under both laws — classic only changes what the DRY side
 * does with the rest of the travel — so this one test covers both, and a unit
 * switched in with the blend fully counter-clockwise reports itself inactive
 * because that is exactly what it is.
 */
window.oaBussActive = function () {
    const u = window.OA_BUSS;
    return !!u.on && u.mix > 0.0005;
};

// ---------------------------------------------------------------------------
// The worklet. Shipped as a source string and registered from a Blob URL: the
// whole app is one compiled bundle, and a worklet module has to be a separate
// fetchable file. Registered alongside the tape echo and the channel limiter by
// oaPrepareFx().
// ---------------------------------------------------------------------------
const OA_BUSS_WORKLET_SRC = `
class OaBussComp extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'trim',    defaultValue: 1,     minValue: 0,       maxValue: 8,    automationRate: 'k-rate' },
      { name: 'thresh',  defaultValue: -18,   minValue: -80,     maxValue: 20,   automationRate: 'k-rate' },
      { name: 'ratio',   defaultValue: 4,     minValue: -20,     maxValue: 20,   automationRate: 'k-rate' },
      { name: 'attack',  defaultValue: 0.01,  minValue: 0.00005, maxValue: 0.05, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.3,   minValue: 0.01,    maxValue: 2,    automationRate: 'k-rate' },
      { name: 'relMode', defaultValue: 0,     minValue: 0,       maxValue: 2,    automationRate: 'k-rate' },
      { name: 'makeup',  defaultValue: 1,     minValue: 0,       maxValue: 16,   automationRate: 'k-rate' },
      { name: 'wet',     defaultValue: 1,     minValue: 0,       maxValue: 1,    automationRate: 'k-rate' },
      { name: 'dry',     defaultValue: 0,     minValue: 0,       maxValue: 1,    automationRate: 'k-rate' },
      { name: 'hpf',     defaultValue: 0,     minValue: 0,       maxValue: 300,  automationRate: 'k-rate' },
      { name: 'fb',      defaultValue: 0,     minValue: 0,       maxValue: 1,    automationRate: 'k-rate' },
      { name: 'lowThd',  defaultValue: 0,     minValue: 0,       maxValue: 1,    automationRate: 'k-rate' },
      { name: 'fourK',   defaultValue: 0,     minValue: 0,       maxValue: 1,    automationRate: 'k-rate' },
      { name: 'dist',    defaultValue: 5,     minValue: 1,       maxValue: 9,    automationRate: 'k-rate' },
      { name: 'scSum',   defaultValue: 0,     minValue: 0,       maxValue: 1,    automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.gr = 0;          // fast gain-reduction envelope, dB, never negative
    this.grSlow = 0;      // the AUTO release's long stage, dB
    this.grPeak = 0;      // worst reduction since the last report
    this.blocks = 0;
    this.lastSent = -1;

    // Side-chain high-pass state: direct-form-I biquad, one per side.
    this.hpFreq = -1;
    this.hb0 = 1; this.hb1 = 0; this.hb2 = 0; this.ha1 = 0; this.ha2 = 0;
    this.hx1 = [0, 0]; this.hx2 = [0, 0];
    this.hy1 = [0, 0]; this.hy2 = [0, 0];

    // Feed-back mode reads these: the previous sample's POST-VCA, PRE-MAKE-UP
    // signal. Pre-make-up on purpose — on the real unit the make-up is an MDAC
    // stage after the feed to the side-chain, which is exactly why turning
    // make-up up does not make the compressor work harder.
    this.fbL = 0; this.fbR = 0;

    // 44K mode's squared term has a DC component, so it needs blocking or the
    // whole mix acquires an offset and the headroom goes with it.
    this.dcX = [0, 0]; this.dcY = [0, 0];
  }

  // The output stage cannot pass an arbitrarily large number, and neither could
  // the amplifier this stands in for. Dead linear below 0.7 so ordinary material
  // is untouched, then bent asymptotically into a ceiling at 1.0 — a heavy
  // make-up setting saturates instead of clipping into a square edge.
  sat(x) {
    const a = x < 0 ? -x : x;
    if (a <= 0.7) return x;
    const over = (a - 0.7) / 0.3;
    const y = 0.7 + 0.3 * (over < 3 ? Math.tanh(over) : 1);
    return x < 0 ? -y : y;
  }

  // Recompute the side-chain filter only when the knob has actually moved. An
  // RBJ 2nd-order high-pass at Q = 0.707, which is the 12 dB/oct the panel says.
  setHpf(f) {
    if (f === this.hpFreq) return;
    this.hpFreq = f;
    if (f < 5) { this.hb0 = 1; this.hb1 = 0; this.hb2 = 0; this.ha1 = 0; this.ha2 = 0; return; }
    const w = 2 * Math.PI * f / sampleRate;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * 0.70710678);
    const a0 = 1 + alpha;
    this.hb0 = (1 + cw) / 2 / a0;
    this.hb1 = -(1 + cw) / a0;
    this.hb2 = (1 + cw) / 2 / a0;
    this.ha1 = -2 * cw / a0;
    this.ha2 = (1 - alpha) / a0;
  }

  hp(x, c) {
    const y = this.hb0 * x + this.hb1 * this.hx1[c] + this.hb2 * this.hx2[c]
            - this.ha1 * this.hy1[c] - this.ha2 * this.hy2[c];
    this.hx2[c] = this.hx1[c]; this.hx1[c] = x;
    this.hy2[c] = this.hy1[c]; this.hy1[c] = y;
    return y;
  }

  // 44K MODE. An asymmetric shaper: the squared term is what makes it asymmetric,
  // and asymmetry is what generates the EVEN harmonics that read as thickness.
  // A symmetric shaper — tanh on its own — gives odd harmonics, which read as
  // fuzz. That difference is the whole point of the switch.
  drive4k(x, c) {
    const u = this.k4g * x;
    const v = u + this.k4b * u * u;
    let y = v > 3 ? 1 : (v < -3 ? -1 : Math.tanh(v));
    y *= this.k4n;
    // One-pole DC blocker, ~5 Hz, undoing the offset the squared term adds.
    const out = y - this.dcX[c] + 0.9995 * this.dcY[c];
    this.dcX[c] = y;
    this.dcY[c] = out;
    return out;
  }

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
      this.gr = 0; this.grSlow = 0; this.grPeak = 0;
      this.report();
      return true;
    }

    const trim = params.trim[0];
    const wet = params.wet[0];
    const dry = params.dry[0];

    // Out of circuit: a wire. Copy it through rather than running a detector,
    // a filter and a shaper over a signal that is going to come out unchanged.
    if (wet <= 1e-6 && trim === 1) {
      outL.set(inL);
      if (outR !== outL) outR.set(inR || inL);
      this.gr = 0; this.grSlow = 0; this.grPeak = 0;
      this.fbL = 0; this.fbR = 0;
      this.report();
      return true;
    }

    const thresh = params.thresh[0];
    let ratio = params.ratio[0];
    // 1:1 removes nothing and 0 is not a ratio at all; both would divide the
    // gain computer by something it cannot use.
    if (ratio > -0.05 && ratio < 1.0001) ratio = ratio < 0 ? -0.05 : 1.0001;
    const slope = 1 - 1 / ratio;
    const makeup = params.makeup[0];
    const useFb = params.fb[0] > 0.5;
    const sumSc = params.scSum[0] > 0.5;
    const four = params.fourK[0] > 0.5;

    // A soft knee, fixed. The bus compressor's reputation for being inaudible
    // until you bypass it is largely this: nothing on the panel switches on at
    // a corner, and a corner in the gain is a click.
    const knee = 6;
    const half = knee * 0.5;

    this.setHpf(params.hpf[0]);

    if (four) {
      const d = (params.dist[0] - 1) / 8;          // 0 at position 1, 1 at 9
      this.k4g = 1 + 2.2 * d;                      // drive into the shaper
      this.k4b = 0.42 * d;                         // the asymmetry itself
      this.k4n = 1 / (1 + 1.15 * d);               // put the level back
    }

    // One-pole coefficients. A time constant of t seconds reaches ~63% of the
    // way to its target in t; that is the standard definition and it is what
    // the numbers on the panel mean.
    const coef = function (t) { return 1 - Math.exp(-1 / Math.max(1, t * sampleRate)); };
    const aCoef = coef(params.attack[0]);

    const relMode = Math.round(params.relMode[0]);
    // AUTO's two stages, straight off the manual: 100 ms / 12 s, and 50 ms / 6 s
    // for AUTO 2. In a fixed position there is no long stage at all.
    const shortSec = relMode === 1 ? 0.1 : (relMode === 2 ? 0.05 : params.release[0]);
    const longSec = relMode === 1 ? 12 : (relMode === 2 ? 6 : 0);
    let rCoef = coef(shortSec);
    const sCoef = longSec ? coef(longSec) : 0;

    // LOW THD. The release is what has to be slowed, not the attack: an envelope
    // that can fall inside one cycle of a bass note tracks the WAVEFORM instead
    // of the note, and gain modulated at 50 Hz is 50 Hz distortion. Capping the
    // release coefficient at a ~12 ms constant puts the fastest release just
    // outside the period of the lowest notes and leaves the attack untouched.
    if (params.lowThd[0] > 0.5) {
      const cap = coef(0.012);
      if (rCoef > cap) rCoef = cap;
    }

    const mkLin = makeup;
    let gr = this.gr;
    let slow = this.grSlow;
    let peak = this.grPeak;

    for (let i = 0; i < n; i++) {
      const l = inL[i] * trim;
      const r = (inR ? inR[i] : inL[i]) * trim;

      // 1. WHERE THE DETECTOR LISTENS. Feed-forward reads the input; feed-back
      //    reads what came out of the VCA last sample, which is a signal that
      //    has already been turned down — so it asks for less, and keeps asking
      //    for less. That loop is the whole "relaxed" character.
      let scL = useFb ? this.fbL : l;
      let scR = useFb ? this.fbR : r;

      // 2. The side-chain high-pass, on the detector only. The audio path never
      //    sees this filter, which is the entire trick.
      if (this.hpFreq >= 5) {
        scL = this.hp(scL, 0);
        scR = this.hp(scR, 1);
      }

      // 3. STEREO-LINKED DETECTION. Either the louder side decides for both
      //    (classic), or the two are summed first (Σ S/C), which cancels what is
      //    hard-panned and leaves what is up the middle — so the kick and the
      //    snare drive the compressor and the wide reverb does not.
      let det;
      if (sumSc) {
        const s = (scL + scR) * 0.5;
        det = s > 0 ? s : -s;
      } else {
        const al = scL > 0 ? scL : -scL;
        const ar = scR > 0 ? scR : -scR;
        det = al > ar ? al : ar;
      }

      // 4. THE GAIN COMPUTER. Rectified peak straight into the static curve, no
      //    smoothing here — the ballistics go on the GAIN, below, so the ratio
      //    stays honest at every point of the envelope instead of drifting while
      //    a level detector catches up.
      const db = det > 1e-9 ? 8.6858896 * Math.log(det) : -180;    // 20*log10
      const over = db - thresh;

      let target;
      if (over <= -half) target = 0;
      else if (over >= half) target = over * slope;
      else {
        const t = over + half;
        target = slope * t * t / (2 * knee);
      }
      if (target < 0) target = 0;

      // 5. BALLISTICS. Attack while the reduction deepens, release while it
      //    lets go.
      gr += (target - gr) * (target > gr ? aCoef : rCoef);

      // The AUTO release's long stage: a slow average of what the fast stage is
      // doing. A transient barely moves it, so a snare still releases in a tenth
      // of a second; a loud passage charges it up, so when the passage ends the
      // bed of the mix comes back over ten seconds instead of jumping. One knob
      // position cannot be both. Two time constants can.
      let applied = gr;
      if (sCoef) {
        slow += (gr - slow) * sCoef;
        if (slow > applied) applied = slow;
      }

      if (applied > peak) peak = applied;

      // 6. THE VCA. dB of reduction back to a linear multiplier: 10^(-gr/20).
      const g = Math.exp(-0.11512925 * applied);
      let wl = l * g;
      let wr = r * g;

      // What feed-back mode will read next sample: post-VCA, pre-make-up.
      this.fbL = wl;
      this.fbR = wr;

      // 7. 44K MODE, in the VCA's place rather than after it — the distortion on
      //    a 44K-series desk came from the gain element itself.
      if (four) {
        wl = this.drive4k(wl, 0);
        wr = this.drive4k(wr, 1);
      }

      // 8. MAKE-UP, post everything, then the blend against the dry mix.
      wl = this.sat(wl * mkLin);
      wr = this.sat(wr * mkLin);

      outL[i] = wl * wet + l * dry;
      if (outR !== outL) outR[i] = wr * wet + r * dry;
    }

    this.gr = gr;
    this.grSlow = slow;
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
registerProcessor('oa-buss-comp', OaBussComp);
`;

let oaBussUrl = null;
// Read by oaPrepareFx() in oaTapeDelay.js, which registers every worklet module
// the effects need in one pass on first use of a context.
window.oaBussModuleUrl = function () {
    if (!oaBussUrl) {
        oaBussUrl = URL.createObjectURL(new Blob([OA_BUSS_WORKLET_SRC], { type: 'application/javascript' }));
    }
    return oaBussUrl;
};

/**
 * The live values behind the panel, resolved through every switch. One place,
 * so the worklet and the native chain cannot drift apart.
 */
const bussSettings = function (u) {
    const on = !!u.on;
    const rel = window.oaBussRelease(u.release);
    // MIX IS DEPRECATED, and this is where it stopped applying.
    //
    // Parallel compression on the MASTER is a control with one right answer and
    // a lot of wrong ones: it is the last thing before the output, so any blend
    // below fully wet is a second, uncompressed copy of the whole record summed
    // back over itself. That is a phase problem before it is a taste problem —
    // the wet path has the compressor's own group delay, so the two copies do
    // not line up, and what sounds like "punch coming back" is a comb filter
    // across the mix. Where parallel belongs is a CHANNEL, and every channel
    // already has it: the strip compressor's BLEND knob.
    //
    // The field survives so that saved settings, songs and the factory presets
    // still load without a special case; it simply no longer reaches the DSP.
    // Fully wet, both laws, always.
    const wet = 1;
    const dry = 0;
    return {
        // Out of circuit, the trim goes with it: IN is a bypass of the whole
        // unit, not of the compression alone.
        trim: on ? Math.pow(10, u.trim / 20) : 1,
        thresh: u.thresh + OA_BUSS_THRESH_REF,
        ratio: window.oaBussRatio(u.ratio),
        attack: window.oaBussAttackTime(u.attack),
        release: rel.sec,
        relMode: rel.auto,
        makeup: on ? Math.pow(10, u.makeup / 20) : 1,
        // The switch and the blend knob are one lever as far as the DSP is
        // concerned: at wet 0 / dry 1 the output is the input, sample for sample.
        wet: on ? wet : 0,
        dry: on ? dry : 1,
        hpf: u.sc < 5 ? 0 : Math.round(u.sc / 10) * 10,
        fb: (on && u.fb) ? 1 : 0,
        lowThd: (on && u.lowThd) ? 1 : 0,
        fourK: (on && u.fourK) ? 1 : 0,
        dist: u.dist,
        scSum: u.scSum ? 1 : 0,
    };
};

/**
 * Which parameters may be SLID to their new value and which have to SNAP.
 *
 * A level can be walked across in twenty milliseconds and the ear hears a move
 * rather than a step. A stepped pot cannot: slide the ratio from 20:1 to -2.5:1
 * and it passes through 1:1 and then through ZERO on the way, and a ratio of
 * zero is a divide by nothing in the gain computer. The mode switches are worse
 * — a boolean that eases from 0 to 1 spends fifteen milliseconds being neither.
 *
 * So: the four continuous controls glide, and every detent and switch is set at
 * the instant it is pressed, which is also what the hardware does.
 */
const BUSS_GLIDE = { trim: 1, thresh: 1, makeup: 1, wet: 1, dry: 1 };

const workletEngine = function (ctx, u, bus) {
    const node = new AudioWorkletNode(ctx, 'oa-buss-comp', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
    });
    const s = bussSettings(u);
    Object.keys(s).forEach(function (k) {
        const p = node.parameters.get(k);
        if (p) p.value = s[k];
    });
    node.port.onmessage = function (e) { bus.gr = e.data; };

    return {
        input: node,
        output: node,
        full: true,
        apply: function (next) {
            const v = bussSettings(next);
            const t = ctx.currentTime;
            Object.keys(v).forEach(function (k) {
                const p = node.parameters.get(k);
                if (!p) return;
                // 20 ms: short enough to feel immediate, long enough that
                // dragging a knob is a slide rather than a staircase of zipper
                // noise. Everything else lands on the sample it was asked for.
                if (BUSS_GLIDE[k]) p.setTargetAtTime(v[k], t, 0.02);
                else p.setValueAtTime(v[k], t);
            });
        },
        gr: null,
    };
};

/**
 * The same shape from native nodes, for browsers without AudioWorklet.
 *
 * What survives: threshold, ratio, attack, release, knee, make-up, trim and the
 * mix blend. What cannot: the browser's compressor has no side-chain input, so
 * the S/C FILTER does nothing; its ratio is clamped at 1, so the three negative
 * positions land on 20:1; there is no way to feed its detector from its own
 * output, so F/B is out; and 44K's saturation and LOW THD's release cap both live
 * inside a per-sample loop that does not exist here. The panel greys those
 * switches out rather than pretending — see `oaBussFullDsp()`.
 */
const nativeEngine = function (ctx, u) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const pre = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const post = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();

    input.connect(pre);
    pre.connect(dry);
    dry.connect(output);
    pre.connect(comp);
    comp.connect(post);
    post.connect(wet);
    wet.connect(output);

    const apply = function (next) {
        const s = bussSettings(next);
        const t = ctx.currentTime;
        pre.gain.setTargetAtTime(s.trim, t, 0.02);
        post.gain.setTargetAtTime(s.makeup, t, 0.02);
        wet.gain.setTargetAtTime(s.wet, t, 0.02);
        dry.gain.setTargetAtTime(s.dry, t, 0.02);
        comp.threshold.setTargetAtTime(Math.max(-100, Math.min(0, s.thresh)), t, 0.02);
        comp.knee.setTargetAtTime(6, t, 0.02);
        // A native ratio cannot go below 1, so a negative position becomes the
        // hardest thing this node can do rather than silently becoming 1:1.
        comp.ratio.setTargetAtTime(s.ratio < 1 ? 20 : Math.min(20, s.ratio), t, 0.02);
        comp.attack.setTargetAtTime(Math.max(0, Math.min(1, s.attack)), t, 0.02);
        // AUTO has no native equivalent; its short stage is the closest honest
        // answer, and it is the stage that does most of the audible work.
        comp.release.setTargetAtTime(Math.max(0.01, Math.min(1, s.release)), t, 0.02);
    };
    apply(u);

    return {
        input: input, output: output, apply: apply, full: false,
        // No message port here — the meter reads the node's own reduction,
        // which the spec reports as a NEGATIVE number of dB.
        gr: function () { return -comp.reduction; },
    };
};

// ---------------------------------------------------------------------------
// The bus itself
// ---------------------------------------------------------------------------

/**
 * Build the master bus, once per AudioContext.
 *
 * Unlike every other insert in the rack this never returns null. There is one
 * master, everything has to sum somewhere, and the meters and the fade need the
 * bus whether or not the compressor is switched in. Out of circuit the engine
 * passes its input through untouched, so "no compression" costs one gain node
 * and a copy rather than a different graph.
 */
// ---------------------------------------------------------------------------
// Hard bypass
//
// Switching the compressor OUT (the IN button) makes it a wire, sample for
// sample — but a wire that is still a worklet, and a worklet in the path costs
// one render quantum of latency whatever it does with the samples. That is
// nothing while you are mixing and it is the whole problem while you are
// playing: finger-drumming into the sequencer, every millisecond between the
// pad and the speaker is one you can feel.
//
// So this ROUTES AROUND the engine rather than asking it to pass audio through:
// input goes straight to the fade, and the compressor node is left connected to
// the fade with nothing feeding it. Its own process() then sees no input, so it
// reports zero reduction and the meter falls to zero on its own — no special
// case, and no click, because nothing about the audio path's gain changed.
//
// The fade and the meters stay in circuit either way. They are not effects.
// ---------------------------------------------------------------------------

window.OA_BUSS_BYPASS = false;

const applyBussBypass = function (bus, on) {
    if (!bus || !bus.engine) return;
    // `input` feeds exactly one node, so disconnecting it wholesale is safe and
    // avoids having to remember which of the two it was wired to.
    try { bus.input.disconnect(); } catch (e) {}
    if (on) bus.input.connect(bus.fade);
    else bus.input.connect(bus.engine.input);
    bus.bypassed = !!on;
};

/** Take the buss compressor out of the signal path entirely, or put it back. */
window.oaSetMasterBypass = function (on) {
    window.OA_BUSS_BYPASS = !!on;
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaBuss;
    if (bus) applyBussBypass(bus, window.OA_BUSS_BYPASS);
};

/** Is the master compressor currently routed around? */
window.oaMasterBypassed = function () { return !!window.OA_BUSS_BYPASS; };

const masterBus = function (ctx, dest) {
    if (!ctx) return null;
    if (ctx.__oaBuss) return ctx.__oaBuss;

    const u = window.oaBussUnit();
    const input = ctx.createGain();
    const fade = ctx.createGain();
    const output = ctx.createGain();

    const bus = {
        input: input, fade: fade, output: output,
        engine: null, gr: 0, analysers: null,
        // The FADE ramp, remembered rather than read back off the node: an
        // AudioParam mid-automation is not a number a display can ask for
        // portably, and the panel needs to draw the fade's progress. Stored as
        // the two ends and the two times, so the position is arithmetic.
        ramp: { from: 1, to: 1, t0: 0, t1: 0 },
    };

    try {
        // A voice may be built before the module has finished registering. The
        // native chain is synchronous and always available, so an unresolved
        // worklet falls back rather than leaving the MIX silent while it waits
        // — which on an OfflineAudioContext would be the whole render.
        bus.engine = ctx.__oaWorkletOk ? workletEngine(ctx, u, bus) : nativeEngine(ctx, u);
    } catch (e) {
        console.warn('⚠️ [Buss] worklet node failed, using native chain:', e && e.message);
        bus.engine = nativeEngine(ctx, u);
    }

    input.connect(bus.engine.input);
    bus.engine.output.connect(fade);
    fade.connect(output);
    // Where the whole mix lands. `ctx.destination` unless a HOST says otherwise
    // — APK:OS's Mixer sums the app's mix into its own master so the shell's
    // master fader and limiter ride it, rather than having two mixes arrive at
    // the speakers past each other. Fixed at build time like every other
    // destination in this rack, and for the same reason: there is one bus.
    output.connect(dest || ctx.destination);

    // Two analysers, split, because this is the one meter in the app that has a
    // genuine left and a genuine right to show: the detector is linked but the
    // audio is not, and a mix IS wider on one side than the other.
    if (ctx.createAnalyser && ctx.createChannelSplitter) {
        const split = ctx.createChannelSplitter(2);
        output.connect(split);
        bus.analysers = [0, 1].map(function (ch) {
            const a = ctx.createAnalyser();
            a.fftSize = 1024;
            split.connect(a, ch);
            return a;
        });
        bus.split = split;
    }

    // A bypass asked for before the bus existed — record mode armed on a page
    // that has not made a sound yet — has to land when it is finally built.
    if (window.OA_BUSS_BYPASS) applyBussBypass(bus, true);

    ctx.__oaBuss = bus;
    return bus;
};

// ---------------------------------------------------------------------------
// THE AUDIO PORT.
//
// The bus builder and the bus object are FILE-LOCAL. Everything else in the
// rack gets back one node to sum into and never learns what is behind it — the
// same bargain oaReverbInput / oaDelayInput / oaCompInput make, except this one
// is never null, because a mix has to go somewhere.
// ---------------------------------------------------------------------------

/**
 * THE INPUT PORT: the node the whole mix sums into. Falls back to the context's
 * own destination only if the bus cannot be built at all, so a failure here
 * costs the compressor rather than the sound.
 */
window.oaMasterInput = function (ctx, dest) {
    const bus = masterBus(ctx, dest);
    return (bus && bus.input) || (ctx && ctx.destination) || null;
};

/** Build the bus once the worklet answer is in, so it does not take the fallback. */
window.oaMasterWarm = function (ctx, dest) { masterBus(ctx, dest); };

/** 1 once the master exists — for the voice diagnostic's bus count. */
window.oaMasterBusCount = function (ctx) { return (ctx && ctx.__oaBuss) ? 1 : 0; };

/** Gain reduction right now, in dB. 0 when nothing is running. */
window.oaBussGR = function () {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaBuss;
    if (!bus) return 0;
    if (bus.engine && bus.engine.gr) return Math.max(0, bus.engine.gr());
    return Math.max(0, bus.gr || 0);
};

/**
 * Is the FULL per-sample DSP running, or the native fallback? The panel asks so it
 * can grey out the four switches that a native chain cannot honour, rather than
 * offering controls that quietly do nothing.
 */
window.oaBussFullDsp = function () {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaBuss;
    return !bus || !bus.engine ? true : !!bus.engine.full;
};

// ---------------------------------------------------------------------------
// The fade
// ---------------------------------------------------------------------------

/**
 * Where the fade gain is right now, 0..1. Computed from the stored ramp rather
 * than read off the node, so it answers the same on an offline render, in a
 * test, and in a browser part-way through an automation.
 */
const fadeAt = function (bus, now) {
    const r = bus.ramp;
    if (!r || now >= r.t1) return r ? r.to : 1;
    if (now <= r.t0) return r.from;
    return r.from + (r.to - r.from) * ((now - r.t0) / (r.t1 - r.t0));
};

window.oaBussFade = function () {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaBuss;
    if (!bus) return 1;
    return fadeAt(bus, ctx.currentTime);
};

/**
 * Start the fade, or bring it back. A linear ramp because that is what a hand on
 * a fader does — an exponential one to zero is not even legal, and a smoothed
 * one arrives late and then hurries, which is audible over half a minute.
 *
 * It rides a gain AFTER the compressor on purpose. Fade in front of the
 * detector and the compressor hears the mix getting quieter, lets go, and pushes
 * the level back up — the fade fights itself and never quite ends.
 */
const applyFade = function (ctx, down, seconds) {
    // Build the bus rather than give up on it. FADE is reachable from the mixer
    // before a note has been played, and a button that lights but does nothing
    // is worse than one that does not light.
    const bus = masterBus(ctx);
    if (!bus) return;
    const now = ctx.currentTime;
    const from = fadeAt(bus, now);
    const to = down ? 0 : 1;
    // Time the ramp by DISTANCE REMAINING, so aborting a fade half way down
    // comes back up at the same rate it went down rather than snapping.
    const span = Math.max(0.01, Math.abs(to - from)) * Math.max(1, seconds);
    bus.ramp = { from: from, to: to, t0: now, t1: now + span };
    try {
        bus.fade.gain.cancelScheduledValues(now);
        bus.fade.gain.setValueAtTime(from, now);
        bus.fade.gain.linearRampToValueAtTime(to, now + span);
    } catch (e) {
        bus.fade.gain.value = to;
    }
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const pushToBus = function () {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaBuss;
    if (bus && bus.engine) bus.engine.apply(window.oaBussUnit());
};

window.oaSetBuss = function (key, value) {
    const u = window.oaBussUnit();
    if (key === 'fade') {
        // Not a stored setting — a transport action. The button reports the
        // ramp's direction back through the frame, so nothing has to remember
        // it twice.
        const ctx = window.OA_AUDIO_CTX;
        if (ctx) applyFade(ctx, !!value, u.rate);
        window.dispatchEvent(new CustomEvent('oa-buss-changed', { detail: { key: 'fade' } }));
        return;
    }
    if (BUSS_FLAGS.indexOf(key) >= 0) {
        u[key] = !!value;
    } else {
        const p = window.OA_BUSS_PARAMS.find(function (q) { return q.key === key; });
        if (!p) return;
        const v = Number(value);
        u[key] = Math.max(p.min, Math.min(p.max, isFinite(v) ? v : p.def));
    }
    window.oaSaveBuss();
    pushToBus();
    window.dispatchEvent(new CustomEvent('oa-buss-changed', { detail: { key: key } }));
};

window.oaApplyBussPreset = function (name) {
    const preset = window.OA_BUSS_PRESETS[name];
    if (!preset) return;
    const u = window.oaBussUnit();
    // A preset that named only the knobs it cared about would leave the last
    // one's switches in — load "Mastering Touch" after "44K Grit" and the grit
    // stays. Every flag is written on every load, present or not.
    BUSS_FLAGS.forEach(function (k) { u[k] = !!preset[k]; });
    window.OA_BUSS_PARAMS.forEach(function (p) {
        if (typeof preset[p.key] === 'number') u[p.key] = Math.max(p.min, Math.min(p.max, preset[p.key]));
    });
    window.oaSaveBuss();
    pushToBus();
    window.dispatchEvent(new CustomEvent('oa-buss-changed', { detail: { preset: name } }));
};

/**
 * Tear the bus out of a context. Everything in the rack ends up wired through
 * here, so if anything holds on after a context is abandoned this is where it
 * shows — which is exactly what the leak tests point at.
 */
window.oaDisposeBuss = function (ctx) {
    const bus = ctx && ctx.__oaBuss;
    if (!bus) return;
    // The worklet's message port keeps a reference to `bus` through its
    // onmessage closure. Cutting it is what actually lets the bus go.
    if (bus.engine && bus.engine.input && bus.engine.input.port) {
        bus.engine.input.port.onmessage = null;
    }
    window.oaDisconnectAll([
        bus.input, bus.fade, bus.output, bus.split,
        bus.engine && bus.engine.input,
        bus.engine && bus.engine.output,
    ].concat(bus.analysers || []));
    ctx.__oaBuss = null;
};

// ---------------------------------------------------------------------------
// The back end, as the front panel sees it. Everything above this line is DSP;
// everything the editor is allowed to touch is declared here. See oaPlugin.js.
// ---------------------------------------------------------------------------

window.oaRegisterPlugin({
    id: 'buss',
    label: 'Buss Compressor',
    event: 'oa-buss-changed',
    // One master bus. The index every front-end call carries is ignored, which
    // is the honest answer for a unit there can only ever be one of.
    units: function () { return 1; },
    params: window.OA_BUSS_PARAMS,
    presets: window.OA_BUSS_PRESETS,
    state: function () { return window.oaBussUnit(); },
    set: function (i, key, value) { window.oaSetBuss(key, value); },
    preset: function (i, name) { window.oaApplyBussPreset(name); },

    /**
     * The one master unit: every switch and every knob. There is no `units`
     * array here because there is only ever one of these, so the saved shape is
     * flat rather than a list of one.
     */
    save: function () {
        const u = window.oaBussUnit();
        const o = {};
        window.OA_BUSS_SWITCHES.forEach(function (s) { o[s.key] = !!u[s.key]; });
        window.OA_BUSS_PARAMS.forEach(function (p) { o[p.key] = u[p.key]; });
        return o;
    },

    /**
     * Put it back through oaSetBuss(), which clamps, persists and pushes at the
     * running engine.
     *
     * `on` goes LAST, for the same reason it does on the channel strips: every
     * other setter pushes to the bus, and half-loading a master that is already
     * in circuit means the whole mix is briefly compressed by a mixture of the
     * old settings and the new ones — on the MASTER, where everything is
     * audible at once.
     */
    load: function (data) {
        if (!data || typeof data !== 'object') return;
        window.OA_BUSS_PARAMS.forEach(function (p) {
            if (data[p.key] !== undefined) window.oaSetBuss(p.key, data[p.key]);
        });
        window.OA_BUSS_SWITCHES.forEach(function (s) {
            if (s.key !== 'on' && data[s.key] !== undefined) window.oaSetBuss(s.key, !!data[s.key]);
        });
        if (data.on !== undefined) window.oaSetBuss('on', !!data.on);
    },

    // GR and the fade position are the two things this unit measures that the
    // shared four do not already carry. Every switch is a SETTING and comes back
    // through state() — a frame carries what is measured, not what is set.
    slots: window.OA_SLOT.USER + 2,
    layout: {
        /** Gain reduction being applied right now, in dB. */
        GR: window.OA_SLOT.USER,
        /** The master fade gain, 0..1. 1 unless a fade is running or ended. */
        FADE: window.OA_SLOT.USER + 1,
    },

    read: function (ctx, i, frame) {
        const S = window.OA_SLOT;
        frame[S.ACTIVE] = window.oaBussActive() ? 1 : 0;
        const bus = ctx && ctx.__oaBuss;
        if (!bus) {
            frame[S.PEAK_L] = 0;
            frame[S.PEAK_R] = 0;
            frame[S.USER] = 0;
            frame[S.USER + 1] = 1;
            return;
        }
        const a = bus.analysers;
        window.oaWritePeak(frame, S.PEAK_L, a ? window.oaAnalyserPeak(a[0]) : 0);
        window.oaWritePeak(frame, S.PEAK_R, a ? window.oaAnalyserPeak(a[1]) : 0);
        frame[S.USER] = window.oaBussGR();
        frame[S.USER + 1] = fadeAt(bus, ctx.currentTime);
    },

    /**
     * Everything on the faceplate, as one flat object. There is one master, so
     * unlike the per-channel units this is not an array.
     *
     * The FADE is not here on purpose: it is a transport action, not a setting.
     * A song that reloaded with the master already half way to silence, and no
     * control on screen admitting why, is the worst kind of bug — inaudible to
     * describe and instantly audible to suffer.
     */
    save: function () {
        const u = window.oaBussUnit();
        const o = {};
        BUSS_FLAGS.forEach(function (k) { o[k] = u[k]; });
        window.OA_BUSS_PARAMS.forEach(function (p) { o[p.key] = u[p.key]; });
        return o;
    },

    /**
     * Put them back through oaSetBuss(), which clamps, persists, pushes at
     * whichever engine is running and fires the change event.
     *
     * `on` goes LAST, for the reason the channel strip's loader gives and more
     * so: every other setter pushes to the bus, and pushing a half-loaded
     * compressor that is already in circuit means the WHOLE MIX is briefly
     * squashed by a mixture of the old settings and the new ones.
     */
    load: function (data) {
        if (!data || typeof data !== 'object') return;
        window.OA_BUSS_PARAMS.forEach(function (p) {
            if (data[p.key] !== undefined) window.oaSetBuss(p.key, data[p.key]);
        });
        BUSS_FLAGS.forEach(function (k) {
            if (k !== 'on') window.oaSetBuss(k, !!data[k]);
        });
        window.oaSetBuss('on', !!data.on);
    },

    dispose: window.oaDisposeBuss,
});
