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

// The front panel of the width box: a bypass switch, four latching buttons, and
// nothing else. The original had no rate, depth or mix control — choosing a
// combination IS the whole interface, and that constraint is the reason the box
// is so hard to make sound bad.
//
// The buttons LATCH TOGETHER rather than interlocking. Four caps give twelve
// usable settings: each alone, then the pairs and the larger stacks, which is
// where the widths between and beyond the numbered four come from. The panel
// therefore draws five buttons whatever the size of the mode table — pressing
// one toggles it into the combination and the back end resolves that to a mode.

// One button on the faceplate. OFF is the red one, the four buttons are ivory,
// and a pressed cap sits down in its well.
const DimButton = ({ label, off, active, color, onPress }) => {
    const face = active
        ? (off ? '#e8402c' : color)
        : (off ? '#7a2418' : '#d9d4c8');
    return (
        <button
            onClick={onPress}
            title={off ? 'Chorus off' : `Width button ${label} — combines with the others`}
            style={{
                width: '38px', height: '30px', borderRadius: '2px', cursor: 'pointer',
                background: active
                    ? `linear-gradient(to bottom, ${face} 0%, ${face} 60%, #00000055 100%)`
                    : `linear-gradient(to bottom, ${face} 0%, #00000030 100%)`,
                border: '1px solid #000',
                boxShadow: active
                    ? 'inset 0 2px 5px rgba(0,0,0,0.65)'
                    : '0 2px 0 #000, 0 3px 4px rgba(0,0,0,0.6)',
                transform: active ? 'translateY(2px)' : 'none',
                color: off ? '#fff' : '#2a2a2a',
                fontSize: off ? '9px' : '12px', fontWeight: '700', letterSpacing: '.5px',
                padding: 0, transition: 'transform .06s, box-shadow .06s',
            }}
        >
            {label}
        </button>
    );
};

/**
 * The CHORUS panel for one delay return. It writes straight to the live bus, so
 * a button lands on the repeats already circulating in the tape loop.
 */
window.ChorusEditor = ({ u, onClose, oaPopped, oaHosted }) => {
    const panel = window.useOaPanel({
        id: `chorus-${u}`, title: `${window.OA_DELAY_UNITS[u].name} — CHORUS`, copy: oaPopped, hosted: oaHosted,
        render: () => <window.ChorusEditor u={u} onClose={onClose} oaPopped />,
    });
    // The chorus is an insert inside a tape delay, but this panel does not need
    // to know that: it asks the 'chorus' plugin for unit u. Which delay it lives
    // in, and how the two are wired, is the back end's business.
    const state = window.useOaState('chorus', u);
    // Armed for a take: the tape this sits inside is not being fed, so the
    // plate greys and stops taking buttons that nothing would hear.
    const bypassed = window.useOaFxBypass();
    const veil = window.oaBypassVeil(bypassed);
    const [showHelp, setShowHelp] = React.useState(false);

    const meta = window.OA_DELAY_UNITS[u];
    const mode = (state && state.chorus) || 0;
    const on = mode > 0;

    // Which caps are physically down, and what pressing one more (or letting one
    // up) resolves to. The back end owns that table; this only reports the press.
    const down = window.oaChorusButtons(mode);
    const press = (n) => window.oaPluginSet('chorus', u, 'chorus', window.oaChorusToggle(mode, n));
    const allOff = () => window.oaPluginSet('chorus', u, 'chorus', 0);

    return panel.frame(
        <div {...panel.frameProps({
            position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--panel)', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.7)', zIndex: 1200,
            padding: '14px 16px', width: 'min(420px, 92vw)'
        })}>
            <div {...panel.handle({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' })}>
                <span style={{ fontSize: '12px', color: meta.color, fontWeight: 'bold', letterSpacing: '1px' }}>
                    {meta.name} — CHORUS
                </span>
                <span style={{ fontSize: '9px', color: '#666' }}>after the tape</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {bypassed && <window.OaOutOfCircuit />}
                    {panel.chrome && <window.SeqButton label={panel.popLabel} onClick={panel.togglePop}
                        title={panel.popTitle}
                        style={{ padding: '4px 10px' }} />}
                    {/* Help is a BUTTON rather than a standing paragraph: it is
                        read once and then in the way for ever. */}
                    <window.SeqButton label="? Help" onClick={() => setShowHelp((v) => !v)}
                        active={showHelp}
                        title="What the buttons do"
                        style={{ padding: '4px 10px' }} />
                    {panel.chrome && <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />}
                </div>
            </div>

            {/* The faceplate itself — brushed black, with the mode row across it. */}
            <div style={{
                background: 'linear-gradient(to bottom, #24262a 0%, #17181b 100%)',
                border: '1px solid #000', borderRadius: '4px',
                boxShadow: 'inset 0 1px 0 #ffffff12',
                padding: '12px 14px 10px', ...veil
            }}>
                <div style={{
                    fontSize: '8px', color: '#8f9299', letterSpacing: '2px',
                    textAlign: 'center', marginBottom: '8px'
                }}>
                    WIDTH MODE
                </div>

                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'flex-end' }}>
                    <DimButton label="OFF" off active={mode === 0} color={meta.color} onPress={allOff} />
                    {[1, 2, 3, 4].map((n) => (
                        <DimButton key={n} label={String(n)} active={down.indexOf(n) >= 0}
                                   color={meta.color} onPress={() => press(n)} />
                    ))}
                </div>

                {/* What the combination currently down resolves to. On the box
                    this is engraved nowhere — you learn it by ear — but a
                    display that can name the setting may as well. */}
                <div style={{
                    fontSize: '9px', color: '#8f9299', letterSpacing: '1px',
                    textAlign: 'center', marginTop: '8px'
                }}>
                    {window.oaChorusMode(mode).label}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', marginTop: '10px' }}>
                    <span style={{
                        width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block',
                        background: on ? '#ff3b2f' : '#3a1a16',
                        boxShadow: on ? '0 0 6px #ff3b2f' : 'inset 0 1px 2px #000'
                    }}></span>
                    <span style={{ fontSize: '8px', color: '#8f9299', letterSpacing: '1.5px' }}>
                        {on ? 'ON' : 'BYPASS'}
                    </span>
                </div>
            </div>

            {showHelp && (
            <div style={{
                fontSize: '9px', color: '#8f9299', marginTop: '10px', lineHeight: 1.6,
                border: '1px solid #333840', borderRadius: '5px', background: '#1b1e23', padding: '8px 10px'
            }}>
                Not a warble — the sweep is kept far too shallow to hear as pitch. The
                two sides sweep in opposite directions and the wet copy is inverted
                across the pair, so it mostly cancels in mono and the ear reads what
                is left as width. 1 is a gentle shimmer, 4 is the deepest single
                button — and the buttons latch TOGETHER, which is where the twelve
                settings come from. 1+2 is the one to leave on and forget about; all
                four down is the one that stops being width and starts being an effect.
            </div>
            )}
        </div>
    );
};
