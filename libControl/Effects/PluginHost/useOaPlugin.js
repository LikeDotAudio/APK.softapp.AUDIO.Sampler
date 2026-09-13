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
 * Header: useOaPlugin.js
 * Purpose: The front panel's whole vocabulary. Four hooks, and no editor needs
 *   anything else from the audio layer.
 * Description: The rule this file enforces is simple: NOTHING IN A DISPLAY MAY
 *   NAME AN AUDIO NODE. Not an analyser, not a bus, not ctx.__oaComps, not the
 *   AudioContext itself. A panel asks for a plugin's frame and reads numbers out
 *   of it; that is the entire contract, and it is the reason the panels can now
 *   be tested, restyled and moved without an audio device in the room.
 *
 *   What the editors used to do instead, and what each hook replaces:
 *
 *     useOaFrame     Was: a rAF loop per panel, each one pulling a thousand
 *                    floats out of an analyser and reducing them to a peak. Two
 *                    panels watching one channel did that work twice, into two
 *                    freshly allocated arrays, sixty times a second. Now the
 *                    back end measures once into an array it already owns and
 *                    the panel reads a slot.
 *
 *     useOaState     Was: window.addEventListener('oa-comp-changed', …) written
 *                    out longhand in every editor, with the removal easy to
 *                    forget — and a listener that outlives its component keeps
 *                    the whole component alive with it.
 *
 *     useOaCurve     Was: each panel naming the specific function that bakes
 *                    its own shape — oaDriveCurve here, an impulse buffer
 *                    there, a bounced preview somewhere else. One question now,
 *                    answered with a Float32Array the back end already owns.
 *
 *     useOaParams    Was: editors reaching into OA_SYNTH_ENGINES to work out
 *                    which knobs a pad should show.
 *
 *   WHY THE DRAWING IS NOT REACT. Every one of these panels updates at frame
 *   rate, and a setState per frame per meter would re-render the tree sixty
 *   times a second to move a needle. useOaFrame hands the frame to a callback
 *   that writes to the DOM directly — a style height, a transform on an SVG
 *   node — and React never hears about it. That is deliberate: metering is not
 *   application state, it is a picture of a number.
 */

/**
 * Read a plugin's live binary frame every animation frame.
 *
 * `onFrame(frame, layout)` is called with the SAME Float32Array each time — do
 * not hold values across calls expecting them to be stable, and do not write to
 * it. Draw straight to the DOM from here; do not setState.
 */
window.useOaFrame = function (id, idx, onFrame) {
    // Kept in a ref so a caller can pass an inline arrow — the usual React shape
    // — without the loop tearing down and rebuilding on every render.
    const cb = React.useRef(onFrame);
    cb.current = onFrame;

    React.useEffect(() => {
        const frame = window.oaPluginFrame(id, idx);
        if (!frame) return undefined;
        const layout = window.oaPluginLayout(id);

        // Tells the back end a display is watching. The pump does not run at
        // all while nothing is attached, so a closed panel costs nothing.
        const detach = window.oaPluginAttach();

        // ONE CLOCK FOR EVERY PANEL. This used to open its own
        // requestAnimationFrame per mounted unit, so sixteen open panels meant
        // sixteen loops plus the pump's, all at display refresh, all redrawing
        // values the pump had already finished writing (PLAN-18.09). Riding the
        // pump's own cadence makes the count independent of how many panels are
        // open, and guarantees a draw never lands mid-pass.
        const tick = () => {
            try {
                cb.current(frame, layout);
            } catch (e) {
                // A panel that throws must not take the pump's other listeners
                // with it — the loop swallows it too, but this names which one.
                console.warn('⚠️ [' + id + '] meter draw failed:', e && e.message);
            }
        };
        const stop = window.oaPluginOnFrame(tick);
        tick();                       // paint now rather than a slot from now

        return () => {
            stop();
            detach();
        };
    }, [id, idx]);
};

/**
 * A plugin unit's settings, re-read whenever they change. This is the half of
 * the interface that IS React state — a knob position is application state and
 * belongs in the tree, unlike a meter reading.
 */
window.useOaState = function (id, idx) {
    const [state, setState] = React.useState(() => window.oaPluginState(id, idx));

    React.useEffect(() => {
        setState(window.oaPluginState(id, idx));
        // The unsubscribe comes back from the backend rather than being
        // assembled here, so a plugin can change how it announces itself
        // without every panel needing to know.
        return window.oaPluginSubscribe(id, (detail) => {
            // Units are independent: a knob moved on channel 3 must not
            // re-render channel 4's panel.
            const target = detail.idx != null ? detail.idx : detail.unit;
            if (target != null && target !== idx) return;
            // A fresh object every time, or React sees the same reference and
            // skips the render — these units are mutated in place by design.
            setState(Object.assign({}, window.oaPluginState(id, idx)));
        });
    }, [id, idx]);

    return state;
};

/**
 * The front-panel schema for a unit. Fixed for most plugins; regenerated per
 * pad for the drum synth, whose knobs depend on the engine it is running.
 */
window.useOaParams = function (id, idx) {
    const [params, setParams] = React.useState(() => window.oaPluginParams(id, idx));
    React.useEffect(() => {
        setParams(window.oaPluginParams(id, idx));
        return window.oaPluginSubscribe(id, (detail) => {
            const target = detail.idx != null ? detail.idx : detail.unit;
            if (target != null && target !== idx) return;
            setParams(window.oaPluginParams(id, idx));
        });
    }, [id, idx]);
    return params;
};

/**
 * The Float32Array a panel plots — a transfer curve, a decay envelope, a
 * bounced waveform. Backed by an array the BACK END owns and reuses, so what
 * comes back here is a new reference only when the shape has actually changed.
 */
window.useOaCurve = function (id, idx) {
    const [curve, setCurve] = React.useState(() => window.oaPluginCurve(id, idx));

    React.useEffect(() => {
        const refresh = () => {
            const next = window.oaPluginCurve(id, idx);
            // Compared by identity on purpose: the backend hands back the same
            // array until it rebuilds it, so this is exactly "has it changed?"
            // without walking four thousand floats to find out.
            setCurve((prev) => (prev === next ? prev : next));
        };
        refresh();
        const off = window.oaPluginSubscribe(id, (detail) => {
            const target = detail.idx != null ? detail.idx : detail.unit;
            if (target != null && target !== idx) return;
            refresh();
        });
        // The reverb rebuilds its room on a trailing edge after the hand stops,
        // so the change event arrives before the new curve exists.
        const onRebuilt = () => refresh();
        window.addEventListener('oa-reverb-rebuilt', onRebuilt);
        window.addEventListener('oa-synth-rendered', onRebuilt);
        return () => {
            off();
            window.removeEventListener('oa-reverb-rebuilt', onRebuilt);
            window.removeEventListener('oa-synth-rendered', onRebuilt);
        };
    }, [id, idx]);

    return curve;
};

/**
 * Re-render a component when the pad grid changes. Everything that draws one
 * strip or pad per voice reads window.OA_DRUM_KIT during render, so a forced
 * render is all any of them needs.
 *
 * This used to live in oaPadGrid.js next to the grid itself, which read well
 * but put React in the audio layer — and a backend file that touches React
 * cannot run in the offline renderer or be loaded by the tests. The grid stayed
 * there as plain data; the hook over it belongs here, with the other hooks.
 */
window.useOaPadGrid = function () {
    const [, force] = React.useReducer((n) => n + 1, 0);
    React.useEffect(() => {
        const onChange = () => force();
        window.addEventListener('oa-pad-grid-changed', onChange);
        return () => window.removeEventListener('oa-pad-grid-changed', onChange);
    }, []);
    return window.oaPadGrid();
};

/**
 * Is the rack out of circuit right now? Re-renders when that changes.
 *
 * Arming RECORD takes every effect out of the path (see OA_FX_BYPASS in
 * oaFxBus.js for what comes out and why). A panel whose controls are doing
 * nothing has to SAY SO — a knob that turns and is not heard reads as a broken
 * effect, and the fault is invisible because the panel looks exactly as it did
 * when it worked.
 *
 * THIS IS THE ONE FACT, NOT A COPY OF IT. The bypass used to be mirrored into a
 * React state of its own in the one component that set it, and every other
 * panel had a copy that was never updated — so the audio came out of circuit
 * and the whole desk went on drawing itself as though it had not. A flag that
 * two places both believe they own is a flag that will disagree with itself.
 */
window.useOaFxBypass = function () {
    const [on, setOn] = React.useState(() => (window.oaFxBypassed ? window.oaFxBypassed() : false));
    React.useEffect(() => {
        const onChange = () => setOn(window.oaFxBypassed ? window.oaFxBypassed() : false);
        window.addEventListener('oa-fx-bypass', onChange);
        // The flag can move between the first render and this effect attaching.
        onChange();
        return () => window.removeEventListener('oa-fx-bypass', onChange);
    }, []);
    return on;
};

/**
 * How a control that is currently out of circuit should look, and behave.
 *
 * Greyed AND inert, deliberately. Greying alone leaves a knob that still turns
 * and still changes a number that nothing is reading, which is a worse lie than
 * no indication at all; making it inert without greying it is a dead control
 * with no explanation. Both, or neither.
 */
window.oaBypassVeil = function (bypassed) {
    if (!bypassed) return null;
    return {
        filter: 'grayscale(1) brightness(0.55) contrast(0.85)',
        opacity: 0.75,
        pointerEvents: 'none',
        userSelect: 'none',
        transition: 'filter .18s ease, opacity .18s ease',
    };
};

/**
 * Plot a curve into an SVG path's `d` attribute. Every panel here draws its
 * curve the same way, and doing it in one place means a display never has to
 * touch the array's contents at all — it hands over a Float32Array and a box to
 * fit it in.
 *
 * `mode` is 'bipolar' for a transfer curve (-1..+1 mapped to the full height)
 * or 'unipolar' for an envelope (0..1 from the bottom up).
 */
window.oaCurvePath = function (curve, width, height, mode) {
    if (!curve || !curve.length) return '';
    const bipolar = mode !== 'unipolar';
    const n = curve.length;
    // One point per horizontal pixel at most: a 4096-point curve drawn into a
    // 200px box is 4000 path commands the browser throws away.
    const step = Math.max(1, Math.floor(n / Math.max(1, width)));
    let d = '';
    for (let i = 0; i < n; i += step) {
        const x = (i / (n - 1)) * width;
        const v = curve[i];
        const y = bipolar ? (1 - (v + 1) / 2) * height : (1 - v) * height;
        d += (d ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
    }
    return d.trim();
};
