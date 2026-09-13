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
 * Header: GateEditor.jsx
 * Purpose: The noise gate's panel — PLAN-189.01, step 4.
 * Description: Drawn by the generic console surface, exactly as `EqEditor.jsx`
 *   is and for the same reason: eight parameters that are all magnitudes need
 *   no faceplate to be legible, and a ninth added to `OA_GATE_PARAMS` should
 *   appear here with no edit to this file.
 *
 *   WHAT IS HAND-DRAWN, AND WHY. The transfer curve — output level against
 *   input level, with the threshold marked. The plan this panel closes says it
 *   in one line: *a wrong transfer function is VISIBLE here rather than merely
 *   audible*, so the picture is the verification surface and not decoration.
 *   The curve comes out of `oaGateCurve()`, which is the same statement of the
 *   transfer function the worklet evaluates per sample; `gate.test.mjs` holds
 *   the two together by rendering the DSP and comparing.
 *
 *   THE OPEN LAMP IS THE OTHER HALF. A gate's fault mode is chatter, and
 *   chatter is a thing the transfer curve cannot show — the curve is where the
 *   gain settles, and chatter is what it does on the way. The lamp reads the
 *   OPEN slot of the plugin frame on the meter clock, so a gate flickering on a
 *   sustained note is visible while it happens.
 *
 *   The curve and the lamp are read from arrays the back end owns and reuses,
 *   the same read-do-not-write contract as every other panel here.
 */

/** The plot's limits, in decibels, on both axes. */
const GATE_PLOT_LO = -84;
const GATE_PLOT_LINES = [-72, -48, -24, 0];

/**
 * The transfer curve, plotted: input level across, output level down, with the
 * unity diagonal behind it so the gap IS the gain reduction.
 *
 * Redrawn on the meter clock rather than on every render, because a knob drag
 * is a stream of writes and React is not the right clock for a picture that has
 * to keep up with a hand.
 */
const GateCurve = ({ idx, width = 200, height = 200, color }) => {
    const pathRef = React.useRef(null);
    const N = window.OA_GATE_CURVE_POINTS;

    const px = React.useCallback(
        (db) => ((Math.max(GATE_PLOT_LO, Math.min(0, db)) - GATE_PLOT_LO) / -GATE_PLOT_LO) * width,
        [width],
    );
    const py = React.useCallback(
        (db) => height - ((Math.max(GATE_PLOT_LO, Math.min(0, db)) - GATE_PLOT_LO) / -GATE_PLOT_LO) * height,
        [height],
    );

    // THREE ARGUMENTS, and the first two are load-bearing: useOaFrame resolves
    // the plugin frame from (id, idx) before it will attach at all, so a
    // callback passed on its own registers no loop and the path never gets a
    // `d`. EqEditor.jsx shipped with exactly that defect.
    window.useOaFrame('gate', idx, () => {
        if (!pathRef.current) return;
        const curve = window.oaGateCurve(idx);
        let d = '';
        for (let i = 0; i < N; i++) {
            const inDb = window.oaGateCurveDb(i);
            d += (i ? 'L' : 'M') + px(inDb).toFixed(1) + ' ' + py(curve[i]).toFixed(1);
        }
        pathRef.current.setAttribute('d', d);
    });

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
             style={{ display: 'block', background: '#15171b', borderRadius: '4px', border: '1px solid #000' }}>
            {GATE_PLOT_LINES.map((db) => (
                <React.Fragment key={db}>
                    <line x1={px(db)} y1={0} x2={px(db)} y2={height} stroke="#282c33" strokeWidth={1} />
                    <line x1={0} y1={py(db)} x2={width} y2={py(db)} stroke="#282c33" strokeWidth={1} />
                    <text x={px(db) + 3} y={height - 3} fill="#5a616b" fontSize="7" style={{ userSelect: 'none' }}>
                        {db}
                    </text>
                </React.Fragment>
            ))}
            {/* Unity. The distance from this line to the curve IS the reduction. */}
            <line x1={0} y1={height} x2={width} y2={0} stroke="#4a515c" strokeWidth={1} strokeDasharray="3 3" />
            <path ref={pathRef} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        </svg>
    );
};

/**
 * The OPEN lamp and the attenuation readout, both straight off the frame.
 *
 * Written into the DOM on the meter clock rather than through state: a lamp
 * that flickers with the gate would re-render the whole panel at the rate the
 * defect it is there to show happens at.
 */
const GateLamp = ({ idx }) => {
    const lampRef = React.useRef(null);
    const grRef = React.useRef(null);
    const L = window.oaPluginLayout('gate');

    window.useOaFrame('gate', idx, (frame) => {
        const live = frame[window.OA_SLOT.ACTIVE] > 0;
        const open = frame[L.OPEN] > 0;
        if (lampRef.current) {
            lampRef.current.style.background = !live ? '#2a2f38' : (open ? window.OA_GATE_COLOR : '#3a2020');
            lampRef.current.style.boxShadow = live && open ? `0 0 6px ${window.OA_GATE_COLOR}` : 'none';
        }
        if (grRef.current) {
            const gr = live ? frame[L.GR] : 0;
            const text = gr > 0.15 ? '-' + gr.toFixed(1) + ' dB' : live ? 'open' : '—';
            if (grRef.current.textContent !== text) grRef.current.textContent = text;
        }
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: '#8f9299' }}>
            <i ref={lampRef} style={{
                width: '9px', height: '9px', borderRadius: '50%', background: '#2a2f38',
                border: '1px solid #000', display: 'inline-block',
            }} />
            <span>OPEN</span>
            <i ref={grRef} style={{
                fontStyle: 'normal', fontVariantNumeric: 'tabular-nums', color: '#c8ccd2', minWidth: '52px',
            }}>—</i>
        </div>
    );
};

/**
 * The gate panel for one pad.
 *
 * Everything that is not the curve and the lamp is the generic surface.
 */
window.GateEditor = ({ idx, name, onClose, oaPopped, oaHosted }) => {
    const panel = window.useOaPanel({
        id: `gate-${idx}`, title: `${name} — Gate`, copy: oaPopped, hosted: oaHosted,
        render: () => <window.GateEditor idx={idx} name={name} onClose={onClose} oaPopped />,
    });

    // Armed for a take: the rack is bypassed, so the panel greys and its
    // controls stop taking moves that nothing would hear.
    const bypassed = window.useOaFxBypass();
    const veil = window.oaBypassVeil(bypassed);
    const [showHelp, setShowHelp] = React.useState(false);

    const active = window.oaGateActive(idx);
    const color = active ? window.OA_GATE_COLOR : '#5a616b';

    // Taken once when the panel opens, so ABORT has somewhere to go back to.
    const opened = React.useRef(null);
    React.useEffect(() => { opened.current = window.oaPluginState('gate', idx); }, [idx]);

    const surface = window.useOaConsoleSurface('gate', idx);
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
                    {String(idx + 1).padStart(2, '0')} {name} — GATE
                </span>
                <span style={{ fontSize: '9px', color: '#666' }}>downward expander, with hold</span>
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
                        active={showHelp} title="What the knobs do, and which one stops chatter"
                        style={{ padding: '4px 10px' }} />
                    {panel.chrome && <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />}
                </div>
            </div>

            <div style={{ ...veil }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ flex: '0 0 200px' }}>
                        <GateCurve idx={idx} color={active ? window.OA_GATE_COLOR : '#4a515c'} />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <GateLamp idx={idx} />
                        <div style={{ fontSize: '9px', color: '#5a616b', lineHeight: 1.5 }}>
                            The dashed diagonal is unity. The gap between it and the curve is how
                            many decibels the gate takes off a steady signal at that level — which
                            is what it settles to, not what it does on the way there.
                        </div>
                    </div>
                </div>

                {/* THE WHOLE CONTROL SURFACE. Eight parameters today; a ninth
                    added to OA_GATE_PARAMS appears here with no edit to this
                    file, which is the same claim EqEditor.jsx tests. */}
                <window.OaConsoleSurface id="gate" idx={idx} style={{ marginTop: '12px' }} />
            </div>

            {showHelp && (
            <div style={{
                fontSize: '9px', color: '#8f9299', marginTop: '10px', lineHeight: 1.6,
                border: '1px solid #333840', borderRadius: '5px', background: '#1b1e23', padding: '8px 10px'
            }}>
                A gate is a compressor upside down: above the THRESHOLD it does nothing,
                below it every decibel the signal falls is multiplied by the RATIO on its
                way out. RANGE is the floor — how far down a shut gate goes, and 0 dB is
                a wire, so that knob is also the off switch.
                <br /><br />
                <b>If it chatters, the knob you want is HOLD, and after that
                HYSTERESIS.</b> A peak detector sees a zero crossing twice a cycle, so a
                40 Hz note falls to nothing every 12.5 ms; HOLD is how long the gate
                stays open across those gaps, and it has to outlast one cycle of the
                lowest note on the channel. HYSTERESIS closes the gate that many
                decibels BELOW where it opens, so a signal parked on the threshold has
                nowhere to flicker to. RELEASE only smooths the decision; it cannot
                rescue one that was wrong eighty times a second.
                <br /><br />
                ATTACK is the OPENING time — the opposite sense to the compressor next
                door. Slow attack clips the front off a stick hit, so drums want it
                under half a millisecond and spend their time on the hold instead.
            </div>
            )}
        </div>
    );
};
