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

// The DRIVE pedal for one channel. Everything on this panel is a knob on a
// stompbox, plus one thing a stompbox could never show you: the transfer curve
// itself, drawn from the exact lookup table the audio is running through.

// A drive knob that spends half its travel between 20x and 40x is useless — the
// ear hears ratios, not differences — so the logarithmic params are driven
// through a normalised 0..1 knob and mapped back on the way out.
const toNorm = (p, v) => p.log
    ? Math.log(Math.max(p.min, v) / p.min) / Math.log(p.max / p.min)
    : (v - p.min) / ((p.max - p.min) || 1);
const fromNorm = (p, n) => p.log
    ? p.min * Math.pow(p.max / p.min, n)
    : p.min + n * (p.max - p.min);

// One knob, from ONE descriptor. `d` carries the bounds and the default from
// the adapter, the label and formatter from the plugin's own schema, and the
// live value already formatted — so this no longer reaches into `params` for
// half of it and `unit` for the other half. A read-only descriptor hands
// SvgKnob no writer, and SvgKnob greys itself and refuses the gesture.
const DriveKnob = ({ d, color, size = 40 }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <window.SvgKnob
            value={toNorm(d, d.value)} min={0} max={1} defaultVal={toNorm(d, d.def)}
            color={color} size={size}
            label={d.label.toUpperCase()} display={d.display}
            onChange={d.writable ? (n) => d.set(fromNorm(d, n)) : undefined}
        />
        <div style={{ fontSize: '8px', color: '#8f9299', letterSpacing: '1px' }}>{d.label.toUpperCase()}</div>
        <div style={{ fontSize: '9px', color: color, fontVariantNumeric: 'tabular-nums' }}>{d.display}</div>
    </div>
);

// One of the three voicings. Interlocked — a pedal has one circuit in at a time.
const ModeButton = ({ mode, active, onPress }) => (
    <button
        onClick={() => onPress(mode.key)}
        title={mode.hint}
        style={{
            flex: 1, padding: '6px 4px', borderRadius: '3px', cursor: 'pointer',
            background: active
                ? `linear-gradient(to bottom, ${mode.color} 0%, ${mode.color} 62%, #00000055 100%)`
                : 'linear-gradient(to bottom, #3a3e45 0%, #00000030 100%)',
            border: '1px solid #000',
            boxShadow: active ? 'inset 0 2px 5px rgba(0,0,0,0.6)' : '0 2px 0 #000, 0 3px 4px rgba(0,0,0,0.55)',
            transform: active ? 'translateY(2px)' : 'none',
            color: active ? '#15171b' : '#9aa3ae',
            fontSize: '9px', fontWeight: '700', letterSpacing: '.8px',
            transition: 'transform .06s, box-shadow .06s',
        }}
    >
        {mode.label.toUpperCase()}
    </button>
);

/**
 * The picture of what the pedal does to a wave. Input runs left to right,
 * output bottom to top, so a straight diagonal is a wire and anything else is
 * distortion. The flat shoulders are the clipping, a kink at the origin is the
 * starve dead zone, and a curve that is not symmetric about the centre is the
 * asymmetry that makes the even harmonics.
 */
const TransferPlot = ({ idx, unit, color }) => {
    const N = 160;
    const S = 148;                                   // drawing box, px
    // Asked for by plugin id, not by function name. What comes back is the very
    // table the WaveShaper is running — if the two ever disagreed, the picture
    // would be the one lying, and there is now only one of them to disagree.
    const curve = window.useOaCurve('drive', idx);

    const px = (x) => (x + 1) / 2 * S;
    const py = (y) => S - (Math.max(-1.15, Math.min(1.15, y)) + 1) / 2 * S;

    const wet = [];
    const out = [];
    for (let i = 0; curve && i < N; i++) {
        const x = (i / (N - 1)) * 2 - 1;
        const w = curve[Math.round((x + 1) / 2 * (curve.length - 1))];
        wet.push(`${px(x).toFixed(1)},${py(w).toFixed(1)}`);
        out.push(`${px(x).toFixed(1)},${py(x * (1 - unit.mix) + w * unit.mix * unit.level).toFixed(1)}`);
    }

    return (
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ display: 'block', borderRadius: '3px', background: '#101216', border: '1px solid #000' }}>
            {[0.25, 0.5, 0.75].map((f) => (
                <React.Fragment key={f}>
                    <line x1={f * S} y1={0} x2={f * S} y2={S} stroke="#ffffff0d" strokeWidth={1} />
                    <line x1={0} y1={f * S} x2={S} y2={f * S} stroke="#ffffff0d" strokeWidth={1} />
                </React.Fragment>
            ))}
            {/* The wire: what a perfectly transparent channel looks like. */}
            <line x1={0} y1={S} x2={S} y2={0} stroke="#5a6472" strokeWidth={1} strokeDasharray="3 3" />
            {/* The pedal on its own, at 100% wet... */}
            <polyline points={wet.join(' ')} fill="none" style={{ stroke: color }} strokeWidth={1} opacity={0.3} />
            {/* ...and what actually leaves the channel once the mix is applied. */}
            <polyline points={out.join(' ')} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinejoin="round" />
            <text x={4} y={S - 4} fill="#5a6472" fontSize="7" letterSpacing="1">IN →</text>
            <text x={4} y={10} fill="#5a6472" fontSize="7" letterSpacing="1">OUT ↑</text>
        </svg>
    );
};

/**
 * The pedal panel for one channel. Writes straight to the live unit, and since
 * the pedal is built per voice the next hit carries whatever is set here.
 */
window.DriveEditor = ({ idx, name, onClose, oaPopped, oaHosted }) => {
    const panel = window.useOaPanel({
        id: `drive-${idx}`, title: `${name} — DRIVE`, copy: oaPopped, hosted: oaHosted,
        render: () => <window.DriveEditor idx={idx} name={name} onClose={onClose} oaPopped />,
    });
    const unit = window.useOaState('drive', idx);
    // What controls this pedal has, and which may be written. PLAN-18.12.
    const surface = window.useOaConsoleSurface('drive', idx);
    // Armed for a take: the pedal is not in the graph at all, so the faceplate
    // says so and stops taking knob moves that nothing would hear.
    const bypassed = window.useOaFxBypass();
    const veil = window.oaBypassVeil(bypassed);
    const [showHelp, setShowHelp] = React.useState(false);

    // Taken once per channel, so ABORT goes back to how this channel sounded
    // when the panel was opened rather than to a factory setting.
    const opened = React.useRef(null);
    React.useEffect(() => {
        const u = window.oaPluginState('drive', idx);
        opened.current = { mode: u.mode };
        window.oaPluginParams('drive', idx).forEach((p) => { opened.current[p.key] = u[p.key]; });
    }, [idx]);

    // The mode's own colour and hint stay a drive-specific lookup: a voicing is
    // not a parameter, it is which of three curves the pedal is baking.
    const mode = window.oaDriveMode(unit.mode);
    const mixD = surface.by.mix;
    const knobs = surface.list.filter((d) => d.key !== 'mix');
    const on = unit.mix > window.OA_DRIVE_EPSILON;
    const color = mode.color;

    const dirty = !!opened.current && (opened.current.mode !== unit.mode
        || surface.list.some((d) => opened.current[d.key] !== unit[d.key]));
    // ABORT restores what was on the panel when it opened. It goes through the
    // descriptor's own writer, so a parameter the adapter will not let the
    // panel write is not written back by the undo path either.
    const abort = () => {
        if (!opened.current) return;
        window.oaPluginSet('drive', idx, 'mode', opened.current.mode);
        surface.list.forEach((d) => { if (d.writable) d.set(opened.current[d.key]); });
    };

    return panel.frame(
        <div {...panel.frameProps({
            position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--panel)', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.7)', zIndex: 1200,
            padding: '14px 16px', width: 'min(560px, 92vw)', maxHeight: '78vh', overflowY: 'auto'
        })}>
            <div {...panel.handle({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' })}>
                <span style={{ fontSize: '12px', color: color, fontWeight: 'bold', letterSpacing: '1px' }}>
                    {name} — DRIVE
                </span>
                <span style={{ fontSize: '9px', color: '#666' }}>before the pan and the sends</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {panel.chrome && <window.SeqButton label={panel.popLabel} onClick={panel.togglePop}
                        title={panel.popTitle}
                        style={{ padding: '4px 10px' }} />}
                    {/* Help is a BUTTON rather than a standing paragraph: it is
                        read once and then in the way for ever. */}
                    <window.SeqButton label="? Help" onClick={() => setShowHelp((v) => !v)}
                        active={showHelp}
                        title="What the switches do"
                        style={{ padding: '4px 10px' }} />
                    <window.SeqButton label="⟲ Abort" onClick={abort} disabled={!dirty}
                        color={dirty ? '#b71c1c' : undefined} textColor={dirty ? '#fff' : undefined}
                        title="Back to how this channel sounded when the panel was opened"
                        style={{ padding: '4px 10px', border: 'none' }} />
                    {bypassed && <window.OaOutOfCircuit />}
                    {panel.chrome && <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />}
                </div>
            </div>

            {/* The faceplate — hammered enclosure, knobs across the top. */}
            <div style={{
                background: 'linear-gradient(to bottom, #24262a 0%, #17181b 100%)',
                border: '1px solid #000', borderRadius: '4px',
                boxShadow: 'inset 0 1px 0 #ffffff12', padding: '12px 14px 10px',
                ...veil
            }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                    {window.OA_DRIVE_MODES.map((m) => (
                        <ModeButton key={m.key} mode={m} active={m.key === unit.mode}
                            onPress={(k) => window.oaPluginSet('drive', idx, 'mode', k)} />
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                            {knobs.map((d) => (
                                <DriveKnob key={d.key} d={d} color={color} />
                            ))}
                        </div>

                        {/* MIX gets its own row and a bigger knob — it is the one
                            control that decides whether this channel is touched
                            at all, and at 0 the pedal is not in the graph. */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            borderTop: '1px solid #ffffff10', paddingTop: '10px'
                        }}>
                            {mixD ? <DriveKnob d={mixD} color={color} size={52} /> : null}
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                    <span style={{
                                        width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block',
                                        background: on ? color : '#3a1a16',
                                        boxShadow: on ? `0 0 6px ${color}` : 'inset 0 1px 2px #000'
                                    }}></span>
                                    <span style={{ fontSize: '8px', color: '#8f9299', letterSpacing: '1.5px' }}>
                                        {on ? 'ENGAGED' : 'BYPASS'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '9px', color: '#777', lineHeight: 1.45 }}>
                                    {on
                                        ? mode.hint
                                        : 'At 0% no pedal is built — the voice goes to the pan untouched.'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <TransferPlot idx={idx} unit={unit} color={color} />
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                <span style={{ fontSize: '10px', color: '#aaa' }}>Pedal</span>
                <select
                    value=""
                    onChange={(e) => { if (e.target.value) window.oaPluginPreset('drive', idx, e.target.value); }}
                    style={{ background: '#222', color: color, border: '1px solid #444', borderRadius: '3px', fontSize: '11px', padding: '3px 6px' }}
                >
                    <option value="">Load a setting…</option>
                    {Object.keys(window.OA_DRIVE_PRESETS).map((k) => (
                        <option key={k} value={k}>{window.OA_DRIVE_PRESETS[k].label}</option>
                    ))}
                </select>
                <span style={{ fontSize: '10px', color: '#777', fontStyle: 'italic' }}>
                    drive squashes the peaks; the harmonics that appear are the sound
                </span>
            </div>

            {showHelp && (
            <div style={{
                fontSize: '9px', color: '#8f9299', marginTop: '10px', lineHeight: 1.6,
                border: '1px solid #333840', borderRadius: '5px', background: '#1b1e23', padding: '8px 10px'
            }}>
                STARVE is a dying battery — the dead zone around silence gets wide enough
                that the tail of a note sputters out instead of decaying. OCTAVE folds the
                bottom half of the wave up onto the top, so it repeats twice as often and
                the pitch jumps an octave. Blend both back against the dry signal with MIX.
            </div>
            )}
        </div>
    );
};
