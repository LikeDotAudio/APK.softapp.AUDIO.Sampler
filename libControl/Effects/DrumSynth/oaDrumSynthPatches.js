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
 * Header: oaDrumSynthPatches.js
 * Purpose: The factory patch for each kit voice.
 * Description: Which engine each voice uses and how it is tuned out of the box.
 *   A user's edits are stored per index in OA_DRUM_SYNTH and persisted to
 *   localStorage; these are the values a "Reset" returns to.
 */

// ---------------------------------------------------------------------------
// The voice library and the pad assignments live in oaDrumSynthPresets.js. This
// resolves one into the other: OA_SYNTH_FACTORY stays an array of PATCHES, the
// shape everything downstream already expects, built from the list of keys.
// ---------------------------------------------------------------------------

/** Every ready-made voice, in menu order. */
window.oaSynthLibrary = function () { return window.OA_SYNTH_LIBRARY || []; };

/** One library voice by key, or null. */
window.oaSynthVoice = function (key) {
    return window.oaSynthLibrary().find(function (v) { return v.key === key; }) || null;
};

window.OA_SYNTH_FACTORY = (window.OA_SYNTH_FACTORY_KEYS || []).map(function (key) {
    const voice = window.oaSynthVoice(key);
    // A factory list naming a voice that is not in the library would leave a pad
    // with no patch at all, so it falls back to the first voice there is.
    return voice ? voice.patch : (window.oaSynthLibrary()[0] || {}).patch || { engine: 'membrane' };
});

window.oaFactoryPatch = function (idx) {
    return window.OA_SYNTH_FACTORY[idx % window.OA_SYNTH_FACTORY.length];
};

// idx -> live patch. Seeded from the factory, overlaid with anything saved.
window.OA_DRUM_SYNTH = window.OA_DRUM_SYNTH || {};

window.oaLoadSynthPatches = function () {
    let saved = {};
    try { saved = JSON.parse(window.localStorage.getItem('oaDrumSynth')) || {}; } catch (e) {}
    for (let i = 0; i < window.OA_PAD_COUNT; i++) {
        window.OA_DRUM_SYNTH[i] = window.oaSynthPatch(saved[i] || window.oaFactoryPatch(i));
    }
};

window.oaSaveSynthPatches = function () {
    try { window.localStorage.setItem('oaDrumSynth', JSON.stringify(window.OA_DRUM_SYNTH)); } catch (e) {}
};

/**
 * Hold a value to what its engine says the knob can do.
 *
 * This used to write whatever it was handed straight into the patch, and every
 * other plugin in the rack clamps. It matters more here than anywhere else,
 * because these numbers do not stop at the patch: they are handed to
 * engine.render(), which puts them on AudioParams. A decay of -1 becomes an
 * exponential ramp to a negative target and the browser throws mid-voice; a
 * pitch of 1e6 is a param above Nyquist. And the patch is PERSISTED, so a bad
 * value written once comes back on every reload until the pad is reset.
 *
 * An out-of-range value gets here from a hand-edited localStorage entry, an
 * older song file, or a MIDI CC mapped to a range the engine never had.
 */
const clampSynth = function (engineName, key, value) {
    const eng = window.OA_SYNTH_ENGINES[engineName];
    const spec = eng && eng.params[key];
    if (!spec) return value;                      // not a knob this engine has
    if (spec.options) {
        // A list, not a range. Anything off the list falls back to the default
        // rather than becoming an oscillator type the browser rejects.
        return spec.options.indexOf(value) >= 0 ? value : spec.def;
    }
    const v = Number(value);
    if (!isFinite(v)) return spec.def;            // NaN passes every comparison
    return Math.max(spec.min, Math.min(spec.max, v));
};

window.oaSetSynthParam = function (idx, key, value) {
    const patch = window.OA_DRUM_SYNTH[idx] || window.oaSynthPatch(window.oaFactoryPatch(idx));
    // Switching engine starts from that engine's defaults rather than carrying
    // over parameters that mean nothing to it.
    window.OA_DRUM_SYNTH[idx] = key === 'engine'
        ? window.oaSynthPatch({ engine: window.OA_SYNTH_ENGINES[value] ? value : patch.engine })
        : Object.assign({}, patch, { [key]: clampSynth(patch.engine, key, value) });
    window.oaSaveSynthPatches();
    window.dispatchEvent(new CustomEvent('oa-synth-changed', { detail: { idx } }));
};

// Replace a whole patch at once. oaSetSynthParam can't do this: feeding it
// 'engine' throws the other parameters away, so restoring a snapshot key by key
// would lose everything the moment the engine differed.
window.oaSetSynthPatch = function (idx, patch) {
    window.OA_DRUM_SYNTH[idx] = window.oaSynthPatch(patch);
    window.oaSaveSynthPatches();
    window.dispatchEvent(new CustomEvent('oa-synth-changed', { detail: { idx } }));
};

/**
 * Load a library voice onto a pad. Goes through oaSetSynthPatch() rather than
 * assigning, so the patch is clamped to what its engine can do on the way in —
 * a library entry is data like any other and gets no special trust.
 */
window.oaSetSynthVoice = function (idx, key) {
    const voice = window.oaSynthVoice(key);
    if (voice) window.oaSetSynthPatch(idx, voice.patch);
};

window.oaResetSynthPatch = function (idx) {
    window.OA_DRUM_SYNTH[idx] = window.oaSynthPatch(window.oaFactoryPatch(idx));
    window.oaSaveSynthPatches();
    window.dispatchEvent(new CustomEvent('oa-synth-changed', { detail: { idx } }));
};

window.oaLoadSynthPatches();

// ---------------------------------------------------------------------------
// Rendered preview: a synth voice bounced to a real AudioBuffer, so it can be
// drawn on the pad exactly like a loaded sample. Cached per voice and thrown
// away whenever that voice's patch changes.
// ---------------------------------------------------------------------------
window.OA_SYNTH_RENDER = window.OA_SYNTH_RENDER || {};

// How long to bounce. Long enough to catch the whole tail of the slowest patch
// without rendering seconds of silence for a clave.
const synthRenderSeconds = (patch) => {
    const p = patch || {};
    const longest = Math.max(
        p.decay || 0,
        p.noiseDecay || 0,
        p.tailDecay || 0,
        (p.attack || 0) + (p.decay || 0)
    ) / 1000;
    return Math.min(6, Math.max(0.25, longest * 1.15 + 0.05));
};

window.oaRenderSynthVoice = async function (idx) {
    const patch = window.oaSynthPatch(window.OA_DRUM_SYNTH[idx]);
    const key = JSON.stringify(patch);
    const cached = window.OA_SYNTH_RENDER[idx];
    if (cached && cached.key === key) return cached.buffer;

    const engine = window.OA_SYNTH_ENGINES[patch.engine];
    if (!engine) return null;

    // The app's rate, not this file's guess at one. A preview bounced at 44.1k
    // and drawn beside a voice mixed at 48k is a waveform whose length does not
    // match the sound it stands for.
    const rate = window.oaSampleRate();
    const seconds = synthRenderSeconds(patch);
    try {
        const off = window.oaOfflineContext(1, seconds, rate);
        if (!off) return null;
        engine.render(off, patch, 0, 0.9, off.destination);
        const raw = await off.startRendering();

        // Trim the trailing silence. Without this a 30ms rimshot is drawn into
        // the first eighth of the pad with the rest blank, while a long cymbal
        // fills it — the shapes would not be comparable.
        const src = raw.getChannelData(0);
        let last = src.length - 1;
        while (last > 0 && Math.abs(src[last]) < 0.0015) last--;
        const len = Math.max(64, last + 1);
        let buffer = raw;
        if (len < src.length) {
            buffer = new (window.AudioBuffer || Object)({ length: len, sampleRate: rate, numberOfChannels: 1 });
            buffer.copyToChannel(src.subarray(0, len), 0);
        }
        window.OA_SYNTH_RENDER[idx] = { key: key, buffer: buffer };
        window.dispatchEvent(new CustomEvent('oa-synth-rendered', { detail: { idx: idx } }));
        return buffer;
    } catch (e) {
        return null;
    }
};

// Keep every voice's preview current: re-bounce on edit, and once at startup so
// the pads show their waveforms without waiting to be touched.
window.addEventListener('oa-synth-changed', (e) => {
    const idx = e.detail && e.detail.idx;
    if (idx != null) {
        delete window.OA_SYNTH_RENDER[idx];
        window.oaRenderSynthVoice(idx);
    }
});

window.oaRenderAllSynthVoices = function () {
    for (let i = 0; i < window.OA_PAD_COUNT; i++) window.oaRenderSynthVoice(i);
};

// ---------------------------------------------------------------------------
// The back end, as the synth editor sees it.
//
// This is the plugin that forced `paramsFor` into the contract. Every other
// effect has one fixed faceplate; a drum voice's knobs depend on which of the
// six engines the pad is running, so the schema has to be generated per unit.
// The editor asks oaPluginParams('drumsynth', pad) and renders what it is
// handed — which is how it already worked, except it used to reach into
// OA_SYNTH_ENGINES itself to find out.
// ---------------------------------------------------------------------------

// Downsampled preview envelopes, one per pad, rebuilt only when the bounce is.
const SYNTH_CURVE_LEN = 256;
const synthCurves = {};
const synthCurveKey = {};

window.oaRegisterPlugin({
    id: 'drumsynth',
    label: 'Drum Synth',
    event: 'oa-synth-changed',
    units: function () { return window.OA_PAD_MAX; },

    /**
     * The running engine's schema, translated into the shared param shape. An
     * engine declares either a numeric range or a list of options; both come
     * back here in the one form a panel knows how to draw.
     *
     * That branch IS the `kind` distinction, and until 2026-08-28 it was thrown
     * away here: both arms produced the same shape and a reader downstream had
     * to guess which it was holding. The engines knew all along — an engine
     * param is `{ label, options, def }` or `{ label, min, max, step, def }` —
     * so `kind` costs nothing to carry and is exact rather than inferred.
     */
    paramsFor: function (i) {
        const patch = window.oaSynthPatch(window.OA_DRUM_SYNTH[i] || window.oaFactoryPatch(i));
        const engine = window.OA_SYNTH_ENGINES[patch.engine];
        if (!engine) return [];
        return Object.keys(engine.params).map(function (key) {
            const p = engine.params[key];
            if (p.options) {
                return {
                    key: key, kind: 'discrete', label: p.label, def: p.def, options: p.options,
                    min: 0, max: p.options.length - 1, step: 1,
                    fmt: function (v) { return String(v); },
                };
            }
            return {
                key: key, kind: 'continuous', label: p.label, min: p.min, max: p.max,
                step: p.step, def: p.def, unit: p.unit || '',
                fmt: function (v) {
                    return p.unit ? Math.round(v) + ' ' + p.unit : String(Math.round(v * 1000) / 1000);
                },
            };
        });
    },

    // The six engines, offered the way a preset list is offered — picking one
    // swaps the whole faceplate, which is what changing engine means.
    presets: (function () {
        const out = {};
        Object.keys(window.OA_SYNTH_ENGINES).forEach(function (name) {
            out[name] = { label: window.OA_SYNTH_ENGINES[name].label, engine: name };
        });
        return out;
    })(),

    state: function (i) {
        return window.oaSynthPatch(window.OA_DRUM_SYNTH[i] || window.oaFactoryPatch(i));
    },
    set: function (i, key, value) { window.oaSetSynthParam(i, key, value); },
    preset: function (i, name) {
        if (window.OA_SYNTH_ENGINES[name]) window.oaSetSynthParam(i, 'engine', name);
    },

    slots: window.OA_SLOT.USER + 2,
    layout: {
        /** 1 while a bounced preview exists for this pad. */
        RENDERED: window.OA_SLOT.USER,
        /** Length of that preview in seconds — the width a display draws. */
        SECONDS: window.OA_SLOT.USER + 1,
    },

    read: function (ctx, i, frame) {
        const S = window.OA_SLOT;
        // A pad with a sample loaded is not running the synth at all; the Mixer
        // hides the SYNTH panel on exactly this condition.
        const sampled = !!(window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[i] && window.OA_DRUM_SAMPLES[i].buffer);
        frame[S.ACTIVE] = sampled ? 0 : 1;
        const render = window.OA_SYNTH_RENDER[i];
        frame[S.USER] = render && render.buffer ? 1 : 0;
        frame[S.USER + 1] = render && render.buffer ? render.buffer.duration : 0;
        // Metered per channel by the compressor strip it feeds, not here.
        frame[S.PEAK_L] = 0;
        frame[S.PEAK_R] = 0;
    },

    /**
     * The bounced voice as a 256-point envelope, 0..1 — the shape drawn on the
     * pad. Comes from the same offline render the pad already shows, so the
     * waveform under a synth voice and the waveform under a loaded sample are
     * produced by one path instead of two.
     */
    curve: function (i) {
        const render = window.OA_SYNTH_RENDER[i];
        if (!render || !render.buffer) return null;
        if (synthCurveKey[i] === render.key && synthCurves[i]) return synthCurves[i];

        const d = render.buffer.getChannelData(0);
        const out = synthCurves[i] || (synthCurves[i] = new Float32Array(SYNTH_CURVE_LEN));
        const per = Math.max(1, Math.floor(d.length / SYNTH_CURVE_LEN));
        let top = 1e-9;
        for (let k = 0; k < SYNTH_CURVE_LEN; k++) {
            let peak = 0;
            const start = k * per;
            for (let j = 0; j < per && start + j < d.length; j++) {
                const a = d[start + j] < 0 ? -d[start + j] : d[start + j];
                if (a > peak) peak = a;
            }
            out[k] = peak;
            if (peak > top) top = peak;
        }
        for (let k = 0; k < SYNTH_CURVE_LEN; k++) out[k] /= top;
        synthCurveKey[i] = render.key;
        return out;
    },

    /**
     * Every pad's patch. Saved for the LARGEST grid rather than the current one:
     * a song cut on a 5x5 and imported on a 4x4 keeps its ninth tom, and gets it
     * back the moment the grid is grown again.
     */
    save: function () {
        const out = {};
        for (let i = 0; i < window.OA_PAD_MAX; i++) {
            const patch = window.OA_DRUM_SYNTH[i];
            if (patch) out[i] = patch;
        }
        return { patches: out };
    },

    /**
     * Put them back through oaSetSynthPatch(), which runs each one through
     * oaSynthPatch() on the way in — so a patch from an older build, with a
     * parameter this engine no longer has or a value out of the range it now
     * declares, is held to what the engine can actually do instead of reaching
     * an AudioParam and throwing mid-voice.
     *
     * Accepts a bare map of patches too: that is the shape the `synth` key of a
     * v1 and v2 song file carried, and those files are still out there.
     */
    load: function (data) {
        const patches = (data && data.patches) || data || {};
        for (let i = 0; i < window.OA_PAD_MAX; i++) {
            if (patches[i]) window.oaSetSynthPatch(i, patches[i]);
        }
    },
});
