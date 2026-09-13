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
 * Header: oaPlugin.js
 * Purpose: The line between an audio plugin's BACK END and its FRONT PANEL, and
 *   the binary frame that is the only thing allowed to cross it.
 * Description: The back end measures ONCE, into a Float32Array allocated at
 *   startup and never replaced; the front end reads numbers out of that array by
 *   index. No node graph, no analysers, no allocation, no arithmetic in a panel
 *   — a meter is `frame[LAYOUT.PEAK_L]`.
 *
 *   TWO RULES THIS ENFORCES, and both are why panels must not read the DSP:
 *
 *     THE UI MUST NOT KNOW THE DSP. A panel naming `ctx.__oaComps` cannot be
 *     moved, reskinned or tested without an AudioContext, and the back end
 *     cannot change its node graph without breaking a display.
 *
 *     THE WORK IS DONE ONCE. Two panels reading one analyser directly is two
 *     1024-float allocations sixty times a second per channel — about a
 *     megabyte a second of garbage, whose collector pauses land on the audio
 *     thread as dropouts.
 *
 *   THE FRAME. Fixed-length, per unit, allocated once:
 *
 *     [0] SEQ      pump pass counter — a display can tell a frozen frame from a
 *                  quiet one, which a bare zero cannot
 *     [1] ACTIVE   1 when the unit is in circuit, 0 when it is a wire
 *     [2] PEAK_L   output peak, 0..1, left
 *     [3] PEAK_R   output peak, 0..1, right
 *     [4…] whatever the plugin declares in its own layout
 *
 *   The first four are the same everywhere ON PURPOSE: the Mixer can meter any
 *   plugin's return without knowing which plugin it is.
 *
 *   ONE PUMP. A single rAF loop fills every frame for every plugin, and it only
 *   runs while something is attached. Sixteen panels open cost one pass, not
 *   sixteen.
 */

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

/** Slots every plugin has, whatever else it declares. */
window.OA_SLOT = {
    SEQ: 0,
    ACTIVE: 1,
    PEAK_L: 2,
    PEAK_R: 3,
    /** First slot a plugin may use for itself. */
    USER: 4,
};

const REG = {};                  // id -> backend descriptor
const FRAMES = {};               // id -> [Float32Array] one per unit

/**
 * The scratch array every analyser read borrows. ONE buffer for the whole app,
 * reused for ever — allocating per meter per frame is the cost this file exists
 * to remove.
 */
let SCRATCH = null;
const scratch = function (n) {
    if (!SCRATCH || SCRATCH.length < n) SCRATCH = new Float32Array(n);
    return SCRATCH;
};

/**
 * How long one pump pass is answerable for, in seconds — the real wall-clock
 * gap between the previous pass and this one. Zero until two passes have
 * happened, and zero for a hand-driven `oaPumpPluginsOnce`, which is why every
 * reader below treats zero as "fall back to what this did before".
 *
 * This exists because an AnalyserNode is not a meter, it is a WINDOW. It holds
 * the last `fftSize` samples and nothing else, so a pass that arrives later
 * than the window is long reads a signal with a HOLE in front of it: the audio
 * between the end of the last window and the start of this one was never in the
 * buffer to be read at all. A peak in that hole is not reported late, it is
 * reported as never having happened — the meters go quietly WRONG rather than
 * visibly laggy, which is the failure PLAN-18.09 names as the reason peak-hold
 * has to land before any rate is changed.
 *
 * At rAF on a 60 Hz panel the gap is 16.7 ms and a 1024-sample window at 48 kHz
 * is 21.3 ms, so the window already overlaps and nothing was ever lost. At the
 * 20–30 Hz tier that plan wants, 33 ms of gap against 21 ms of window loses a
 * third of the audio. Nothing here changes the rate; this is what has to be
 * true before anything does.
 */
let PUMP_SPAN = 0;
let PUMP_LAST = 0;

const now = function () {
    const perf = window.performance;
    return perf && perf.now ? perf.now() : Date.now();
};

/** The pump's own view of its rate, for anything that wants to display it. */
window.oaPumpSpan = function () { return PUMP_SPAN; };

/**
 * Grow an analyser's window until it covers `samples`. Powers of two only, and
 * 32768 is the ceiling the spec sets.
 *
 * GROW, never shrink. The same analyser is read by spectrum displays that chose
 * their own resolution, and a meter quietly halving somebody else's bin count
 * to save a memcpy is the kind of cross-talk this file exists to delete.
 */
const MAX_FFT = 32768;
const fitWindow = function (analyser, samples) {
    let want = 32;
    while (want < samples && want < MAX_FFT) want *= 2;
    if (analyser.fftSize < want) {
        try { analyser.fftSize = want; } catch (e) { /* a deck may refuse; read what it gives */ }
    }
};

/**
 * Peak over the audio since the previous pass, 0..1. The only place in the app
 * that touches getFloatTimeDomainData — deliberately, so nothing in a display
 * does.
 *
 * The whole window is READ and only its TAIL is scanned. Passing a shorter
 * array would be cheaper, but the spec says only that excess elements "will be
 * dropped" and does not say from WHICH END — so a short read is a coin-flip
 * between the newest samples and the oldest, decided by whichever engine is
 * running. The tail of a full read is the newest samples on all of them.
 */
window.oaAnalyserPeak = function (analyser) {
    if (!analyser || !analyser.getFloatTimeDomainData) return 0;

    let need = 0;
    if (PUMP_SPAN > 0) {
        need = Math.ceil(PUMP_SPAN * window.oaSampleRate(window.OA_AUDIO_CTX));
        fitWindow(analyser, need);
    }

    const n = analyser.fftSize || 1024;
    const buf = scratch(n);
    analyser.getFloatTimeDomainData(buf);

    // Only as far back as this pass is answerable for. Scanning the whole
    // window instead would re-report a peak the previous pass already reported,
    // holding it for as long as the window is long rather than for as long as
    // the fall says.
    const from = (need > 0 && need < n) ? n - need : 0;

    let peak = 0;
    for (let i = from; i < n; i++) {
        const a = buf[i] < 0 ? -buf[i] : buf[i];
        if (a > peak) peak = a;
    }
    return peak;
};

/**
 * A meter that rises instantly and falls smoothly. The fall has to be applied
 * where the number is WRITTEN rather than where it is read, or two displays
 * reading the same frame would decay it twice as fast as one.
 *
 * The fall is per SECOND, not per pass. A flat multiplier per call makes the
 * decay a property of the display — the same meter falls twice as fast on a
 * 120 Hz panel as on a 60 Hz one, and four times slower at the 30 Hz tier
 * PLAN-18.09 wants. A ballistic is a time constant or it is not a ballistic.
 * FALL_TAU is set so one 60 Hz frame still multiplies by exactly 0.86.
 */
const FALL = 0.86;
const FALL_TAU = 0.1105;
window.oaWritePeak = function (frame, slot, peak) {
    const prev = frame[slot];
    if (peak > prev) { frame[slot] = peak; return; }
    frame[slot] = prev * (PUMP_SPAN > 0 ? Math.exp(-PUMP_SPAN / FALL_TAU) : FALL);
};

// ---------------------------------------------------------------------------
// Registration — the BACK END interface
// ---------------------------------------------------------------------------

/**
 * A plugin's back end declares itself here. Everything a front panel is allowed
 * to know is in this descriptor; anything not in it is private to the DSP.
 *
 *   id        short stable key, used by every frontend call
 *   label     what a panel puts on its title bar
 *   units     () => how many instances exist (channels, or buses)
 *   params    the front-panel schema: { key,kind,label,min,max,def,fmt,hint,ticks }
 *   state     (i) => the unit's current settings, as plain data
 *   set       (i,key,value) => void, clamps and persists
 *   presets   { name: { label, ...values } }
 *   preset    (i,name) => void
 *   slots     how long this plugin's frame is (>= OA_SLOT.USER)
 *   layout    { NAME: slotIndex } for everything past the shared four
 *   read      (ctx,i,frame) => void — fill the frame. BACK END ONLY.
 *   dispose   (ctx) => void — tear every node this plugin built out of ctx
 *   save      () => plain JSON — everything this effect would need to come back
 *   load      (data, opts) => void — put it back
 */
/**
 * KIND — is this control a continuous quantity or a choice from a fixed set?
 *
 *   'continuous'  a magnitude. Any value between min and max means something,
 *                 and `step` (when present) is QUANTISATION, not enumeration.
 *                 The reverb's 0..255 Shape and its 4..39 metre Size are both
 *                 continuous: 17 m is a smaller room than 18 m, not a different
 *                 one.
 *   'discrete'    a position selector. min..max are integer positions indexing
 *                 a fixed list, and a value between two of them is not a
 *                 setting — it rounds. The buss compressor's Attack, Release
 *                 and Ratio index OA_BUSS_ATTACKS / _RELEASES / _RATIOS through
 *                 pick(), and the chorus's Mode indexes OA_CHORUS_MODES.
 *
 * Every param in this tree DECLARES its kind. Nothing infers it, and the
 * inference that was proposed — `step === 1 && ticks.length === max - min + 1`
 * — is not merely fragile, it is WRONG TODAY on three of the forty-one: the
 * buss trio declares no `step` at all and carries five legend labels across ten
 * or eleven positions, so the rule reads all three as continuous. The rule was
 * checked against `comp.input` and `chorus.chorus` and never against the buss
 * compressor. It is not implemented anywhere and must not be.
 *
 * TICKS is ALWAYS A LEGEND — the labels printed around a control's travel —
 * and never the enumeration, whatever its length happens to be. Three shapes,
 * all legends:
 *
 *   comp.input     9 labels along a continuous -12..36 range     (sparse)
 *   buss.attack    5 labels across 10 discrete positions         (sparse)
 *   chorus.chorus  14 labels across 14 discrete positions        (one each)
 *
 * The third is why `ticks` looked like it meant two things. It does not; it is
 * a legend that happens to be dense. THE CHOICES OF A DISCRETE PARAM ARE ITS
 * POSITIONS min..max, labelled with `fmt(position)` — and where a plugin has
 * the list to hand it may also pass `options`, as the drum synth does.
 */

/**
 * A plugin keeps its own vocabulary — the reverb's schema calls a slider's name
 * `name` because that is what the VARC engraves next to it, and the compressor
 * calls it `label`. The contract promises a front panel a `label`, so fill one
 * in rather than making every plugin rename a field it has good reason to keep.
 * Anything else the plugin declares is passed through untouched.
 *
 * `kind` is NOT defaulted here, deliberately. A default of 'continuous' makes
 * contract.test.mjs vacuous: deleting `kind: 'discrete'` from the buss
 * compressor's Attack would still pass, because the default supplies a wrong
 * answer in its place. A fallback that manufactures a plausible value is the
 * same defect as guessing. An undeclared kind arrives as `undefined` and stays
 * that way, where the contract test sees it and fails.
 */
const normaliseParams = function (params) {
    return (params || []).map(function (p) {
        if (typeof p.label === 'string') return p;
        return Object.assign({}, p, { label: p.name || p.short || p.key });
    });
};

window.oaRegisterPlugin = function (backend) {
    if (!backend || !backend.id) throw new Error('oaRegisterPlugin: a plugin needs an id');
    const slots = Math.max(window.OA_SLOT.USER, backend.slots || window.OA_SLOT.USER);
    const p = Object.assign({}, backend, {
        slots: slots,
        layout: Object.assign({}, window.OA_SLOT, backend.layout || {}),
        units: backend.units || function () { return 1; },
        params: normaliseParams(backend.params),
        presets: backend.presets || {},
    });
    if (backend.paramsFor) {
        p.paramsFor = function (i) { return normaliseParams(backend.paramsFor(i)); };
    }
    REG[p.id] = p;
    FRAMES[p.id] = [];
    return p;
};

window.oaPlugin = function (id) { return REG[id] || null; };
window.oaPluginIds = function () { return Object.keys(REG); };

// ---------------------------------------------------------------------------
// The FRONT END interface. Everything a display is allowed to call.
// ---------------------------------------------------------------------------

/**
 * The live binary frame for one unit. The SAME Float32Array every time — a
 * display holds onto it and reads it, it is never handed a new one.
 */
window.oaPluginFrame = function (id, idx) {
    const p = REG[id];
    if (!p) return null;
    const i = Math.max(0, idx | 0);
    const frames = FRAMES[id];
    if (!frames[i]) frames[i] = new Float32Array(p.slots);
    return frames[i];
};

/** Slot names for a plugin's frame: { SEQ, ACTIVE, PEAK_L, PEAK_R, ...own }. */
window.oaPluginLayout = function (id) { return REG[id] ? REG[id].layout : window.OA_SLOT; };

/**
 * The other half of the binary handoff. A frame carries the numbers that change
 * every frame; a CURVE carries the ones that change when a knob moves — a
 * distortion transfer function, a reverb's decay envelope, a rendered waveform.
 *
 * These are the shapes a panel DRAWS, and they were being recomputed in the
 * editors: DriveEditor evaluated the pedal's own maths a second time, in JSX, to
 * plot it. Two implementations of one curve is one too many, and the copy in
 * the display was always the one that drifted. Now the back end bakes it once —
 * it needs the table for its WaveShaper anyway — and the panel plots the array
 * it is handed without knowing what is in it.
 *
 * Returns a Float32Array the BACK END owns. Read it, plot it, do not write it.
 */
window.oaPluginCurve = function (id, idx, kind) {
    const p = REG[id];
    if (!p || !p.curve) return null;
    try { return p.curve(idx, kind) || null; } catch (e) { return null; }
};

/**
 * The front-panel schema. Most plugins have one fixed faceplate and `params` is
 * that; the drum synth does not — its knobs depend on which engine the pad is
 * running — so a backend may declare `paramsFor(i)` and generate them per unit.
 * A panel calls this either way and never has to know which kind it is talking
 * to, which is the entire point of putting the question here.
 */
window.oaPluginParams = function (id, idx) {
    const p = REG[id];
    if (!p) return [];
    if (p.paramsFor) {
        try { return p.paramsFor(idx | 0) || []; } catch (e) { return []; }
    }
    return p.params;
};
/**
 * THE ADAPTER — a registered plugin's params, projected onto SPOG's ParamSpec.
 *
 * The sampler describes a control the way a front panel needs it drawn:
 * { key, kind, label, min, max, def, fmt, hint, ticks }. SPOG describes one the
 * way a bus needs it advertised: { name, type, unit, min, max, values,
 * writable }. They are the same object written twice for two audiences, and the
 * gap between them is the whole reason the console surface is hand-written per
 * mixer instead of generated once.
 *
 * ONE DIRECTION, ON PURPOSE. The plugin schema is the source and a ParamSpec is
 * a projection of it. Nothing here reads a ParamSpec back — a round trip would
 * make the bus contract an authority on the DSP, which is the coupling
 * oaPlugin.js exists to prevent.
 *
 * NOTHING IS INFERRED. Guessing `type` from `step` and `ticks.length` is wrong
 * on three of this tree's forty-one params. Params declare `kind`, so the
 * mapping is a lookup and never a heuristic:
 *
 *     kind 'continuous'  →  type 'number'
 *     kind 'discrete'    →  type 'enum', with `values` for the positions
 *
 * WRITABLE IS MAPPED, NEVER DEFAULTED. A remotely drivable console that can
 * write a read-only parameter is worse than one that cannot write at all, so
 * the bit is computed from two facts and both are checkable:
 *
 *   - the plugin must actually have a `set` — `voices` has params: [] and no
 *     writer, and a console must not offer it a knob;
 *   - the param must not be `deprecated` — the buss compressor's `mix` and
 *     `parallel` stay in the schema so older saved units and presets load, but
 *     bussSettings() does not read them. Advertising one as writable would
 *     publish a control whose writes land nowhere.
 *
 * The meter half needs no adapter at all: oaPluginFrame(id, i) already hands
 * back a Float32Array whose first four slots are identical across every plugin.
 * Only the writing half was missing.
 */
window.oaPluginParamSpecs = function (id, idx) {
    const p = REG[id];
    if (!p) return [];
    const i = Math.max(0, idx | 0);
    const writable = typeof p.set === 'function';

    return window.oaPluginParams(id, i).map(function (q) {
        const spec = {
            name: q.key,
            type: q.kind === 'discrete' ? 'enum' : 'number',
            writable: writable && !q.deprecated,
        };
        if (q.unit) spec.unit = q.unit;
        if (typeof q.min === 'number') spec.min = q.min;
        if (typeof q.max === 'number') spec.max = q.max;

        if (spec.type === 'enum') {
            // A discrete param's choices ARE its positions. Where the plugin
            // kept the list (the drum synth does) use it; otherwise label each
            // position with the plugin's own fmt, which is what the faceplate
            // prints beside that detent. `ticks` is NOT consulted: it is a
            // legend and may be sparse — the buss compressor carries five
            // labels across ten positions.
            if (Array.isArray(q.options)) {
                spec.values = q.options.map(String);
            } else {
                const lo = Math.round(q.min), hi = Math.round(q.max);
                const values = [];
                for (let v = lo; v <= hi; v++) {
                    let label = String(v);
                    if (typeof q.fmt === 'function') {
                        try { label = String(q.fmt(v)); } catch (e) { /* keep the index */ }
                    }
                    values.push(label);
                }
                spec.values = values;
            }
        }
        return spec;
    });
};

window.oaPluginPresets = function (id) { return REG[id] ? REG[id].presets : {}; };
window.oaPluginUnits = function (id) { return REG[id] ? REG[id].units() : 0; };

window.oaPluginState = function (id, idx) {
    const p = REG[id];
    return p && p.state ? p.state(idx) : null;
};

window.oaPluginSet = function (id, idx, key, value) {
    const p = REG[id];
    if (p && p.set) p.set(idx, key, value);
};

window.oaPluginPreset = function (id, idx, name) {
    const p = REG[id];
    if (p && p.preset) p.preset(idx, name);
};

/**
 * Told when a unit's SETTINGS change — a knob moved, a preset landed. Not for
 * metering: metering is the frame, and the frame is polled, because an event
 * per meter per frame is the thing this design is getting rid of.
 */
window.oaPluginSubscribe = function (id, fn) {
    const p = REG[id];
    if (!p || !p.event) return function () {};
    const handler = function (e) { fn(e.detail || {}); };
    window.addEventListener(p.event, handler);
    return function () { window.removeEventListener(p.event, handler); };
};

// ---------------------------------------------------------------------------
// Save and restore
//
// An effect declares how it is saved, next to the thing being saved, and the
// song file asks every registered plugin at once. An effect added tomorrow is in
// the export the moment it registers, without the exporter knowing it exists.
//
// THE TWO FAILURES THIS PREVENTS, both of which a hand-written export list has:
//
//   AN EFFECT SILENTLY MISSING FROM THE FILE. A named list only saves what was
//   named when it was written; anything added later exports clean, with nothing
//   failing to say so.
//
//   RESTORE LOGIC LIVING IN THE SEQUENCER. How to put a reverb back — program
//   first, then the edits on top, then the sends — is the REVERB's business, not
//   the song file's.
// ---------------------------------------------------------------------------

/**
 * Every plugin's settings, as one plain object keyed by plugin id. Anything
 * without a save() is skipped — the voice counter has nothing to remember.
 */
window.oaSavePlugins = function () {
    const out = {};
    Object.keys(REG).forEach(function (id) {
        const p = REG[id];
        if (!p.save) return;
        try {
            const data = p.save();
            // A plugin that returns nothing is saying "I have no state", which
            // is different from an empty object and should not land in the file.
            if (data != null) out[id] = JSON.parse(JSON.stringify(data));
        } catch (e) {
            console.warn('⚠️ [' + id + '] could not be saved:', e && e.message);
        }
    });
    return out;
};

/**
 * Put those settings back. `opts` carries what a plugin cannot work out for
 * itself — the song's tempo, which the tape delay needs before it can re-derive
 * a head that was locked to the grid.
 *
 * A plugin that throws is skipped and reported rather than taking the rest of
 * the import down with it: a song that restores five effects out of six is
 * worth far more than an import that fails at the first one.
 *
 * Returns the ids that actually loaded, so the caller can tell the user.
 */
window.oaLoadPlugins = function (data, opts) {
    const done = [];
    if (!data || typeof data !== 'object') return done;
    Object.keys(REG).forEach(function (id) {
        const p = REG[id];
        if (!p.load || data[id] == null) return;
        try {
            p.load(data[id], opts || {});
            done.push(id);
        } catch (e) {
            console.warn('⚠️ [' + id + '] could not be restored:', e && e.message);
        }
    });
    return done;
};

/** Which plugins can be saved at all — used by the tests and the export UI. */
window.oaSaveablePlugins = function () {
    return Object.keys(REG).filter(function (id) { return !!REG[id].save; });
};

// ---------------------------------------------------------------------------
// The pump
// ---------------------------------------------------------------------------

let pumpHandle = null;
let attached = 0;

/**
 * One pass: every plugin, every unit, one frame each. A backend that throws is
 * skipped rather than allowed to kill the loop — a broken meter must not take
 * the other fifteen down with it.
 */
const pumpOnce = function () {
    // Measured, never assumed. rAF is not 60 Hz — it is whatever the panel and
    // the compositor between them decide, and a dropped frame doubles it for
    // one pass. The reader above wants the gap that actually happened.
    const at = now();
    PUMP_SPAN = PUMP_LAST ? (at - PUMP_LAST) / 1000 : 0;
    PUMP_LAST = at;

    const ctx = window.OA_AUDIO_CTX;
    const ids = Object.keys(REG);
    for (let k = 0; k < ids.length; k++) {
        const p = REG[ids[k]];
        if (!p.read) continue;
        const n = p.units();
        for (let i = 0; i < n; i++) {
            const frame = window.oaPluginFrame(p.id, i);
            frame[window.OA_SLOT.SEQ] += 1;
            try {
                p.read(ctx, i, frame);
            } catch (e) {
                frame[window.OA_SLOT.ACTIVE] = 0;
            }
        }
    }
};
window.oaPumpPluginsOnce = pumpOnce;

/**
 * The meter cadence, in milliseconds — ONE pass, and everything watching it.
 *
 * This is the `Frame` heartbeat tier (36 ms, 27.8 Hz), and it is a COPIED
 * CONSTANT rather than a subscription, deliberately. The heartbeat is an MQTT
 * metronome for keeping benches in step across machines; a channel meter is a
 * local display. Driving this loop off a broker message would mean no broker,
 * no meters — a distributed dependency bought for a redraw nobody else needs to
 * agree with. What the tier is good for is the NUMBER: a period the rest of the
 * system already treats as canonical, that divides the hour, and that somebody
 * chose for exactly this range. See TIERS in
 * APK:DOCKERS/APK:BareMetal/backend/Core/heartbeat/src/main.rs — it is OFF by default there
 * for this reason.
 *
 * WHY A CAP AND NOT A FASTER LOOP. Before this, `oaPlugin.js` pumped on every
 * rAF and `Mixer.jsx` ran a SECOND rAF to read what the pump wrote, so a 120 Hz
 * panel did both 120 times a second: 240 callbacks for a needle no eye resolves
 * past about 30. The pass is the expensive half — every analyser in the app,
 * read and reduced — so skipping it is where the saving is, and the rAF that
 * remains early-returns for almost nothing.
 *
 * The 20-30 Hz range is safe to sit in ONLY because the peak-hold above landed
 * first: at 36 ms against a 21 ms analyser window a naive read would miss 15 ms
 * of every pass, which is a meter that is WRONG rather than slow. The reader
 * grows its window to cover `PUMP_SPAN`, so the gap closes as the rate drops.
 */
const FRAME_MS = 36;

/* When the next pass is owed. Advanced from the slot that was DUE rather than
   from the moment this callback actually ran, so a late frame does not push the
   cadence permanently later. More than a whole slot behind — a backgrounded tab,
   where rAF stops entirely — resyncs instead of burning catch-up passes on audio
   that is long gone. */
let FRAME_DUE = 0;

/* Displays that want to redraw when a pass has just filled the frames. They do
   NOT get their own rAF: one clock, one pass, then everyone reads what it wrote,
   which is also what guarantees a display never reads a half-filled frame. */
const FRAME_LISTENERS = [];

const loop = function () {
    pumpHandle = window.requestAnimationFrame(loop);

    const at = now();
    if (at < FRAME_DUE) return;
    FRAME_DUE = (at - FRAME_DUE > FRAME_MS) ? at + FRAME_MS : FRAME_DUE + FRAME_MS;

    pumpOnce();

    for (let k = 0; k < FRAME_LISTENERS.length; k++) {
        try {
            FRAME_LISTENERS[k]();
        } catch (e) {
            // Same contract as a throwing back end: one broken display must not
            // take the other fifteen down with it, and must not stop the pump.
        }
    }
};

/**
 * "Redraw me when a pass has happened." Returns the way to stop, exactly like
 * `oaPluginAttach` — and a display needs BOTH: attach starts the pump, this
 * subscribes to it.
 */
window.oaPluginOnFrame = function (fn) {
    if (typeof fn !== 'function') return function () {};
    FRAME_LISTENERS.push(fn);
    let released = false;
    return function () {
        if (released) return;          // a double-release must not evict a stranger
        released = true;
        const at = FRAME_LISTENERS.indexOf(fn);
        if (at >= 0) FRAME_LISTENERS.splice(at, 1);
    };
};

window.oaPluginFrameListenerCount = function () { return FRAME_LISTENERS.length; };
window.oaPluginFrameMs = function () { return FRAME_MS; };

/**
 * A display says "I am reading frames now" and gets back the way to say it has
 * stopped. The pump runs only between the first attach and the last detach, so
 * a closed panel costs nothing at all.
 */
window.oaPluginAttach = function () {
    attached++;
    if (attached === 1 && !pumpHandle && window.requestAnimationFrame) {
        // A panel opening should meter immediately, not up to a slot later.
        FRAME_DUE = 0;
        pumpHandle = window.requestAnimationFrame(loop);
    }
    let released = false;
    return function () {
        if (released) return;          // a double-detach must not unbalance the count
        released = true;
        attached = Math.max(0, attached - 1);
        if (attached === 0 && pumpHandle) {
            window.cancelAnimationFrame(pumpHandle);
            pumpHandle = null;
        }
    };
};

window.oaPluginAttachCount = function () { return attached; };

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/**
 * Every plugin lets go of everything it built inside `ctx`. Called when a
 * context is closed, and by the leak tests — a plugin that cannot be torn down
 * cleanly in a test is a plugin that will not be torn down cleanly in a browser.
 */
window.oaDisposePlugins = function (ctx) {
    if (!ctx) return;
    Object.keys(REG).forEach(function (id) {
        const p = REG[id];
        if (!p.dispose) return;
        try { p.dispose(ctx); } catch (e) { /* a failed teardown must not block the rest */ }
    });
    Object.keys(FRAMES).forEach(function (id) {
        FRAMES[id].forEach(function (f) { f.fill(0); });
    });
};

/**
 * Disconnect a node and everything it feeds, once. Plugins hand their teardown
 * lists to this rather than each writing the same try/catch fifteen times.
 */
window.oaDisconnectAll = function (nodes) {
    (nodes || []).forEach(function (n) {
        if (!n) return;
        try { n.disconnect(); } catch (e) {}
        // A source that is still running holds its whole chain alive; stopping
        // it is what actually releases the graph.
        if (typeof n.stop === 'function') { try { n.stop(); } catch (e) {} }
    });
};
