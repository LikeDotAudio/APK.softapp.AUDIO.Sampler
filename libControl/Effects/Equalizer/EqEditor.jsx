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
 * Header: EqEditor.jsx
 * Purpose: The EQ panel — PLAN-18.12, step 3.
 * Description: The tenth registered plugin was the only one with no panel, and
 *   `PLAN-18.12` asked for it deliberately rather than as a gap-fill:
 *
 *     "It should be the cheapest one in the tree to build — OaConsoleSurface
 *      draws it already — and it is therefore the honest test of whether the
 *      generic surface is good enough to ship on its own, or only good enough
 *      behind a faceplate."
 *
 *   SO THIS PANEL DRAWS NO KNOBS OF ITS OWN. There is no `RackKnob`, no
 *   `BussKnob`, no engraved plate and no per-parameter code anywhere below.
 *   The seven controls come out of `window.OaConsoleSurface` with `id="eq"`
 *   and nothing else, which means an eighth parameter added to `OA_EQ_PARAMS`
 *   appears here with no edit to this file. That is the claim being tested,
 *   and it is why the control block is three lines long.
 *
 *   WHAT IS HAND-DRAWN, AND WHY IT IS NOT A CONTRADICTION. The response curve.
 *   An equaliser's controls are seven numbers you could have typed; the shape
 *   they add up to is the only thing that answers "what is this doing to the
 *   sound", and it is per-plugin by nature — `oaEqCurve()` is on the EQ and
 *   nothing else in the tree has one. The generic surface is about the CONTROL
 *   LIST, not about forbidding a plugin its own display, exactly as the plan's
 *   step 4 keeps the rack faceplates while deleting their control plumbing.
 *
 *   The curve is read on an animation frame from a Float32Array the back end
 *   owns and reuses, the same read-do-not-write contract as every other curve
 *   here.
 */

/** Where the decibel grid lines are drawn, and the plot's vertical limit. */
const EQ_PLOT_DB = 18;
const EQ_PLOT_LINES = [-12, -6, 0, 6, 12];
/** The frequency legend. Only these get a printed label. */
const EQ_PLOT_HZ = [
    { f: 100, label: '100' },
    { f: 1000, label: '1k' },
    { f: 10000, label: '10k' },
];

/**
 * The response curve, plotted. Redrawn on a frame rather than on every render,
 * because a knob drag is a stream of writes and React is not the right clock
 * for a picture that has to keep up with a hand.
 */
const EqCurve = ({ idx, width = 420, height = 128, color }) => {
    const pathRef = React.useRef(null);
    const N = window.OA_EQ_CURVE_POINTS;

    // Log across, decibels down. The x mapping is the curve's own spacing —
    // point i is already log-spaced — so this is a straight index-to-pixel.
    const x = React.useCallback((i) => (i / (N - 1)) * width, [N, width]);
    const y = React.useCallback(
        (db) => height / 2 - (Math.max(-EQ_PLOT_DB, Math.min(EQ_PLOT_DB, db)) / EQ_PLOT_DB) * (height / 2),
        [height],
    );

    // useOaFrame is (id, idx, onFrame). Called with the callback alone it
    // resolves oaPluginFrame(undefined, undefined) to null, returns before it
    // attaches, and the path below never receives a `d` — the curve was blank
    // from the day this panel shipped and looked like an empty EQ.
    window.useOaFrame('eq', idx, () => {
        if (!pathRef.current) return;
        const curve = window.oaEqCurve(idx);
        let d = '';
        for (let i = 0; i < N; i++) d += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(curve[i]).toFixed(1);
        pathRef.current.setAttribute('d', d);
    });

    // Where a labelled frequency falls along a log axis from 20 Hz to 20 kHz.
    const fx = (f) => {
        const lo = Math.log(20), hi = Math.log(20000);
        return ((Math.log(f) - lo) / (hi - lo)) * width;
    };

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
             style={{ display: 'block', background: '#15171b', borderRadius: '4px', border: '1px solid #000' }}>
            {EQ_PLOT_LINES.map((db) => (
                <React.Fragment key={db}>
                    <line x1={0} y1={y(db)} x2={width} y2={y(db)}
                          stroke={db === 0 ? '#4a515c' : '#282c33'} strokeWidth={db === 0 ? 1.2 : 1} />
                    <text x={3} y={y(db) - 2} fill="#5a616b" fontSize="7" style={{ userSelect: 'none' }}>
                        {db > 0 ? '+' + db : db}
                    </text>
                </React.Fragment>
            ))}
            {EQ_PLOT_HZ.map(({ f, label }) => (
                <React.Fragment key={f}>
                    <line x1={fx(f)} y1={0} x2={fx(f)} y2={height} stroke="#282c33" strokeWidth={1} />
                    <text x={fx(f) + 3} y={height - 3} fill="#5a616b" fontSize="7" style={{ userSelect: 'none' }}>
                        {label}
                    </text>
                </React.Fragment>
            ))}
            <path ref={pathRef} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        </svg>
    );
};

/**
 * The EQ panel for one pad.
 *
 * Everything that is not the curve is the generic surface. If this panel looks
 * plainer than the rack units, that is the finding, not an oversight.
 */
window.EqEditor = ({ idx, name, onClose, oaPopped, oaHosted }) => {
    const panel = window.useOaPanel({
        id: `eq-${idx}`, title: `${name} — EQ`, copy: oaPopped, hosted: oaHosted,
        render: () => <window.EqEditor idx={idx} name={name} onClose={onClose} oaPopped />,
    });

    // Armed for a take: the rack is bypassed, so the panel greys and its
    // controls stop taking moves that nothing would hear.
    const bypassed = window.useOaFxBypass();
    const veil = window.oaBypassVeil(bypassed);
    const [showHelp, setShowHelp] = React.useState(false);

    // The only thing this panel asks the EQ directly. Everything else comes
    // through the plugin host.
    const active = window.oaEqActive(idx);
    const color = active ? 'var(--accent)' : '#5a616b';

    // Taken once when the panel opens, so ABORT has somewhere to go back to.
    const opened = React.useRef(null);
    React.useEffect(() => { opened.current = window.oaPluginState('eq', idx); }, [idx]);

    const surface = window.useOaConsoleSurface('eq', idx);
    const dirty = !!opened.current && surface.list.some((d) => opened.current[d.key] !== d.value);
    const abort = () => {
        if (!opened.current) return;
        surface.list.forEach((d) => { if (d.writable) d.set(opened.current[d.key]); });
    };

    return panel.frame(
        <div {...panel.frameProps({
            position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--panel)', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.7)', zIndex: 1200,
            padding: '14px 16px', width: 'min(520px, 92vw)', maxHeight: '78vh', overflowY: 'auto'
        })}>
            <div {...panel.handle({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' })}>
                <span style={{ fontSize: '12px', color: color, fontWeight: 'bold', letterSpacing: '1px' }}>
                    {String(idx + 1).padStart(2, '0')} {name} — EQ
                </span>
                <span style={{ fontSize: '9px', color: '#666' }}>three bands, in series</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {bypassed && <window.OaOutOfCircuit />}
                    {dirty && (
                        <window.SeqButton label="↺ Abort" onClick={abort}
                            title="Put every control back where it was when this panel opened"
                            style={{ padding: '4px 10px' }} />
                    )}
                    {panel.chrome && <window.SeqButton label={panel.popLabel} onClick={panel.togglePop}
                        title={panel.popTitle} style={{ padding: '4px 10px' }} />}
                    {/* Help is a BUTTON rather than a standing paragraph: it is
                        read once and then in the way for ever. */}
                    <window.SeqButton label="? Help" onClick={() => setShowHelp((v) => !v)}
                        active={showHelp} title="What the bands do"
                        style={{ padding: '4px 10px' }} />
                    {panel.chrome && <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />}
                </div>
            </div>

            <div style={{ ...veil }}>
                <EqCurve idx={idx} color={active ? '#7fd1ff' : '#4a515c'} />

                {/* THE WHOLE CONTROL SURFACE. Seven parameters today; an eighth
                    added to OA_EQ_PARAMS appears here with no edit to this file,
                    which is the claim PLAN-18.12 step 3 exists to test. */}
                <window.OaConsoleSurface id="eq" idx={idx} style={{ marginTop: '12px' }} />
            </div>

            {showHelp && (
            <div style={{
                fontSize: '9px', color: '#8f9299', marginTop: '10px', lineHeight: 1.6,
                border: '1px solid #333840', borderRadius: '5px', background: '#1b1e23', padding: '8px 10px'
            }}>
                Three bands in series, so their decibels ADD — the curve above is the
                sum, which is why two gentle lifts an octave apart can add up to a peak
                neither of them asked for. LOW and HIGH are shelves: everything below
                or above their corner moves together. MID is a bell, and MID Q is how
                wide it is — 0.3 is most of the spectrum, 8 is a surgical notch. Cut
                before you boost; a −3 dB dip where the mud is will do more than a
                +3 dB lift where the air is, and it leaves you the headroom.
                <br /><br />
                This panel is drawn by the generic console surface rather than by a
                hand-built faceplate — see the header of this file for why that is
                deliberate.
            </div>
            )}
        </div>
    );
};
