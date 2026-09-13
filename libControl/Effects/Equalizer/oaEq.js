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
 * Header: oaEq.js
 * Purpose: A channel equaliser — the tenth plugin, and the one three front
 *   panels were already drawing before it existed.
 * Description: This unit was carved as PLAN-18.03, and the plan's first line is
 *   the only interesting thing about its design: THREE SURFACES DID NOT AGREE ON
 *   WHAT AN EQ IS.
 *
 *     SPOG's channel strip publishes eqHi / eqMid / eqLo — three trims, 0..1,
 *     0.5 meaning flat. That is a console EQ: three knobs, fixed roles, no
 *     question about which band is which.
 *
 *     FrontEnd/libControl/graphing/Equalization/Equalization.jsx is 883 lines
 *     of parametric — arbitrary bands, bell/shelf/HP/LP, dragged on a response
 *     curve, with an FIR export behind a radix-2 FFT.
 *
 *   Building either one first paints the other into a corner. Build the three-
 *   band console EQ and the parametric panel has nothing to drive; build a bare
 *   parametric and SPOG's three knobs have no fixed bands to land on.
 *
 *   THE RATIFIED SHAPE (2026-08-29) IS A PARAMETRIC WITH NAMED BANDS. Bands are
 *   a list, as a parametric needs, and the FIRST THREE ARE FIXED ROLES that
 *   cannot be removed or retyped:
 *
 *     lo    low shelf,   40..400 Hz      <- SPOG eqLo
 *     mid   peaking,     200..8000 Hz    <- SPOG eqMid
 *     hi    high shelf,  2000..16000 Hz  <- SPOG eqHi
 *
 *   Everything past those three is a free band the parametric panel may add,
 *   move, retype or delete. So one unit serves both panels, and neither is
 *   pretending to be the other: SPOG drives three named bands by name, and
 *   Equalization.jsx drives the whole list.
 *
 *   WHY THE FLAT PARAM SCHEMA ONLY CARRIES THE THREE. `params` in this tree is
 *   a fixed faceplate — a list of knobs a panel draws — and a parametric EQ has
 *   no fixed number of knobs. Rather than fake it, the schema declares exactly
 *   the seven controls of the three named bands, which is what a console strip
 *   and PLAN-18.01's adapter can actually project onto a ParamSpec. The free
 *   bands are reached through oaEqBands() / oaEqSetBand(), which is a richer
 *   interface for the one panel that needs it. Both write the same unit and
 *   both are heard through the same node graph — there is no second model.
 *
 *   TRANSPARENT UNTIL ASKED, like the pedal above it in the chain. Every band
 *   defaults to 0 dB, oaEqActive() is false, and oaEqNode() builds NO NODES AT
 *   ALL — the voice connects onward exactly as it did before this file existed.
 *   Not "EQ set flat", which still costs three biquads a voice; EQ not present.
 *
 *   THE CURVE IS OUR OWN ARITHMETIC, NOT getFrequencyResponse(). A display
 *   plotting the response could ask the BiquadFilterNodes what they do, and
 *   that would be one more thing the UI knows about the node graph — the exact
 *   coupling oaPlugin.js exists to prevent. Worse, it needs an AudioContext, so
 *   the picture could never be tested without one. The coefficients below are
 *   the RBJ cookbook formulas the browser itself implements; we evaluate them
 *   directly, hand the panel a Float32Array of decibels, and the same numbers
 *   come out in a headless test as come out of the speakers.
 */

// A band doing less than this much is doing nothing audible, and building a
// biquad for it costs a node per voice for a change nobody can hear.
window.OA_EQ_EPSILON = 0.05;

// How many free bands the parametric panel may add on top of the fixed three.
// A cap exists because every band is a real BiquadFilterNode on every voice;
// eleven bands on a busy pad grid is already a lot of nodes.
window.OA_EQ_FREE_MAX = 8;

// The response curve's resolution, log-spaced from 20 Hz to 20 kHz. 256 points
// is a smooth line at any panel width anyone has drawn this on.
window.OA_EQ_CURVE_POINTS = 256;
const OA_EQ_CURVE_LO = 20;
const OA_EQ_CURVE_HI = 20000;

const dbfmt = function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'; };
const hzfmt = function (v) {
    return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz' : Math.round(v) + ' Hz';
};

/**
 * THE THREE NAMED BANDS. `role: 'fixed'` is not decoration — oaEqSetBand()
 * refuses to retype or remove one, because SPOG's three knobs bind to these
 * ids and a band that changed out from under them would leave a strip driving
 * something that is no longer an EQ band.
 */
window.OA_EQ_NAMED = [
    { id: 'lo',  role: 'fixed', type: 'lowshelf',  label: 'Low',  gainKey: 'loGain',  freqKey: 'loFreq',  qKey: null },
    { id: 'mid', role: 'fixed', type: 'peaking',   label: 'Mid',  gainKey: 'midGain', freqKey: 'midFreq', qKey: 'midQ' },
    { id: 'hi',  role: 'fixed', type: 'highshelf', label: 'High', gainKey: 'hiGain',  freqKey: 'hiFreq',  qKey: null },
];

/**
 * The faceplate. Seven controls, all continuous — an EQ has no detents, and a
 * band's frequency between two marked values is a real setting rather than a
 * rounding error, which is exactly what `kind: 'continuous'` means here.
 *
 * The shelves declare no Q. Web Audio's lowshelf and highshelf ignore the Q
 * parameter entirely (they are fixed at S = 1), so advertising a Q knob for
 * them would publish a control whose writes land nowhere — the silent-success
 * shape this repository keeps finding, and the same reason PLAN-18.01's adapter
 * refuses to mark a deprecated param writable.
 */
window.OA_EQ_PARAMS = [
    { key: 'loGain',  kind: 'continuous', label: 'Low',    min: -18,  max: 18,    def: 0,    log: false, unit: 'dB', fmt: dbfmt },
    { key: 'loFreq',  kind: 'continuous', label: 'Lo Freq', min: 40,  max: 400,   def: 100,  log: true,  unit: 'Hz', fmt: hzfmt },
    { key: 'midGain', kind: 'continuous', label: 'Mid',    min: -18,  max: 18,    def: 0,    log: false, unit: 'dB', fmt: dbfmt },
    { key: 'midFreq', kind: 'continuous', label: 'Mid Freq', min: 200, max: 8000, def: 1000, log: true,  unit: 'Hz', fmt: hzfmt },
    { key: 'midQ',    kind: 'continuous', label: 'Mid Q',  min: 0.3,  max: 8,     def: 0.9,  log: true,  fmt: function (v) { return v.toFixed(2); } },
    { key: 'hiGain',  kind: 'continuous', label: 'High',   min: -18,  max: 18,    def: 0,    log: false, unit: 'dB', fmt: dbfmt },
    { key: 'hiFreq',  kind: 'continuous', label: 'Hi Freq', min: 2000, max: 16000, def: 8000, log: true, unit: 'Hz', fmt: hzfmt },
];

/** The filter shapes a FREE band may take. The named three are not retypeable. */
window.OA_EQ_TYPES = ['peaking', 'lowshelf', 'highshelf', 'lowpass', 'highpass', 'notch'];

// ---------------------------------------------------------------------------
// SPOG's trims
//
// A strip publishes ch{n}_eq_hi / _mid / _lo as 0..1 with 0.5 meaning flat —
// see vendor/spog/src/editors/audio-mixer/state.ts. This unit works in decibels
// because that is what an EQ is. The conversion is stated ONCE, here, in both
// directions, so a bridge cannot invent its own and drift: a trim of 0.5 must
// come back as exactly 0 dB, or a strip that has never been touched would tilt
// the sound the moment the bridge came up.
// ---------------------------------------------------------------------------

/** SPOG trim (0..1, 0.5 flat) -> decibels (-18..+18). */
window.oaEqFromTrim = function (t) {
    const v = Math.max(0, Math.min(1, Number(t)));
    if (!isFinite(v)) return 0;
    return (v - 0.5) * 36;
};

/** Decibels (-18..+18) -> SPOG trim (0..1, 0.5 flat). */
window.oaEqToTrim = function (db) {
    const v = Number(db);
    if (!isFinite(v)) return 0.5;
    return Math.max(0, Math.min(1, v / 36 + 0.5));
};

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

const eqFree = function (saved) {
    const s = saved || {};
    const type = window.OA_EQ_TYPES.indexOf(s.type) >= 0 ? s.type : 'peaking';
    const f = Number(s.freq);
    const g = Number(s.gain);
    const q = Number(s.q);
    return {
        type: type,
        freq: isFinite(f) ? Math.max(20, Math.min(20000, f)) : 1000,
        gain: isFinite(g) ? Math.max(-18, Math.min(18, g)) : 0,
        q: isFinite(q) ? Math.max(0.1, Math.min(18, q)) : 0.9,
        on: s.on !== false,
    };
};

// Fill in whatever a saved unit is missing and drop anything out of range, so a
// hand-edited or half-written localStorage entry still comes up playable.
const eqUnit = function (saved) {
    const s = saved || {};
    const out = {};
    window.OA_EQ_PARAMS.forEach(function (p) {
        const v = Number(s[p.key]);
        out[p.key] = isFinite(v) ? Math.max(p.min, Math.min(p.max, v)) : p.def;
    });
    const free = Array.isArray(s.free) ? s.free : [];
    out.free = free.slice(0, window.OA_EQ_FREE_MAX).map(eqFree);
    return out;
};

window.OA_EQ = (function () {
    let saved = null;
    try { saved = JSON.parse(window.localStorage.getItem('oaEq')); } catch (e) {}
    const units = (saved && Array.isArray(saved.units)) ? saved.units : [];
    // Sized for the LARGEST grid, like every other per-channel array, so
    // shrinking the pad layout and growing it back finds pad 25's EQ intact.
    const out = [];
    for (let i = 0; i < window.OA_PAD_MAX; i++) out.push(eqUnit(units[i]));
    return { units: out };
})();

window.oaEqUnit = function (idx) {
    return window.OA_EQ.units[idx] || window.OA_EQ.units[0];
};

window.oaSaveEq = function () {
    try {
        window.localStorage.setItem('oaEq', JSON.stringify({
            units: window.OA_EQ.units.map(function (u) {
                const o = {};
                window.OA_EQ_PARAMS.forEach(function (p) { o[p.key] = u[p.key]; });
                o.free = u.free.map(function (b) {
                    return { type: b.type, freq: b.freq, gain: b.gain, q: b.q, on: b.on };
                });
                return o;
            })
        }));
    } catch (e) {}
};

// ---------------------------------------------------------------------------
// The band list — the parametric view of the same unit
// ---------------------------------------------------------------------------

/**
 * Every band on this channel, in signal order: the three named ones first, then
 * whatever the parametric panel has added. A band is plain data — no nodes, no
 * context — so a display can draw the whole EQ without an AudioContext.
 */
window.oaEqBands = function (idx) {
    const u = window.oaEqUnit(idx);
    const out = window.OA_EQ_NAMED.map(function (n) {
        return {
            id: n.id,
            role: 'fixed',
            label: n.label,
            type: n.type,
            freq: u[n.freqKey],
            gain: u[n.gainKey],
            // A shelf has no Q in Web Audio; report the value the filter will
            // actually use rather than a number the panel could move for nothing.
            q: n.qKey ? u[n.qKey] : 0.707,
            on: true,
        };
    });
    u.free.forEach(function (b, i) {
        out.push({
            id: 'free' + i, role: 'free', label: 'Band ' + (i + 1),
            type: b.type, freq: b.freq, gain: b.gain, q: b.q, on: b.on,
        });
    });
    return out;
};

const freeIndex = function (id) {
    const m = /^free(\d+)$/.exec(String(id));
    return m ? Number(m[1]) : -1;
};

/**
 * Write one band's one field. The named three write straight through to the
 * flat params, so a parametric drag and a SPOG knob move land on the same
 * numbers — there is no second copy of the low shelf's gain to fall out of step.
 */
window.oaEqSetBand = function (idx, id, key, value) {
    const named = window.OA_EQ_NAMED.find(function (n) { return n.id === id; });
    if (named) {
        // A fixed band's role IS its identity. Retyping it or switching it off
        // would leave SPOG's strip driving a band that is no longer the band it
        // named, so those two writes are refused rather than half-applied.
        if (key === 'type' || key === 'on') return;
        if (key === 'gain') return window.oaSetEq(idx, named.gainKey, value);
        if (key === 'freq') return window.oaSetEq(idx, named.freqKey, value);
        if (key === 'q' && named.qKey) return window.oaSetEq(idx, named.qKey, value);
        return;
    }

    const u = window.oaEqUnit(idx);
    const i = freeIndex(id);
    if (i < 0 || !u.free[i]) return;
    const b = u.free[i];
    if (key === 'type') {
        if (window.OA_EQ_TYPES.indexOf(value) < 0) return;
        b.type = value;
    } else if (key === 'on') {
        b.on = !!value;
    } else if (key === 'freq') {
        b.freq = Math.max(20, Math.min(20000, Number(value) || 0));
    } else if (key === 'gain') {
        b.gain = Math.max(-18, Math.min(18, Number(value) || 0));
    } else if (key === 'q') {
        b.q = Math.max(0.1, Math.min(18, Number(value) || 0));
    } else {
        return;
    }
    window.oaSaveEq();
    window.dispatchEvent(new CustomEvent('oa-eq-changed', { detail: { idx: idx, band: id, key: key } }));
};

/** Add a free band. Returns its id, or null if the channel is already full. */
window.oaEqAddBand = function (idx, band) {
    const u = window.oaEqUnit(idx);
    if (u.free.length >= window.OA_EQ_FREE_MAX) return null;
    u.free.push(eqFree(band));
    window.oaSaveEq();
    const id = 'free' + (u.free.length - 1);
    window.dispatchEvent(new CustomEvent('oa-eq-changed', { detail: { idx: idx, band: id, added: true } }));
    return id;
};

/** Remove a free band. The named three are not removable and return false. */
window.oaEqRemoveBand = function (idx, id) {
    const i = freeIndex(id);
    const u = window.oaEqUnit(idx);
    if (i < 0 || !u.free[i]) return false;
    u.free.splice(i, 1);
    window.oaSaveEq();
    window.dispatchEvent(new CustomEvent('oa-eq-changed', { detail: { idx: idx, band: id, removed: true } }));
    return true;
};

// ---------------------------------------------------------------------------
// The maths — RBJ cookbook biquads, and the response they produce
// ---------------------------------------------------------------------------

/**
 * A band's biquad coefficients at a given sample rate, normalised so a0 = 1.
 * These are the formulas a BiquadFilterNode runs; writing them out is what lets
 * the response curve be computed — and therefore tested — without an
 * AudioContext anywhere near it.
 */
window.oaEqCoeffs = function (band, sampleRate) {
    const sr = sampleRate > 0 ? sampleRate : window.oaSampleRate();
    // Above Nyquist a filter has no meaning; clamp rather than emit NaN, which
    // would poison the whole curve rather than one point of it.
    const f = Math.max(1, Math.min(band.freq, sr * 0.4999));
    const w0 = 2 * Math.PI * f / sr;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const Q = Math.max(0.0001, band.q || 0.707);
    const A = Math.pow(10, (band.gain || 0) / 40);

    let b0, b1, b2, a0, a1, a2;
    switch (band.type) {
        case 'lowshelf': {
            // Web Audio's shelves are fixed at S = 1 and ignore Q, so alpha
            // reduces to sin(w0)/2 * sqrt(2) — see the note on OA_EQ_PARAMS.
            const al = sw / 2 * Math.SQRT2;
            const ta = 2 * Math.sqrt(A) * al;
            b0 = A * ((A + 1) - (A - 1) * cw + ta);
            b1 = 2 * A * ((A - 1) - (A + 1) * cw);
            b2 = A * ((A + 1) - (A - 1) * cw - ta);
            a0 = (A + 1) + (A - 1) * cw + ta;
            a1 = -2 * ((A - 1) + (A + 1) * cw);
            a2 = (A + 1) + (A - 1) * cw - ta;
            break;
        }
        case 'highshelf': {
            const al = sw / 2 * Math.SQRT2;
            const ta = 2 * Math.sqrt(A) * al;
            b0 = A * ((A + 1) + (A - 1) * cw + ta);
            b1 = -2 * A * ((A - 1) + (A + 1) * cw);
            b2 = A * ((A + 1) + (A - 1) * cw - ta);
            a0 = (A + 1) - (A - 1) * cw + ta;
            a1 = 2 * ((A - 1) - (A + 1) * cw);
            a2 = (A + 1) - (A - 1) * cw - ta;
            break;
        }
        case 'lowpass': {
            const al = sw / (2 * Q);
            b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
            a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
            break;
        }
        case 'highpass': {
            const al = sw / (2 * Q);
            b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
            a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
            break;
        }
        case 'notch': {
            const al = sw / (2 * Q);
            b0 = 1; b1 = -2 * cw; b2 = 1;
            a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
            break;
        }
        default: {   // peaking
            const al = sw / (2 * Q);
            b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A;
            a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A;
            break;
        }
    }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
};

/** |H(e^jw)| in decibels for one band at one frequency. */
window.oaEqBandDb = function (band, freq, sampleRate) {
    const sr = sampleRate > 0 ? sampleRate : window.oaSampleRate();
    const c = window.oaEqCoeffs(band, sr);
    const w = 2 * Math.PI * Math.min(freq, sr * 0.4999) / sr;
    const c1 = Math.cos(w), s1 = Math.sin(w);
    const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = c.b0 + c.b1 * c1 + c.b2 * c2;
    const ni = -(c.b1 * s1 + c.b2 * s2);
    const dr = 1 + c.a1 * c1 + c.a2 * c2;
    const di = -(c.a1 * s1 + c.a2 * s2);
    const den = dr * dr + di * di;
    if (den <= 0) return 0;
    const mag2 = (nr * nr + ni * ni) / den;
    // A notch at its centre is mathematically -inf; the floor keeps a plot
    // finite and is well below anything a display would draw.
    return mag2 <= 1e-12 ? -120 : 10 * Math.log10(mag2);
};

/**
 * The whole EQ's response, 256 points log-spaced 20 Hz..20 kHz, in decibels.
 * Bands in series multiply, so their decibels add — which is the one line of
 * arithmetic that makes a stacked EQ plot correct rather than approximately
 * correct.
 *
 * Returns a Float32Array the back end owns and reuses. Read it, plot it, do not
 * write it — the same contract as every other curve in this tree.
 */
const EQ_CURVES = {};
window.oaEqCurve = function (idx, sampleRate) {
    const n = window.OA_EQ_CURVE_POINTS;
    if (!EQ_CURVES[idx]) EQ_CURVES[idx] = new Float32Array(n);
    const out = EQ_CURVES[idx];
    const bands = window.oaEqBands(idx).filter(function (b) { return b.on; });
    const sr = sampleRate > 0 ? sampleRate : window.oaSampleRate();
    const lo = Math.log(OA_EQ_CURVE_LO), hi = Math.log(OA_EQ_CURVE_HI);
    for (let i = 0; i < n; i++) {
        const f = Math.exp(lo + (hi - lo) * (i / (n - 1)));
        let db = 0;
        for (let b = 0; b < bands.length; b++) db += window.oaEqBandDb(bands[b], f, sr);
        out[i] = db;
    }
    return out;
};

/** The frequency, in Hz, that curve point `i` was measured at. */
window.oaEqCurveFreq = function (i) {
    const n = window.OA_EQ_CURVE_POINTS;
    const lo = Math.log(OA_EQ_CURVE_LO), hi = Math.log(OA_EQ_CURVE_HI);
    return Math.exp(lo + (hi - lo) * (Math.max(0, Math.min(n - 1, i)) / (n - 1)));
};

// ---------------------------------------------------------------------------
// The node graph
// ---------------------------------------------------------------------------

/** Is this band doing anything a listener could hear? */
const bandBites = function (b) {
    if (!b.on) return false;
    // A pass or notch filter shapes the sound whatever its gain says; a shelf or
    // bell at 0 dB is a wire.
    if (b.type === 'lowpass' || b.type === 'highpass' || b.type === 'notch') return true;
    return Math.abs(b.gain) > window.OA_EQ_EPSILON;
};

/** Is this channel's EQ doing anything at all? */
window.oaEqActive = function (idx) {
    return window.oaEqBands(idx).some(bandBites);
};

/**
 * Build the EQ for one channel, or DO NOT BUILD IT. Returns the input node the
 * caller should feed, or null on a flat channel — in which case nothing was
 * built and the caller connects onward exactly as before, bit for bit.
 *
 *   in ─ band ─ band ─ … ─ dest
 *
 * Per voice rather than per channel, like the pedal it sits in front of: a knob
 * move lands on the next hit instead of re-shaping notes already ringing. Bands
 * that are not biting are skipped entirely, so a channel using only the low
 * shelf costs one filter and not eleven.
 */
window.oaEqNode = function (ctx, idx, dest, chain) {
    const bands = window.oaEqBands(idx).filter(bandBites);
    if (!bands.length) return null;

    const keep = function (n) { if (chain) chain.push(n); return n; };
    const input = keep(ctx.createGain());
    let tail = input;

    for (let i = 0; i < bands.length; i++) {
        const b = bands[i];
        const f = keep(ctx.createBiquadFilter());
        f.type = b.type;
        f.frequency.value = b.freq;
        f.Q.value = b.q;
        // Only the shaping filters have a gain; setting it on a lowpass is
        // ignored by the browser, so we do not pretend otherwise.
        if (b.type === 'peaking' || b.type === 'lowshelf' || b.type === 'highshelf') {
            f.gain.value = b.gain;
        }
        tail.connect(f);
        tail = f;
    }

    tail.connect(dest);
    return input;
};

window.oaSetEq = function (idx, key, value) {
    const p = window.OA_EQ_PARAMS.find(function (q) { return q.key === key; });
    if (!p) return;
    const u = window.oaEqUnit(idx);
    u[key] = Math.max(p.min, Math.min(p.max, Number(value) || 0));
    window.oaSaveEq();
    window.dispatchEvent(new CustomEvent('oa-eq-changed', { detail: { idx: idx, key: key } }));
};

window.OA_EQ_PRESETS = {
    flat:     { label: 'Flat' },
    air:      { label: 'Air',        hiGain: 4.5, hiFreq: 10000 },
    warmth:   { label: 'Warmth',     loGain: 3,   loFreq: 120, midGain: -2, midFreq: 500, midQ: 1.2 },
    presence: { label: 'Presence',   midGain: 4,  midFreq: 3000, midQ: 1.1 },
    telephone:{ label: 'Telephone',  loGain: -18, loFreq: 400, hiGain: -18, hiFreq: 2000, midGain: 6, midFreq: 1500, midQ: 2 },
    scoop:    { label: 'Scoop',      loGain: 3,   midGain: -6, midFreq: 800, midQ: 0.8, hiGain: 3 },
};

window.oaApplyEqPreset = function (idx, name) {
    const preset = window.OA_EQ_PRESETS[name];
    if (!preset) return;
    const u = window.oaEqUnit(idx);
    // A preset names the faceplate it wants; anything it does not name goes
    // back to the default rather than keeping the last patch's value, or
    // "Flat" would not be flat.
    window.OA_EQ_PARAMS.forEach(function (p) {
        const v = typeof preset[p.key] === 'number' ? preset[p.key] : p.def;
        u[p.key] = Math.max(p.min, Math.min(p.max, v));
    });
    window.oaSaveEq();
    window.dispatchEvent(new CustomEvent('oa-eq-changed', { detail: { idx: idx, preset: name } }));
};

// ---------------------------------------------------------------------------
// The back end, as the equaliser's panel sees it.
//
// Like the pedal, the EQ is per-VOICE: nothing persistent is ever built, so
// there is nothing to meter and nothing to dispose. What it has instead is the
// thing its display is entirely about — the response curve — and that is what
// the binary curve channel carries.
// ---------------------------------------------------------------------------

window.oaRegisterPlugin({
    id: 'eq',
    label: 'Equaliser',
    event: 'oa-eq-changed',
    units: function () { return window.OA_PAD_MAX; },
    params: window.OA_EQ_PARAMS,
    presets: window.OA_EQ_PRESETS,
    state: function (i) { return window.oaEqUnit(i); },
    set: function (i, key, value) { window.oaSetEq(i, key, value); },
    preset: function (i, name) { window.oaApplyEqPreset(i, name); },

    slots: window.OA_SLOT.USER + 3,
    layout: {
        /** The three named bands' gains, in decibels, for a strip's mini-EQ. */
        LO_GAIN: window.OA_SLOT.USER,
        MID_GAIN: window.OA_SLOT.USER + 1,
        HI_GAIN: window.OA_SLOT.USER + 2,
    },

    read: function (ctx, i, frame) {
        const S = window.OA_SLOT;
        const u = window.oaEqUnit(i);
        frame[S.ACTIVE] = window.oaEqActive(i) ? 1 : 0;
        frame[S.USER] = u.loGain;
        frame[S.USER + 1] = u.midGain;
        frame[S.USER + 2] = u.hiGain;
        // Nothing persistent to meter — the EQ exists only while a voice is
        // sounding through it. A steady zero is the truth, not a missing value.
        frame[S.PEAK_L] = 0;
        frame[S.PEAK_R] = 0;
    },

    /** The response curve: 256 decibels, log-spaced 20 Hz..20 kHz. */
    curve: function (i) { return window.oaEqCurve(i); },

    save: function () {
        return {
            units: window.OA_EQ.units.map(function (u) {
                const o = {};
                window.OA_EQ_PARAMS.forEach(function (p) { o[p.key] = u[p.key]; });
                o.free = u.free.map(function (b) {
                    return { type: b.type, freq: b.freq, gain: b.gain, q: b.q, on: b.on };
                });
                return o;
            })
        };
    },

    load: function (data) {
        const units = (data && Array.isArray(data.units)) ? data.units : [];
        for (let i = 0; i < window.OA_PAD_MAX; i++) {
            window.OA_EQ.units[i] = eqUnit(units[i]);
        }
        window.oaSaveEq();
        window.dispatchEvent(new CustomEvent('oa-eq-changed', { detail: { loaded: true } }));
    },
});
