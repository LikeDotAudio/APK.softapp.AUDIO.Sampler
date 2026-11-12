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
 * Header: oaBussCompWorklet.js
 * Purpose: The buss compressor's AudioWorklet — the per-sample DSP — and the
 *   Blob URL it is registered from.
 * Description: Kept out of oaBussComp.js, which owns the master bus this runs
 *   across. Nothing here is file-local to anyone else: the source string is
 *   private to this file and `window.oaBussModuleUrl()` is the one way in,
 *   read by oaPrepareFx() (oaTapeDelay.js). Loaded before oaBussComp.js.
 */

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

  // THE GUARD — PLAN-3315.01. This runs on the context's render thread, and
  // a throw in here used to end this node for the life of the context while a
  // NaN in the state walked straight out of it into the master. Now a block
  // that throws is a block of silence and the node lives, and a sample that is
  // not a finite number — or is a denormal on its way to becoming one — leaves
  // as zero. The DSP itself is render(), unchanged.
  process(inputs, outputs, params) {
    let alive = true;
    try {
      alive = this.render(inputs, outputs, params);
    } catch (e) {
      this.faults = (this.faults || 0) + 1;
      for (let o = 0; o < outputs.length; o++) {
        for (let c = 0; c < outputs[o].length; c++) outputs[o][c].fill(0);
      }
      return true;
    }
    for (let o = 0; o < outputs.length; o++) {
      for (let c = 0; c < outputs[o].length; c++) {
        const ch = outputs[o][c];
        for (let i = 0; i < ch.length; i++) {
          const x = ch[i];
          if (!Number.isFinite(x) || (x < 1e-30 && x > -1e-30)) ch[i] = 0;
        }
      }
    }
    return alive;
  }

  render(inputs, outputs, params) {
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
