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
 * Header: TapeDelayEditor.jsx
 * Purpose: The front panel of one tape echo — the machine, not a list of sliders.
 * Description: A painted faceplate in a tolex-covered box, brushed silver knobs
 *   across it, and two HEAD SELECT dials with the note divisions printed around
 *   them. Every control writes straight through to the live bus: the tape is
 *   already turning, so a knob move is heard on the repeats still circulating in
 *   the loop rather than only on the next hit.
 */

// Not every control should turn in equal steps. Rate and tape age are heard as
// ratios, so they get a logarithmic taper — a knob that spends half its travel
// between 8kHz and 16kHz is a knob doing nothing. The heads get a squared taper
// instead: it opens up the short end where slapbacks live without pushing every
// note division into the last quarter of the dial the way a log head does.
const TAPE_TAPER = { timeL: 'sq', timeR: 'sq', wowRate: 'log', damp: 'log' };

const tapeNorm = (p, v) => {
    const val = Math.max(p.min, Math.min(p.max, v));
    const taper = TAPE_TAPER[p.key];
    if (taper === 'log') return Math.log(val / p.min) / Math.log(p.max / p.min);
    const lin = (val - p.min) / ((p.max - p.min) || 1);
    return taper === 'sq' ? Math.sqrt(lin) : lin;
};
const tapeValue = (p, n) => {
    const taper = TAPE_TAPER[p.key];
    const raw = taper === 'log'
        ? p.min * Math.pow(p.max / p.min, n)
        : p.min + (taper === 'sq' ? n * n : n) * (p.max - p.min);
    const snapped = Math.round(raw / p.step) * p.step;
    return Math.max(p.min, Math.min(p.max, Number(snapped.toFixed(6))));
};

// The divisions printed around a head dial. Only the ones that land inside the
// head's own 10ms–2s range at the current tempo are drawn — at 200 BPM there is
// no room for 4 bars of tape, so that number is simply not on the dial.
const TAPE_DIVISIONS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
const headDetents = (spec, bpm) => {
    const step = window.OA_DELAY_SIXTEENTH(bpm);
    return TAPE_DIVISIONS
        .map((steps) => ({ steps: steps, secs: steps * step }))
        .filter((d) => d.secs >= spec.min && d.secs <= spec.max)
        .map((d) => ({
            steps: d.steps,
            norm: tapeNorm(spec, d.secs),
            label: String(d.steps),
            title: `${window.oaBeatLabel(d.steps)} — ${Math.round(d.secs * 1000)} ms at ${bpm} BPM`,
        }));
};

// Panel finishes. The box is tolex over ply, the trim strips are brushed
// aluminium, and the faceplate is the paint everything sits on.
//
// That paint is the theme accent shaded down rather than a fixed green, so the
// machine repaints with the rest of the app when Config's colour picker moves.
// The tolex and the aluminium do not follow it: black vinyl and bare metal are
// what they are under any theme, and neither are the lamps — the nixie head
// readouts and the lit note division stay green, because a lamp is not paint
// and has to read against whatever hue the plate lands on.
const TOLEX = {
    background:
        'repeating-linear-gradient(48deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px),'
        + 'repeating-linear-gradient(-48deg, rgba(0,0,0,0.5) 0 1px, transparent 1px 3px),'
        + 'linear-gradient(180deg, #23231f 0%, #17171a 55%, #101012 100%)',
    border: '1px solid #000',
    borderRadius: '7px',
    boxShadow: 'inset 0 1px 0 #ffffff14, 0 3px 10px rgba(0,0,0,0.6)',
    padding: '7px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
};

const BRUSHED = {
    background:
        'repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 1px, rgba(0,0,0,0.07) 1px 2px),'
        + 'linear-gradient(180deg, #f2f4f6 0%, #d2d6db 22%, #a3a9b0 55%, #cbcfd4 80%, #eef0f2 100%)',
    border: '1px solid #000',
    borderRadius: '3px',
    boxShadow: 'inset 0 1px 0 #ffffff88, 0 1px 3px rgba(0,0,0,0.5)',
};

// Lit from above and to the left, as the plate is in a rack: the top corner
// catches the room light and the far bottom corner is the shaded end.
const PLATE = {
    background:
        'radial-gradient(130% 110% at 28% -10%, var(--accent-s25) 0%, var(--accent-s40) 46%, var(--accent-s70) 100%)',
    border: '1px solid var(--accent-s85)',
    borderRadius: '3px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -3px 8px rgba(0,0,0,0.45)',
};

// Section names are silkscreened, and silkscreen is white ink on whatever the
// plate happens to be painted — so this one stays put when the theme moves.
const SCREEN = { fontSize: '8px', color: '#eef2e2', letterSpacing: '1.6px', textShadow: '0 1px 1px #0007' };

// A nixie-green readout, the way the head times are shown on the real machine.
const LedReadout = ({ label, text }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <span style={{ fontSize: '7px', color: '#2c3035', letterSpacing: '1.2px', fontWeight: 700 }}>{label}</span>
        <span style={{
            background: 'linear-gradient(180deg, #06180a 0%, #0d2410 100%)',
            border: '1px solid #000', borderRadius: '2px',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
            padding: '2px 6px', minWidth: '46px', textAlign: 'center',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '11px', color: '#7dff4a', textShadow: '0 0 6px rgba(125,255,74,0.65)',
            fontVariantNumeric: 'tabular-nums',
        }}>
            {text}
        </span>
    </div>
);

window.TapeDelayEditor = ({ u, bpm, onClose, oaPopped, oaHosted }) => {
    const panel = window.useOaPanel({
        id: `tape-${u}`, title: `${window.OA_DELAY_UNITS[u].name} — TAPE ECHO`, copy: oaPopped, hosted: oaHosted,
        render: () => <window.TapeDelayEditor u={u} bpm={bpm} onClose={onClose} oaPopped />,
    });
    // Settings and faceplate both through the interface. The one thing this
    // panel still reaches for by name is oaSetDelaySync — locking a head to the
    // grid is a tape-specific control with no equivalent on any other plugin,
    // so it stays the tape's own call rather than being forced into the shared
    // shape for the sake of symmetry.
    const unit = window.useOaState('delay', u);
    // What controls this machine has, and which may be written. PLAN-18.12.
    const surface = window.useOaConsoleSurface('delay', u);
    // Armed for a take: nothing is being sent to this tape, so the box greys
    // and stops taking moves that nothing would hear.
    const bypassed = window.useOaFxBypass();
    const veil = window.oaBypassVeil(bypassed);
    const [showHelp, setShowHelp] = React.useState(false);

    // Taken once per unit, so ABORT goes back to however the tape sounded when
    // the panel was opened — not to the factory preset.
    const opened = React.useRef(null);
    React.useEffect(() => {
        opened.current = JSON.parse(JSON.stringify(window.oaPluginState('delay', u)));
    }, [u]);

    const meta = window.OA_DELAY_UNITS[u];
    const factory = window.oaPluginPresets('delay')[meta.preset] || {};

    if (!unit) return null;

    const dirty = !!opened.current && surface.list.some((d) => opened.current[d.key] !== unit[d.key]);
    // The undo path writes through the descriptors' own writers, so a control
    // the adapter will not let the panel move is not moved by ABORT either.
    const abort = () => {
        if (!opened.current) return;
        surface.list.forEach((d) => { if (d.writable) d.set(opened.current[d.key]); });
    };

    const specOf = (key) => surface.by[key];
    const set = (d, n) => { if (d.writable) d.set(tapeValue(d, n)); };

    // The two heads take the big dials; everything else is a knob in the row
    // under them, in the order the signal meets it.
    const heads = [
        { side: 'L', spec: specOf('timeL') },
        { side: 'R', spec: specOf('timeR') },
    ];
    const knobs = surface.list.filter((d) => d.key !== 'timeL' && d.key !== 'timeR');

    return panel.frame(
        <div {...panel.frameProps({
            position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--panel)', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.7)', zIndex: 1200,
            padding: '12px 14px', width: 'min(600px, 94vw)', maxHeight: '78vh', overflowY: 'auto'
        })}>
            <div {...panel.handle({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' })}>
                <span style={{ fontSize: '12px', color: meta.color, fontWeight: 'bold', letterSpacing: '1px' }}>
                    {meta.name} — TAPE ECHO
                </span>
                <span style={{ fontSize: '9px', color: '#666', fontVariantNumeric: 'tabular-nums' }}>
                    {bpm} BPM
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {panel.chrome && <window.SeqButton label={panel.popLabel} onClick={panel.togglePop}
                        title={panel.popTitle}
                        style={{ padding: '4px 10px' }} />}
                    {/* Help is a BUTTON rather than a standing paragraph: it is
                        read once and then in the way for ever. */}
                    <window.SeqButton label="? Help" onClick={() => setShowHelp((v) => !v)}
                        active={showHelp}
                        title="How to drive this thing"
                        style={{ padding: '4px 10px' }} />
                    <window.SeqButton label="⟲ Abort" onClick={abort} disabled={!dirty}
                        color={dirty ? '#b71c1c' : undefined} textColor={dirty ? '#fff' : undefined}
                        title="Back to how this tape sounded when the panel was opened"
                        style={{ padding: '4px 10px', border: 'none' }} />
                    {bypassed && <window.OaOutOfCircuit />}
                    {panel.chrome && <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />}
                </div>
            </div>

            {/* ---- the box itself ---- */}
            <div style={{ ...TOLEX, ...veil }}>

                {/* Top trim: the badge strip across the front of the machine. */}
                <div style={{ ...BRUSHED, display: 'flex', alignItems: 'baseline', gap: '8px', padding: '5px 10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#20242a', letterSpacing: '1.5px' }}>
                        {meta.name}
                    </span>
                    <span style={{ fontSize: '10px', color: '#40464e', letterSpacing: '3px' }}>TAPE ECHO</span>
                    <span style={{ marginLeft: 'auto', fontSize: '8px', color: '#5a6068', letterSpacing: '1px' }}>
                        {unit.chorus ? `DIM ${unit.chorus}` : 'MONO IN / STEREO OUT'}
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch', flexWrap: 'wrap' }}>

                    {/* The main faceplate: heads on top, the tape controls below. */}
                    <div style={{ ...PLATE, flex: '3 1 300px', padding: '7px 8px 9px' }}>
                        <div style={{ ...SCREEN, textAlign: 'center', marginBottom: '2px' }}>HEAD SELECT</div>

                        <div style={{ display: 'flex', justifyContent: 'space-evenly', gap: '4px' }}>
                            {heads.map(({ side, spec }) => {
                                const locked = unit['sync' + side] || 0;
                                return (
                                    <window.GalaxyHeadSelect
                                        key={side}
                                        label={`HEAD ${side}`}
                                        norm={tapeNorm(spec, spec.value)}
                                        defaultNorm={tapeNorm(spec, factory[spec.key])}
                                        onNorm={spec.writable ? (n) => set(spec, n) : undefined}
                                        detents={headDetents(spec, bpm)}
                                        activeSteps={locked}
                                        onDetent={(steps) => window.oaSetDelaySync(u, side, steps, bpm)}
                                        readout={locked ? window.oaBeatLabel(locked) : spec.display}
                                        footer={locked ? 'LOCKED' : 'FREE'}
                                    />
                                );
                            })}
                        </div>

                        <div style={{ borderTop: '1px solid rgba(0,0,0,0.35)', boxShadow: '0 1px 0 rgba(255,255,255,0.12)', margin: '7px 0 8px' }} />

                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-evenly', gap: '4px 2px' }}>
                            {knobs.map((d) => (
                                <window.GalaxyKnob
                                    key={d.key}
                                    label={d.label.toUpperCase()}
                                    norm={tapeNorm(d, d.value)}
                                    defaultNorm={tapeNorm(d, factory[d.key])}
                                    onNorm={d.writable ? (n) => set(d, n) : undefined}
                                    readout={d.display}
                                    title={d.writable
                                        ? `${d.label} — drag up and down, shift for fine, alt-click to reset`
                                        : `${d.label} — read-only`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Aux out of an aux: throw the repeats into a room. Its own
                        green panel, the way the reverb section is boxed off on
                        the real front. */}
                    <div style={{ ...PLATE, flex: '1 1 130px', padding: '7px 6px 9px' }}>
                        <div style={{ ...SCREEN, textAlign: 'center', marginBottom: '2px' }}>REVERB SEND</div>
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'space-evenly', gap: '6px', height: 'calc(100% - 12px)'
                        }}>
                            {window.OA_REVERB_UNITS.map((rvMeta, r) => {
                                const amt = unit.toRv[r] || 0;
                                return (
                                    <window.GalaxyKnob
                                        key={r}
                                        label={rvMeta.name.toUpperCase()}
                                        norm={amt}
                                        defaultNorm={0}
                                        onNorm={(n) => window.oaSetDelayToReverb(u, r, Math.round(n * 100) / 100)}
                                        readout={`${Math.round(amt * 100)}%`}
                                        accent={amt > 0.005 ? rvMeta.color : '#dfe6c8'}
                                        title={`How much of this tape is thrown into ${rvMeta.name}`}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Bottom trim: the head displays and the machine selector. */}
                <div style={{
                    ...BRUSHED, display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                    gap: '10px', padding: '5px 10px'
                }}>
                    <LedReadout label="HEAD L" text={Math.round(unit.timeL * 1000)} />
                    <LedReadout label="HEAD R" text={Math.round(unit.timeR * 1000)} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '7px', color: '#2c3035', letterSpacing: '1.2px', fontWeight: 700 }}>
                            MACHINE
                        </span>
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) window.oaPluginPreset('delay', u, e.target.value); }}
                            style={{
                                background: '#14181c', color: meta.color, border: '1px solid #000',
                                borderRadius: '2px', fontSize: '11px', padding: '2px 4px'
                            }}
                        >
                            <option value="">Load a setting…</option>
                            {Object.keys(window.OA_DELAY_PRESETS).map((k) => (
                                <option key={k} value={k}>{window.OA_DELAY_PRESETS[k].label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {showHelp && (
            <div style={{
                fontSize: '9px', color: '#8f9299', marginTop: '10px', lineHeight: 1.6,
                border: '1px solid #333840', borderRadius: '5px', background: '#1b1e23', padding: '8px 10px'
            }}>
                Turn a head dial to set it in milliseconds; tap a number printed around it to
                lock that head to a note division, and it follows the tempo from then on.
                Drag any knob up or down — hold shift for fine, alt-click for the factory
                setting. Intensity past ~100% self-oscillates: the loop feeds itself faster
                than the tape can shed it, and the repeats build until the saturation holds them.
            </div>
            )}
        </div>
    );
};
