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
 * Header: oaDrive.js
 * Purpose: A distortion pedal on every channel — overdrive, tube saturation,
 *   starved fuzz and an octave-up rectifier — sitting in front of the pan and
 *   the effect sends.
 * Description: A real pedal distorts because a circuit runs out of voltage. Push
 *   a tube, a transistor or an op-amp past the rail and the peaks of the wave
 *   physically cannot get any taller, so they flatten. Flattening the peaks is
 *   not a loss of information — a squared-off sine is a sine plus a stack of
 *   harmonics that were not there before, and those added harmonics ARE the
 *   sound of dirt.
 *
 *   In DSP there is no rail to hit, so we squash the numbers on purpose. Every
 *   flavour below is a different shape of squashing:
 *
 *     OVERDRIVE   tanh(x). Rounds the peaks off gradually rather than chopping
 *                 them, which is what an op-amp with diodes in the feedback loop
 *                 does. Symmetric, so it makes ODD harmonics only — the third,
 *                 fifth, seventh. That is the hollow, woody, blues-amp sound.
 *
 *     TUBE        tanh(x + bias). A vacuum tube does not clip its positive and
 *                 negative halves equally, and lopsided clipping makes EVEN
 *                 harmonics — the second above all, which is exactly an octave
 *                 and therefore reads as warmth rather than as distortion. We
 *                 fake it by shoving the wave off-centre before it meets the
 *                 ceiling, so the top squashes first.
 *
 *     FUZZ        A hard clamp at the rail. No rounding at all: the wave goes
 *                 square, the harmonic series runs on forever, and it rips.
 *
 *   Two more tricks sit on top of the clipper:
 *
 *     STARVE      A dying battery in a fuzz box leaves the transistor without
 *                 enough voltage to pass small signals, so the tail of every
 *                 note sputters and gates out. We carve a DEAD ZONE around
 *                 zero: anything smaller than the threshold is silence.
 *
 *     OCTAVE      Full-wave rectification — fold the negative half of the wave
 *                 up into the positive. The wave now repeats twice as often as
 *                 it used to, so the pitch doubles: the octave-up trick.
 *
 *   THE IMPLEMENTATION TRICK: every one of those stages is MEMORYLESS. The
 *   output for a sample depends only on that sample's value — never on the one
 *   before it. So the whole chain collapses into a single function y = f(x),
 *   and a function of one variable can be precomputed into a lookup table. That
 *   is exactly what a WaveShaper node is. We evaluate the pedal once per
 *   parameter change over 4096 points and hand the table to the browser, which
 *   then runs it over the audio for free. See oaDriveSample() — it is the
 *   per-sample pedal, written out longhand, and oaDriveCurve() bakes it.
 *
 *   TRANSPARENT UNTIL ASKED: mix defaults to 0 on every channel and at mix 0
 *   oaDriveNode() builds NO NODES AT ALL and the voice connects to the pan the
 *   way it always did. Not "distortion turned down" — distortion not present.
 */

window.OA_DRIVE_EPSILON = 0.0005;

// How far the dead zone can eat into the signal at STARVE 100%, as a fraction
// of full scale. Past about 0.6 the note stops being a note.
const OA_STARVE_MAX = 0.6;

// The shape of the ceiling. `soft` rounds the peaks off, `hard` chops them flat.
const OA_CLIPS = {
    soft: function (x) { return Math.tanh(x); },
    hard: function (x) { return x < -1 ? -1 : (x > 1 ? 1 : x); },
};

/**
 * The three voicings.
 *
 * `bias` is how far off-centre the wave sits when it meets the ceiling, so the
 * top squashes before the bottom does. Lopsided clipping is what makes EVEN
 * harmonics — the second above all, which is an octave, and an octave reads as
 * warmth rather than as dirt. Symmetric clipping can only ever make ODD ones.
 *
 * It is a FIXED offset, and it has to be, however tempting the alternative
 * looks. Measured over a 200 Hz sine, the second harmonic here is strongest
 * around 1.5x-4x drive and thins out by 40x, and the obvious fix is to scale
 * the offset with the drive so the wave always crosses the rail at the same
 * lopsided place. Do that and the numbers look wonderful — a rock-steady 0.12
 * second harmonic all the way up — while the actual waveform quietly dies. Push
 * the offset near the rail and clip(bias) approaches 1, so subtracting it takes
 * the entire positive half of the wave down to nothing and what is left is a
 * narrow pulse train. At bias × 40x drive with a hard clipper the curve
 * collapses to literal silence: clip(s + 20) - clip(20) = 1 - 1 = 0.
 *
 * The honest reading is that the fade is not a defect to engineer around. A
 * memoryless clipper driven hard enough tends toward a square wave, and a
 * square wave is odd harmonics by definition. Real gear does the same thing.
 * Keep the offset small, take the warmth where it lives, and let FUZZ be the
 * one that goes all the way.
 */
window.OA_DRIVE_MODES = [
    {
        key: 'od', label: 'Overdrive', clip: 'soft', bias: 0, color: '#4caf50',
        hint: 'tanh, dead centre — peaks rounded, odd harmonics only. A pushed amp.',
    },
    {
        key: 'tube', label: 'Tube', clip: 'soft', bias: 0.35, color: '#ffb300',
        hint: 'tanh off-centre — the top squashes first, so the even harmonics come up. Warm.',
    },
    {
        key: 'fuzz', label: 'Fuzz', clip: 'hard', bias: 0.15, color: '#e53935',
        hint: 'clamped flat at the rail — square wave, endless harmonics. Rips.',
    },
];

window.oaDriveMode = function (key) {
    return window.OA_DRIVE_MODES.find(function (m) { return m.key === key; })
        || window.OA_DRIVE_MODES[0];
};

const pct = function (v) { return Math.round(v * 100) + '%'; };

// One row of the pedal's faceplate. `log` means the control is swept
// logarithmically — a drive knob that spends half its travel between 20x and
// 40x is useless, because the ear hears ratios, not differences.
window.OA_DRIVE_PARAMS = [
    { key: 'drive', kind: 'continuous',  label: 'Drive',  min: 1,   max: 40,    def: 1,     log: true,  fmt: function (v) { return v.toFixed(1) + 'x'; } },
    { key: 'starve', kind: 'continuous', label: 'Starve', min: 0,   max: 1,     def: 0,     log: false, fmt: pct },
    { key: 'rect', kind: 'continuous',   label: 'Octave', min: 0,   max: 1,     def: 0,     log: false, fmt: pct },
    { key: 'tone', kind: 'continuous',   label: 'Tone',   min: 800, max: 18000, def: 18000, log: true,
      fmt: function (v) { return v >= 17000 ? 'Open' : (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v) + ' Hz'); } },
    { key: 'level', kind: 'continuous',  label: 'Level',  min: 0,   max: 2,     def: 1,     log: false, fmt: function (v) { return v.toFixed(2) + 'x'; } },
    { key: 'mix', kind: 'continuous',    label: 'Mix',    min: 0,   max: 1,     def: 0,     log: false, fmt: pct },
];

// Only these four change the SHAPE of the transfer curve — tone, level and mix
// are applied by nodes around it, so moving them must not rebuild the table.
const OA_CURVE_KEYS = ['mode', 'drive', 'starve', 'rect'];

// The factory pedals live in oaDrivePresets.js, loaded first.

// Fill in whatever a saved unit is missing and drop anything out of range, so a
// hand-edited or half-written localStorage entry still comes up playable.
const drvUnit = function (saved) {
    const s = saved || {};
    const out = { mode: window.oaDriveMode(s.mode).key };
    window.OA_DRIVE_PARAMS.forEach(function (p) {
        const v = Number(s[p.key]);
        out[p.key] = isFinite(v) ? Math.max(p.min, Math.min(p.max, v)) : p.def;
    });
    return out;
};

window.OA_DRIVE = (function () {
    let saved = null;
    try { saved = JSON.parse(window.localStorage.getItem('oaDrive')); } catch (e) {}
    const units = (saved && Array.isArray(saved.units)) ? saved.units : [];
    // Sized for the LARGEST grid, like every other per-channel array, so
    // shrinking the pad layout and growing it back finds pad 25's pedal intact.
    const out = [];
    for (let i = 0; i < window.OA_PAD_MAX; i++) out.push(drvUnit(units[i]));
    return { units: out };
})();

window.oaDriveUnit = function (idx) {
    return window.OA_DRIVE.units[idx] || window.OA_DRIVE.units[0];
};

window.oaSaveDrive = function () {
    try {
        // Only the fields — the cached curve hanging off each unit is derived
        // data and would triple the size of the entry for nothing.
        window.localStorage.setItem('oaDrive', JSON.stringify({
            units: window.OA_DRIVE.units.map(function (u) {
                const o = { mode: u.mode };
                window.OA_DRIVE_PARAMS.forEach(function (p) { o[p.key] = u[p.key]; });
                return o;
            })
        }));
    } catch (e) {}
};

/** Is this channel doing anything at all? */
window.oaDriveActive = function (idx) {
    return window.oaDriveUnit(idx).mix > window.OA_DRIVE_EPSILON;
};

/**
 * THE PEDAL, one sample at a time.
 *
 * Everything here is memoryless, which is why the whole thing can be frozen
 * into a lookup table by oaDriveCurve() below. Read this as the spec; read the
 * curve builder as the optimisation.
 */
window.oaDriveSample = function (x, u, mode) {
    // 1. INPUT GAIN — slam it into the ceiling. This is the only knob that
    //    decides how much of the wave is squashed; everything downstream just
    //    decides what the squashing looks like.
    let s = x * u.drive;

    // 2. TRANSISTOR STARVING — a DEAD ZONE around silence.
    //
    //    The naive version is a gate: `if (|s| < thr) s = 0`. It works, but it
    //    leaves a step in the transfer function — the output jumps from 0 to
    //    thr the instant the signal crosses — and a step is an edge, which is
    //    infinite harmonics, which is aliasing and a click on every crossing.
    //    Subtracting the threshold from what survives closes that step: below
    //    thr is silence, at thr the output is 0 and climbs from there. Same
    //    sputter, no click. It is also closer to the real fault — a starved
    //    output stage has a dead band, it is not a noise gate.
    //
    //    The threshold scales with drive so the two knobs stay independent: the
    //    playing dynamics decide what sputters, not the gain setting.
    const thr = u.starve * OA_STARVE_MAX * u.drive;
    if (thr > 0) {
        if (s > thr) s -= thr;
        else if (s < -thr) s += thr;
        else s = 0;
    }

    // 3. RECTIFICATION — fold the bottom half of the wave up. The wave then
    //    repeats twice per cycle, and twice the rate IS the octave above.
    //
    //    The blend passes through both kinds of rectifier on its way. Below
    //    zero the expression is s(1-r) + (-s)r = s(1 - 2r), so the negative
    //    half shrinks to nothing at r = 0.5 — HALF-WAVE rectification, the
    //    fundamental still there with the octave sat on top of it — and then
    //    turns positive beyond, reaching FULL-WAVE at r = 1 where the original
    //    pitch has gone entirely. Measured on a sine: at 50% the fundamental
    //    still leads, by 75% the octave has overtaken it.
    if (u.rect > 0) s = s * (1 - u.rect) + Math.abs(s) * u.rect;

    // 4. ASYMMETRY — push the wave off-centre so it reaches the top rail before
    //    the bottom one. Small and fixed; see OA_DRIVE_MODES for why it must
    //    not be scaled up with the drive, however good the idea sounds.
    const clip = OA_CLIPS[mode.clip];
    const bias = mode.bias;

    // 5. THE CEILING, and then the offset taken back off.
    //
    //    Note it is clip(bias) that comes off, NOT bias. The clipper has
    //    already bent the offset on its way through, so subtracting the raw
    //    number leaves a residue: with tanh(0.3) = 0.2913, subtracting 0.3
    //    parks the output at -0.0087 for ever — a speaker cone held off-centre
    //    and a thump the moment the wet path is faded in. Subtracting what
    //    actually came out lands on true zero at every mode and every drive.
    return clip(s + bias) - clip(bias);
};

// Resolution of the lookup table. 4096 is plenty for a smooth curve and cheap
// enough to rebuild while a knob is being dragged.
const OA_DRIVE_CURVE_LEN = 4096;

/**
 * Bake the pedal into a WaveShaper table: evaluate oaDriveSample() across the
 * whole input range once, and the browser interpolates it per sample forever
 * after. Cached on the unit and rebuilt only when the SHAPE changes.
 *
 * The result is peak-normalised. Without that, every turn of the drive knob is
 * also a volume change and the pedal is impossible to audition — normalised,
 * drive adds harmonics at a steady loudness and LEVEL is the only volume
 * control, which is how a pedal behaves.
 */
window.oaDriveCurve = function (u) {
    const key = OA_CURVE_KEYS.map(function (k) { return u[k]; }).join('|');
    if (u.__curveKey === key && u.__curve) return u.__curve;

    const mode = window.oaDriveMode(u.mode);
    const curve = new Float32Array(OA_DRIVE_CURVE_LEN);
    let peak = 0;
    for (let i = 0; i < OA_DRIVE_CURVE_LEN; i++) {
        // A WaveShaper's table always spans an input of -1..+1.
        const x = (i / (OA_DRIVE_CURVE_LEN - 1)) * 2 - 1;
        const y = window.oaDriveSample(x, u, mode);
        curve[i] = y;
        const a = y < 0 ? -y : y;
        if (a > peak) peak = a;
    }
    if (peak > 1e-6 && peak !== 1) {
        const norm = 1 / peak;
        for (let i = 0; i < OA_DRIVE_CURVE_LEN; i++) curve[i] *= norm;
    }

    u.__curveKey = key;
    u.__curve = curve;
    return curve;
};

/**
 * Build the pedal for one channel and wire it into `dest`. Returns the node a
 * voice should play into, or NULL when the channel is clean — in which case
 * nothing was built and the caller connects to `dest` exactly as before.
 *
 *   in ─┬─ dry ────────────────────────────────────────┬─ dest
 *       └─ shaper ─ tone ─ dc ─ wet ───────────────────┘
 *
 * Per voice rather than per channel, like the sends above it: a knob move lands
 * on the next hit instead of re-shaping notes that are already ringing.
 */
window.oaDriveNode = function (ctx, idx, dest, chain) {
    const u = window.oaDriveUnit(idx);
    if (!(u.mix > window.OA_DRIVE_EPSILON)) return null;

    // Everything built below joins the caller's retirement list, so the pedal is
    // released with the rest of the voice rather than left for the collector.
    // A WaveShaper at 4x oversampling carries its own internal buffers, which
    // makes it the most expensive thing here to leave lying around.
    const keep = function (n) { if (chain) chain.push(n); return n; };

    const mode = window.oaDriveMode(u.mode);
    const input = keep(ctx.createGain());

    // The clean signal, straight past the pedal. At mix 0 we never get here, so
    // this path is only ever a partial blend.
    const dry = keep(ctx.createGain());
    dry.gain.value = 1 - u.mix;
    input.connect(dry);
    dry.connect(dest);

    const shaper = keep(ctx.createWaveShaper());
    shaper.curve = window.oaDriveCurve(u);
    // Clipping invents harmonics above everything the signal had, and anything
    // it invents past half the sample rate folds back down as inharmonic
    // rubbish that no filter can remove afterwards. Running the shaper at 4x
    // pushes the fold-over point two octaves up, where the harmonics are weak
    // enough not to matter. This one line is most of the difference between
    // "distortion" and "broken".
    shaper.oversample = '4x';
    input.connect(shaper);

    let tail = shaper;

    // Tone: distortion is bright by construction — every harmonic it adds is
    // above what went in. The tone control is what makes it sit in a mix.
    if (u.tone < 17000) {
        const tone = keep(ctx.createBiquadFilter());
        tone.type = 'lowpass';
        tone.frequency.value = u.tone;
        tone.Q.value = 0.707;
        tail.connect(tone);
        tail = tone;
    }

    // A lopsided or rectified curve pushes the whole wave off-centre by an
    // amount that follows the playing, so no constant can cancel it — it takes
    // a filter. Symmetric and unrectified, the curve generates no DC at all and
    // this is skipped.
    if (mode.bias !== 0 || u.rect > 0) {
        const dc = keep(ctx.createBiquadFilter());
        dc.type = 'highpass';
        dc.frequency.value = 12;
        tail.connect(dc);
        tail = dc;
    }

    const wet = keep(ctx.createGain());
    wet.gain.value = u.mix * u.level;
    tail.connect(wet);
    wet.connect(dest);

    return input;
};

window.oaSetDrive = function (idx, key, value) {
    const u = window.oaDriveUnit(idx);
    if (key === 'mode') {
        u.mode = window.oaDriveMode(value).key;
    } else {
        const p = window.OA_DRIVE_PARAMS.find(function (q) { return q.key === key; });
        if (!p) return;
        u[key] = Math.max(p.min, Math.min(p.max, Number(value) || 0));
    }
    window.oaSaveDrive();
    window.dispatchEvent(new CustomEvent('oa-drive-changed', { detail: { idx: idx, key: key } }));
};

window.oaApplyDrivePreset = function (idx, name) {
    const preset = window.OA_DRIVE_PRESETS[name];
    if (!preset) return;
    const u = window.oaDriveUnit(idx);
    u.mode = window.oaDriveMode(preset.mode).key;
    window.OA_DRIVE_PARAMS.forEach(function (p) {
        if (typeof preset[p.key] === 'number') u[p.key] = Math.max(p.min, Math.min(p.max, preset[p.key]));
    });
    window.oaSaveDrive();
    window.dispatchEvent(new CustomEvent('oa-drive-changed', { detail: { idx: idx, preset: name } }));
};

// ---------------------------------------------------------------------------
// The back end, as the pedal's panel sees it.
//
// The drive is per-VOICE, not per-channel: nothing persistent is ever built, so
// there is nothing to meter and nothing to dispose. What it does have is the
// one thing this pedal's display is entirely about — the transfer curve — and
// that is exactly what the binary curve channel is for.
//
// The panel already plotted the baked table rather than recomputing the maths,
// which was the right call and stays. What changes is who it asks: the plot no
// longer names oaDriveCurve or oaDriveUnit, it asks the plugin for curve zero
// and draws whatever comes back. The array is the same one the WaveShaper is
// running, so the picture cannot drift from the sound.
// ---------------------------------------------------------------------------

window.oaRegisterPlugin({
    id: 'drive',
    label: 'Drive',
    event: 'oa-drive-changed',
    units: function () { return window.OA_PAD_MAX; },
    params: window.OA_DRIVE_PARAMS,
    presets: window.OA_DRIVE_PRESETS,
    state: function (i) { return window.oaDriveUnit(i); },
    set: function (i, key, value) { window.oaSetDrive(i, key, value); },
    preset: function (i, name) { window.oaApplyDrivePreset(i, name); },

    slots: window.OA_SLOT.USER + 2,
    layout: {
        /** Blend, 0..1 — how much of the channel is going through the pedal. */
        MIX: window.OA_SLOT.USER,
        /**
         * Where the curve stops being a straight line, 0..1 of full scale. A
         * display draws the knee here; below it the pedal is a wire.
         */
        KNEE: window.OA_SLOT.USER + 1,
    },

    read: function (ctx, i, frame) {
        const S = window.OA_SLOT;
        const u = window.oaDriveUnit(i);
        frame[S.ACTIVE] = window.oaDriveActive(i) ? 1 : 0;
        frame[S.USER] = u.mix;
        frame[S.USER + 1] = u.starve * OA_STARVE_MAX * u.drive;
        // Nothing persistent to meter — the pedal exists only while a voice is
        // sounding through it. A steady zero is the truth, not a missing value.
        frame[S.PEAK_L] = 0;
        frame[S.PEAK_R] = 0;
    },

    /** The WaveShaper's own table: 4096 points, input -1..+1, output -1..+1. */
    curve: function (i) { return window.oaDriveCurve(window.oaDriveUnit(i)); },

    /**
     * Every channel's pedal. The cached curve hanging off each unit is derived
     * data — it would treble the size of the song file and be rebuilt on load
     * anyway — so only the fields go.
     */
    save: function () {
        return {
            units: window.OA_DRIVE.units.map(function (u) {
                const o = { mode: u.mode };
                window.OA_DRIVE_PARAMS.forEach(function (p) { o[p.key] = u[p.key]; });
                return o;
            }),
        };
    },

    /**
     * Put them back, through oaSetDrive() rather than by assignment: the setter
     * clamps, persists and fires the change event, and a song file is exactly
     * the untrusted input those three exist for.
     *
     * `mode` goes in first — it decides which clipper the drive figure is
     * driving, so setting it after would rebuild the curve twice for nothing.
     */
    load: function (data) {
        const units = Array.isArray(data && data.units) ? data.units : [];
        units.slice(0, window.OA_PAD_MAX).forEach(function (u, i) {
            if (!u) return;
            if (u.mode) window.oaSetDrive(i, 'mode', u.mode);
            window.OA_DRIVE_PARAMS.forEach(function (p) {
                if (u[p.key] !== undefined) window.oaSetDrive(i, p.key, u[p.key]);
            });
        });
    },
});
