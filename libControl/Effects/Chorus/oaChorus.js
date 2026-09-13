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
 * Header: oaChorus.js
 * Purpose: A dimensional stereo chorus, sat after each tape echo.
 * Description: The box this models was never really a chorus — it was a width
 *   box. A conventional chorus sweeps a delayed copy hard enough that you hear
 *   the pitch move, which is the warble everyone recognises. This does the
 *   opposite: the sweep is kept so shallow it is almost inaudible on its own,
 *   the two sides are swept in OPPOSITE directions, and the wet copy is added
 *   to the left and SUBTRACTED from the right.
 *
 *   That last part is the whole trick. Out-of-phase across the pair, the wet
 *   signal cancels itself when the mix is folded to mono, so the effect adds
 *   almost nothing you can point at — the ear reads the phase difference
 *   between the sides as space, and the sound simply arrives wider and closer
 *   without a warble sitting on top of it.
 *
 *   Like the original there are no knobs: an OFF button and four modes, mutual
 *   exclusive, going from a gentle shimmer to the deepest setting the box has.
 */

// Every setting the box has lives in oaChorusModes.js, loaded first: the four
// buttons alone, and the combinations they make when more than one is held down.
window.OA_CHORUS_COUNT = window.OA_CHORUS_MODES.length;

window.oaChorusMode = function (m) {
    const i = Math.max(0, Math.min(window.OA_CHORUS_COUNT - 1, m | 0));
    return window.OA_CHORUS_MODES[i];
};

/** Which caps are down in mode `m` — [] for OFF, [1,3] for modes 1+3. */
window.oaChorusButtons = function (m) {
    return window.oaChorusMode(m).buttons || [];
};

/**
 * Press button `n` while in mode `m`, and get back the mode that results.
 *
 * The panel has four buttons and the table has thirteen entries, so this is
 * where one becomes the other: toggle the button into or out of the set that is
 * currently down, then find the entry with that exact set. A combination the
 * table does not list falls back to the highest single button pressed, which is
 * what a mechanical interlock would do anyway — something has to stay down.
 */
window.oaChorusToggle = function (m, n) {
    const now = window.oaChorusButtons(m);
    const next = now.indexOf(n) >= 0
        ? now.filter(function (b) { return b !== n; })
        : now.concat([n]).sort();
    const key = next.join('+');
    for (let i = 0; i < window.OA_CHORUS_MODES.length; i++) {
        if ((window.OA_CHORUS_MODES[i].buttons || []).join('+') === key) return i;
    }
    return next.length ? next[next.length - 1] : 0;
};

/**
 * Build one chorus. Returns { input, output, setMode } — an insert, so it
 * passes the dry through untouched and adds the swept pair on top. At mode 0
 * every wet gain is zero and what comes out is bit-for-bit what went in.
 */
window.oaChorusNode = function (ctx, mode) {
    const spec = window.oaChorusMode(mode);

    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 1;
    input.connect(dry);
    dry.connect(output);

    // Everything below ~140Hz stays where it was. Low frequencies carry a lot
    // of the level, and cross-fading them out of phase hollows the bottom out
    // the moment anyone folds the mix to mono.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 140;
    // Forced to two channels ahead of the splitter. A mono source fed into a
    // splitter lands on channel 0 and leaves channel 1 silent, which would put
    // the whole effect on the left and lose the cancellation the design rests
    // on — the tape output is stereo, but nothing else should have to be.
    hp.channelCount = 2;
    hp.channelCountMode = 'explicit';
    hp.channelInterpretation = 'speakers';
    input.connect(hp);

    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    hp.connect(split);

    const dL = ctx.createDelay(0.05);
    const dR = ctx.createDelay(0.05);
    dL.delayTime.value = spec.base;
    dR.delayTime.value = spec.base;
    split.connect(dL, 0);
    split.connect(dR, 1);

    // The out-of-phase cross-mix: the right side's copy is inverted, so the
    // pair cancels in mono and only the width survives.
    const wetL = ctx.createGain();
    const wetR = ctx.createGain();
    wetL.gain.value = spec.mix;
    wetR.gain.value = -spec.mix;
    dL.connect(wetL);
    dR.connect(wetR);
    wetL.connect(merge, 0, 0);
    wetR.connect(merge, 0, 1);
    merge.connect(output);

    // One LFO, wired in opposite polarity to the two heads, so as the left
    // side stretches the right side shortens. Sweeping them together would
    // just be a chorus; sweeping them apart is what opens the stereo field.
    const lfo = ctx.createOscillator();
    const swL = ctx.createGain();
    const swR = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = spec.rate || 0.35;
    swL.gain.value = spec.depth;
    swR.gain.value = -spec.depth;
    lfo.connect(swL);
    lfo.connect(swR);
    swL.connect(dL.delayTime);
    swR.connect(dR.delayTime);
    try { lfo.start(); } catch (e) {}

    const setMode = function (m) {
        const s = window.oaChorusMode(m);
        const t = ctx.currentTime;
        // Long enough that punching a button crossfades rather than clicks,
        // short enough that it still feels like a button.
        dL.delayTime.setTargetAtTime(s.base, t, 0.05);
        dR.delayTime.setTargetAtTime(s.base, t, 0.05);
        wetL.gain.setTargetAtTime(s.mix, t, 0.03);
        wetR.gain.setTargetAtTime(-s.mix, t, 0.03);
        swL.gain.setTargetAtTime(s.depth, t, 0.05);
        swR.gain.setTargetAtTime(-s.depth, t, 0.05);
        // Hold the last speed through a bypass — restarting the sweep from a
        // dead stop makes the next mode land with a lurch.
        if (s.rate) lfo.frequency.setTargetAtTime(s.rate, t, 0.1);
    };

    return {
        input: input,
        output: output,
        setMode: setMode,
        /**
         * The sweep oscillator has no stop time — it was started once and holds
         * the two delay lines' delayTime params for as long as the context
         * lives. Disconnecting the audio path alone leaves it running, so the
         * LFO and its two polarity gains are named here explicitly.
         */
        dispose: function () {
            window.oaDisconnectAll([
                lfo, swL, swR, input, output, dry, hp, split, merge, dL, dR, wetL, wetR,
            ]);
        },
    };
};

// ---------------------------------------------------------------------------
// The back end, as the width panel sees it.
//
// The chorus is the odd one out: it is an INSERT inside each tape delay rather
// than a bus of its own, so its "units" are the delays it sits in and its only
// setting is which button is pushed. It still registers, because a panel should
// not have to know that — it asks for chorus unit 2 and gets chorus unit 2.
// ---------------------------------------------------------------------------

window.oaRegisterPlugin({
    id: 'chorus',
    label: 'Width',
    event: 'oa-delay-changed',
    units: function () { return window.OA_DELAY_COUNT || 0; },

    // One button, five positions. Declared as a parameter so a generic panel can
    // render it without a special case for "this plugin has no knobs".
    params: [{
        key: 'chorus', kind: 'discrete', label: 'Mode', min: 0, max: window.OA_CHORUS_COUNT - 1, def: 0, step: 1,
        fmt: function (v) { return window.oaChorusMode(v).label; },
        ticks: window.OA_CHORUS_MODES.map(function (m) { return m.name; }),
        hint: 'Off, then four fixed widths. There were never any knobs on this box.',
    }],

    presets: (function () {
        const out = {};
        window.OA_CHORUS_MODES.forEach(function (m, i) {
            out[m.name.toLowerCase()] = { label: m.label, chorus: i };
        });
        return out;
    })(),

    state: function (i) { return { chorus: window.oaDelayUnit(i).chorus }; },
    set: function (i, key, value) {
        if (key === 'chorus') window.oaSetDelayChorus(i, value);
    },
    preset: function (i, name) {
        const p = window.oaPluginPresets('chorus')[name];
        if (p) window.oaSetDelayChorus(i, p.chorus);
    },

    slots: window.OA_SLOT.USER + 2,
    layout: {
        /** Which button is lit, 0..4. */
        MODE: window.OA_SLOT.USER,
        /** How far the heads are being swept, in samples-ish — the depth lamp. */
        DEPTH: window.OA_SLOT.USER + 1,
    },

    read: function (ctx, i, frame) {
        const S = window.OA_SLOT;
        const mode = window.oaDelayUnit(i).chorus;
        const spec = window.oaChorusMode(mode);
        frame[S.ACTIVE] = mode > 0 ? 1 : 0;
        frame[S.USER] = mode;
        frame[S.USER + 1] = spec.depth;
        // The insert has no meter of its own: it sits inside the tape return and
        // is metered there. Saying so with a zero beats inventing a number.
        frame[S.PEAK_L] = 0;
        frame[S.PEAK_R] = 0;
    },

    /**
     * Which combination is down on each tape return.
     *
     * This is the one plugin whose state is ALSO carried by another: the mode
     * lives on the delay unit, so a song file gets it twice. That is deliberate
     * — the duplicate is a few bytes, applying it twice is idempotent, and the
     * alternative is a plugin that silently has no save() and an export that
     * depends on load order to be complete.
     */
    save: function () {
        const modes = [];
        for (let u = 0; u < (window.OA_DELAY_COUNT || 0); u++) {
            modes.push(window.oaDelayUnit(u).chorus || 0);
        }
        return { modes: modes };
    },

    load: function (data) {
        const modes = Array.isArray(data && data.modes) ? data.modes : [];
        modes.slice(0, window.OA_DELAY_COUNT).forEach(function (m, u) {
            window.oaSetDelayChorus(u, m);
        });
    },

    // Disposed with the delay it lives inside; see oaDisposeDelay.
});
