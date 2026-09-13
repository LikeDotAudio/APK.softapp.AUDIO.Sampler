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

// The VARC — the alphanumeric remote that drives both reverb machines. It
// replaces the two dropdowns the reverb strips used to carry, and it is the
// only place the machines are edited.
//
// The interaction is the one from the manual, not a settings form: you do not
// pick "large" from a list, you walk the banks, load a numbered program, and
// then push the six sliders around until the room is the one you wanted. The
// numbers under the sliders are the machine telling you where you are.
//
// A and B select which of the two machines the remote is talking to, which is
// what MACH does on the real unit — it happens to map exactly onto the two
// reverb buses this app has.

// The display runs in the app's own orange rather than the LED red the real
// 444V used. Every other lit thing in this app is --accent, and one panel
// glowing a different colour read as a bug rather than as period detail.
const VARC_LED = 'var(--accent)';             // === --accent
const VARC_LED_DIM = 'var(--accent-s55)';
const VARC_LED_HOT = 'var(--accent-t40)';   // the ovld pair, a brighter cast of the same
const VARC_LED_OFF = 'var(--accent-s85)';   // an unlit segment behind the filter
const VARC_CREAM = '#e9e3d1';
const VARC_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const VARC_METER_GAIN = 2;              // display-only lift on the metered signal

// The display glass. Properly black — these are LED segments behind a dark
// filter, not a backlit LCD, so everything that is not lit is unlit, and the
// only colour on the panel comes from the segments themselves.
const VARC_GLASS = {
    background: 'radial-gradient(ellipse at 50% 0%, #14100e 0%, #060505 55%, #000 100%)',
    border: '1px solid #6f6857',
    borderRadius: '3px',
    boxShadow: 'inset 0 2px 7px rgba(0,0,0,0.95), inset 0 0 14px rgba(var(--accent-rgb),0.06)',
};

/**
 * One run of segments. The bloom is two shadows on purpose: a tight bright one
 * that reads as the segment itself, and a wide dim one that reads as the light
 * spilling into the filter around it. A single blur gives you a fuzzy letter
 * instead — the halo has to be much wider than the glyph to look like glow
 * rather than like something out of focus.
 */
const Led = ({ children, size = 11, dim = false, glow = true, style }) => (
    <span style={{
        fontFamily: VARC_MONO, fontSize: `${size}px`, fontWeight: '700',
        color: dim ? VARC_LED_DIM : VARC_LED,
        textShadow: !glow ? 'none'
            : dim
                // An unloaded/browsing line still emits — just faintly, the way
                // a half-driven segment does. Killing its glow entirely made it
                // read as printed ink rather than as a dimmer light.
                ? '0 0 4px rgba(var(--accent-rgb),0.32)'
                : '0 0 5px rgba(var(--accent-rgb),0.95), 0 0 13px rgba(var(--accent-rgb),0.55), 0 0 26px rgba(var(--accent-rgb),0.28)',
        letterSpacing: '.5px', whiteSpace: 'pre', ...style
    }}>{children}</span>
);

// A moulded keycap. `lit` is the pressed/engaged state — these are real
// switches on the original, so they go down rather than change colour.
const Key = ({ label, onClick, onDown, onUp, lit, title, wide, tone = 'cream', size = 7.5 }) => {
    const face = tone === 'blue'
        ? (lit ? '#5b7fa8' : '#8fb0d0')
        : (lit ? '#c9c2ac' : VARC_CREAM);
    return (
        <button
            onClick={onClick}
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerLeave={onUp ? (e) => { if (e.buttons) onUp(e); } : undefined}
            title={title}
            style={{
                flex: wide ? 1 : '0 0 auto',
                minWidth: 0, padding: '4px 2px', borderRadius: '2px', cursor: 'pointer',
                background: lit
                    ? `linear-gradient(to bottom, ${face} 0%, #9d967f 100%)`
                    : `linear-gradient(to bottom, #fbf7ea 0%, ${face} 55%, #b8b19a 100%)`,
                border: '1px solid #8d8672',
                boxShadow: lit
                    ? 'inset 0 2px 4px rgba(0,0,0,0.45)'
                    : '0 1px 0 #8d8672, 0 2px 3px rgba(0,0,0,0.35)',
                transform: lit ? 'translateY(1px)' : 'none',
                color: '#2f2a1e', fontSize: `${size}px`, fontWeight: '700',
                fontFamily: 'system-ui, sans-serif', letterSpacing: '.2px', lineHeight: 1.15,
                transition: 'transform .05s, box-shadow .05s',
            }}
        >
            {label}
        </button>
    );
};

/**
 * One of the six control sliders. Absolute rather than relative dragging: this
 * is a fader with a real position on a real scale, so grabbing halfway up the
 * slot should put it halfway up, exactly as your hand expects from the picture.
 */
const VarcSlider = ({ value, onChange, height = 224, label, display }) => {
    const trackRef = React.useRef(null);
    const CAP_H = 13;
    const readout = window.useOaReadout({
        label, display: display != null ? display : Math.round(value * 100),
        pct: Math.max(0, Math.min(1, value)) * 100, color: 'var(--accent)',
    });

    const fromEvent = (e) => {
        const el = trackRef.current;
        if (!el) return value;
        const r = el.getBoundingClientRect();
        const usable = r.height - CAP_H;
        const y = e.clientY - r.top - CAP_H / 2;
        return Math.max(0, Math.min(1, 1 - y / usable));
    };
    const onDown = (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        readout.begin(e);
        onChange(fromEvent(e));
        e.preventDefault();
    };
    const onMove = (e) => { if (e.buttons) onChange(fromEvent(e)); };

    return (
        <div
            ref={trackRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onWheel={(e) => { e.preventDefault(); onChange(Math.max(0, Math.min(1, value + (e.deltaY < 0 ? 0.02 : -0.02)))); }}
            style={{
                position: 'relative', width: '26px', height: `${height}px`,
                cursor: 'ns-resize', touchAction: 'none', display: 'flex', justifyContent: 'center'
            }}
        >
            {/* the slot */}
            <div style={{
                width: '5px', height: '100%', borderRadius: '3px',
                background: 'linear-gradient(to right, #3c372c, #6d6759 40%, #322e25)',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.7)'
            }} />
            {/* the cap */}
            <div style={{
                position: 'absolute', left: 0, right: 0,
                top: `${(1 - value) * (height - CAP_H)}px`, height: `${CAP_H}px`,
                borderRadius: '2px', pointerEvents: 'none',
                background: 'linear-gradient(to bottom, #fbf8ec 0%, #ded7c0 45%, #a49d87 100%)',
                border: '1px solid #7d7663',
                boxShadow: '0 1px 2px rgba(0,0,0,0.5)'
            }}>
                <i style={{
                    display: 'block', position: 'absolute', left: '2px', right: '2px',
                    top: '5px', height: '1px', background: '#8a8371'
                }} />
            </div>
        </div>
    );
};

/**
 * The output meter. Dot columns rather than a bar, because that is what the
 * original's plasma display does, and because discrete steps are far easier to
 * read at a glance than a smoothly sliding bar.
 *
 * It takes the right half of the glass and its full height. Crammed into a
 * corner at 3px a dot it was decoration; at this size the two rows are the
 * second thing on the panel you can actually read from across the room.
 */
const VarcMeter = ({ dotsRef }) => {
    const N = 14;
    const LABEL_W = 12;                 // the L/R column, reserved on the legend too
    const row = (ch) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {/* space-between rather than a fixed gap: the dots spread to whatever
                width the display gives them instead of huddling at one end. */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between' }}>
                {Array.from({ length: N }, (_, i) => (
                    <i key={i}
                       ref={(el) => { const s = dotsRef.current[ch] || (dotsRef.current[ch] = []); s[i] = el; }}
                       style={{
                           width: '6px', height: '6px', borderRadius: '50%',
                           background: VARC_LED_OFF, display: 'block', flexShrink: 0
                       }} />
                ))}
            </div>
            <Led size={7} dim style={{ width: `${LABEL_W - 3}px`, textAlign: 'right' }}>{ch === 0 ? 'L' : 'R'}</Led>
        </div>
    );
    return (
        <div style={{
            flex: '0 0 50%', minWidth: 0,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}>
            {row(0)}
            <Led size={6} dim glow={false} style={{
                letterSpacing: '0', textAlign: 'center', marginRight: `${LABEL_W}px`
            }}>-34 18 12 6  0  6 +12 ovld dB</Led>
            {row(1)}
        </div>
    );
};

window.VarcRemote = ({ u, onClose, oaPopped, oaHosted }) => {
    const [active, setActive] = React.useState(u || 0);
    const [, force] = React.useReducer((n) => n + 1, 0);
    React.useEffect(() => {
        const on = () => force();
        window.addEventListener('oa-reverb-changed', on);
        window.addEventListener('oa-reverb-rebuilt', on);
        return () => {
            window.removeEventListener('oa-reverb-changed', on);
            window.removeEventListener('oa-reverb-rebuilt', on);
        };
    }, []);

    // Armed for a take: nothing is being sent to either machine, so the remote
    // greys and stops taking keys that nothing would hear.
    const bypassed = window.useOaFxBypass();
    const veil = window.oaBypassVeil(bypassed);

    const unit = window.oaReverbUnit(active);
    const meta = window.OA_REVERB_UNITS[active];

    // The remote can be switched between machines from its own front, so the
    // window is named after the one it is DRIVING, not the one it was opened on.
    const panel = window.useOaPanel({
        id: `varc-${u || 0}`, title: `${meta.name} — VARC 444`, copy: oaPopped, hosted: oaHosted,
        render: () => <window.VarcRemote u={u} onClose={onClose} oaPopped />,
    });

    const page = unit.page || 0;
    const params = window.oaReverbPageParams(page);

    // The bank currently being BROWSED, which is not necessarily the bank the
    // running program came from — on the real machine the bank number flashes
    // while you scroll and only commits when you load a program from it.
    const [bankSel, setBankSel] = React.useState(unit.bank);
    React.useEffect(() => { setBankSel(window.oaReverbUnit(active).bank); }, [active]);
    const browsing = bankSel !== unit.bank;

    // A transient line in the display: "SETUP LOADED", or the full name of
    // whichever slider display key was last pressed.
    const [msg, setMsg] = React.useState(null);
    const msgTimer = React.useRef(null);
    const flash = (text, ms = 1400) => {
        setMsg(text);
        if (msgTimer.current) clearTimeout(msgTimer.current);
        msgTimer.current = setTimeout(() => setMsg(null), ms);
    };
    React.useEffect(() => () => { if (msgTimer.current) clearTimeout(msgTimer.current); }, []);

    const [showHelp, setShowHelp] = React.useState(false);
    const [held, setHeld] = React.useState(null);      // which key is physically down
    const [dispHold, setDispHold] = React.useState(false);
    const [ioMeter, setIoMeter] = React.useState('OUT');
    const [wetSolo, setWetSolo] = React.useState(false);

    const bank = window.oaReverbBank(bankSel);
    const progName = window.oaReverbProgram(unit.bank, unit.prog).name;
    const runningBank = window.oaReverbBank(unit.bank);

    // ---- the meter ---------------------------------------------------------
    // Both sides come off the reverb's telemetry frame. The VARC used to find
    // the bus in ctx.__oaReverbs and read its two analysers itself — which meant
    // opening this panel doubled the metering work already being done for the
    // Mixer's return strip, on the very same nodes.
    //
    // HOLD is honoured here rather than at the source: the frame keeps being
    // filled for everyone else, and this display simply stops reading it. That
    // is what hold means on the real machine — the needle stops, the room does
    // not.
    const dotsRef = React.useRef({});
    const heldPeak = React.useRef([0, 0]);

    window.useOaFrame('reverb', active, (frame, L) => {
        if (dispHold) return;
        for (let ch = 0; ch < 2; ch++) {
            const els = dotsRef.current[ch];
            if (!els) continue;
            heldPeak.current[ch] = frame[ch === 0 ? L.PEAK_L : L.PEAK_R];
            // -34dB at the left end up to +12 at the right, which is the scale
            // printed between the two rows. The return feeding this is a reverb
            // tail — quiet by nature — so it is shown at twice the amplitude it
            // arrives at, which puts a typical tail in the middle of the scale
            // instead of flickering at the left end. Display only: nothing
            // downstream of here hears the difference.
            const p = heldPeak.current[ch];
            const db = p > 1e-5 ? 20 * Math.log10(p * VARC_METER_GAIN) : -80;
            const lit = Math.round(((db + 34) / 46) * els.length);
            els.forEach((el, i) => {
                if (!el) return;
                const on = i < lit;
                const hot = i >= els.length - 2;      // the last two are the ovld pair
                el.style.background = on ? (hot ? VARC_LED_HOT : VARC_LED) : VARC_LED_OFF;
                // A lit dot blooms into the filter exactly like the text does;
                // an unlit one is a dark hole and casts nothing.
                el.style.boxShadow = on
                    ? `0 0 4px ${hot ? 'rgba(var(--accent-rgb),0.95)' : 'rgba(var(--accent-rgb),0.9)'}, 0 0 9px rgba(var(--accent-rgb),0.5)`
                    : 'none';
            });
        }
    });

    // ---- actions -----------------------------------------------------------
    const loadProgram = (b, p) => {
        const bk = window.oaReverbBank(b);
        if (p < 0 || p >= bk.programs.length) { flash('NO PROGRAM'); return; }
        window.oaLoadReverbProgram(active, b, p);
        setBankSel(b);
        flash('SETUP LOADED');
    };
    // The keypad loads program N of whichever bank is on screen. "0" is the
    // tenth key, as on the original.
    const keypad = (n) => loadProgram(bankSel, (n === 0 ? 9 : n - 1));

    const stepBank = (d) => {
        const n = window.OA_REVERB_BANKS.length;
        setBankSel((b) => (b + d + n) % n);
    };
    const stepProgram = (d) => {
        const bk = window.oaReverbBank(bankSel);
        // Stepping from a browsed bank starts at its first program rather than
        // carrying the index across from a bank that may be a different length.
        const from = browsing ? (d > 0 ? -1 : bk.programs.length) : unit.prog;
        loadProgram(bankSel, (from + d + bk.programs.length) % bk.programs.length);
    };
    const stepPage = (d) => {
        window.oaSetReverb(active, 'page', (page + d + window.OA_REVERB_PAGES) % window.OA_REVERB_PAGES);
    };

    const setParam = (p, norm) => {
        const v = p.min + norm * (p.max - p.min);
        // Snap to the parameter's own step so the readout lands on real values
        // rather than 2.06499999.
        const snapped = Math.round(v / p.step) * p.step;
        window.oaSetReverb(active, p.key, snapped);
    };
    const normOf = (p) => (unit[p.key] - p.min) / ((p.max - p.min) || 1);

    const nudgeRet = (d) => window.oaSetReverb(active, 'ret', Math.max(0, Math.min(1, unit.ret + d)));

    const toggleSolo = () => {
        // Wet solo: silence the OTHER machine so you can hear this one's tail
        // on its own. Restoring means simply lifting its standby again.
        const next = !wetSolo;
        setWetSolo(next);
        for (let i = 0; i < window.OA_REVERB_COUNT; i++) {
            if (i !== active) window.oaSetReverbStandby(i, next);
        }
        flash(next ? 'WET SOLO' : 'SOLO OFF');
    };

    // ---- display lines -----------------------------------------------------
    const pad2 = (n) => String(n).padStart(2, ' ');
    const line1 = `▾${pad2(unit.prog + 1)} ${progName}${unit.edited ? ' *' : ''}`;
    const line2 = `▾${pad2(bankSel + 1)} ${bank.name}`;
    const line3 = msg || `PAGE ${page + 1}`;

    const swatch = { display: 'flex', gap: '3px' };

    return panel.frame(
        <div {...panel.frameProps({
            position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--panel)', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.7)', zIndex: 1200,
            // The real remote is a tall thing you hold in one hand, not a wide
            // thing you set down. Narrowing the plate and letting the sliders
            // have the height back is what makes it read as a remote — the
            // widest line in the display still clears the meter at this width.
            padding: '10px 12px', width: 'min(340px, 96vw)', maxHeight: '88vh', overflowY: 'auto'
        })}>
            <div {...panel.handle({ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' })}>
                <span style={{ fontSize: '12px', color: meta.color, fontWeight: 'bold', letterSpacing: '1px' }}>
                    {meta.name} — VARC 444
                </span>
                {unit.standby && (
                    <span style={{ fontSize: '9px', color: '#e5533d', fontWeight: '700' }}>STANDBY</span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    {panel.chrome && <window.SeqButton label={panel.popLabel} onClick={panel.togglePop}
                        title={panel.popTitle}
                        style={{ padding: '4px 10px' }} />}
                    <window.SeqButton
                        label={showHelp ? '✖ Help' : '? Help'}
                        onClick={() => setShowHelp(!showHelp)}
                        active={showHelp}
                        title="How the banks, programs and pages work"
                        style={{ padding: '4px 10px' }} />
                    {bypassed && <window.OaOutOfCircuit />}
                    {panel.chrome && <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />}
                </div>
            </div>

            {/* Folded away by default. The remote is tall enough already, and
                once you know how the banks work you never need this again. */}
            {showHelp && (
                <div style={{
                    fontSize: '9px', color: '#9aa3ae', lineHeight: 1.55, marginBottom: '9px',
                    background: '#1b1f26', border: '1px solid #333', borderRadius: '5px', padding: '8px 10px'
                }}>
                    Walk the banks with ◀ BANK ▶ — the bank line dims while you are browsing and
                    nothing has changed yet. Press a numeric key to load that program from it, or
                    step with ◀ PROGRAM ▶. The six sliders edit whatever the program loaded; a
                    <Led size={9} style={{ margin: '0 3px' }}>*</Led> beside the name means you have
                    moved it off the stored settings. ◀ PAGE ▶ swaps the sliders for the other six
                    parameters. Press a slider's key to spell its full name out in the display.
                    SHAPE draws the curve of the reverb's buildup and SPREAD stretches it —
                    together they are why a big hall sounds big rather than merely long.
                </div>
            )}

            {/* ---------------- the box ---------------- */}
            <div style={{
                background: 'linear-gradient(to bottom, #f2ecda 0%, #ded7c1 40%, #c9c2ab 100%)',
                border: '1px solid #8d8672', borderRadius: '12px',
                boxShadow: '0 3px 10px rgba(0,0,0,0.5), inset 0 1px 0 #fffdf4',
                padding: '10px 10px 12px', ...veil
            }}>

                {/* Top display: program, bank, page — and the output meter. */}
                <div style={{
                    ...VARC_GLASS,
                    padding: '7px 9px', marginBottom: '10px',
                    // stretch, so the meter can take the full height of the glass
                    // rather than sitting at the top of it.
                    display: 'flex', gap: '8px', alignItems: 'stretch'
                }}>
                    {/* The text now shares the glass with a meter that takes half
                        of it, so the lines are set smaller and tighter: the
                        longest program name in the banks is MEDIUM RAND HALL, and
                        at 9px it still clears the meter without being clipped. */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'space-between' }}>
                        <Led size={9} style={{ letterSpacing: '.2px' }}>{line1}</Led>
                        {/* The browsed bank flashes until a program is loaded from
                            it, which is the machine saying "nothing has changed
                            yet". Dimming is this display's version of flashing. */}
                        <Led size={9} dim={browsing} style={{ letterSpacing: '.2px' }}>{line2}</Led>
                        <Led size={8.5} style={{ letterSpacing: '.2px' }}>{line3}</Led>
                    </div>
                    <VarcMeter dotsRef={dotsRef} />
                </div>

                {/* Wordmark, machine select, keypad */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                        <div style={{
                            fontSize: '13px', fontWeight: '700', letterSpacing: '.5px',
                            color: '#2f2a1e', fontFamily: 'Georgia, serif'
                        }}>
                            VARC 444
                        </div>
                        <div style={swatch}>
                            {window.OA_REVERB_UNITS.map((m, i) => (
                                <Key key={i} label={i === 0 ? 'A' : 'B'} tone="blue" size={9}
                                     lit={active === i}
                                     title={`Control ${m.name}`}
                                     onClick={() => { setActive(i); flash(m.name); }} />
                            ))}
                        </div>
                    </div>
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px' }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => {
                            const exists = (n === 0 ? 9 : n - 1) < bank.programs.length;
                            return (
                                <Key key={n} label={String(n)} size={9}
                                     title={exists
                                        ? `Load ${bank.programs[n === 0 ? 9 : n - 1].name}`
                                        : 'No program on this key in this bank'}
                                     lit={!browsing && unit.prog === (n === 0 ? 9 : n - 1)}
                                     onClick={() => keypad(n)} />
                            );
                        })}
                    </div>
                </div>

                {/* Function row. Every one of these does something — MUTE is
                    momentary, the rest latch. */}
                <div style={{ display: 'flex', gap: '3px', marginBottom: '9px' }}>
                    <Key wide label="MUTE" lit={held === 'mute'}
                         title="Silence this machine's return for as long as the key is held"
                         onDown={() => { setHeld('mute'); window.oaMuteReverb(active, true); }}
                         onUp={() => { setHeld(null); window.oaMuteReverb(active, false); }} />
                    <Key wide label={<span>AUX<br />OUTS</span>} lit={false}
                         title="Where this machine's return is thrown — set from the tape panels"
                         onClick={() => flash('SEE TAPE')} />
                    <Key wide label={<span>I/O<br />METER</span>} lit={ioMeter === 'IN'}
                         title="Meter the machine's input instead of its output"
                         onClick={() => { const n = ioMeter === 'OUT' ? 'IN' : 'OUT'; setIoMeter(n); flash('METER ' + n); }} />
                    <Key wide label={<span>DISP<br />HOLD</span>} lit={dispHold}
                         title="Freeze the meter where it stands"
                         onClick={() => { setDispHold(!dispHold); flash(!dispHold ? 'DISP HELD' : 'DISP LIVE'); }} />
                    <Key wide label={<span>MIX<br />&lt;DRY</span>}
                         title="Less of this machine in the mix"
                         onClick={() => { nudgeRet(-0.05); flash('RET ' + Math.round(Math.max(0, unit.ret - 0.05) * 100)); }} />
                    <Key wide label={<span>MIX<br />WET&gt;</span>}
                         title="More of this machine in the mix"
                         onClick={() => { nudgeRet(0.05); flash('RET ' + Math.round(Math.min(1, unit.ret + 0.05) * 100)); }} />
                    <Key wide label={<span>WET<br />SOLO</span>} lit={wetSolo}
                         title="Silence the other machine so this one is alone"
                         onClick={toggleSolo} />
                    <Key wide label="POWER" lit={!unit.standby}
                         title="Take this machine in or out of circuit"
                         onClick={() => { window.oaSetReverbStandby(active, !unit.standby); flash(unit.standby ? 'ON LINE' : 'STANDBY'); }} />
                </div>

                {/* The parameter readout: six labels over six values, which is
                    the row of numbers on the front of the real remote. */}
                <div style={{
                    ...VARC_GLASS,
                    padding: '6px 6px', marginBottom: '8px',
                    display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '2px', textAlign: 'center'
                }}>
                    {params.map((p) => (
                        <Led key={p.key} size={10} style={{ textAlign: 'center' }}>{p.short}</Led>
                    ))}
                    {params.map((p) => (
                        <Led key={p.key + 'v'} size={9} style={{ textAlign: 'center' }}>
                            {p.fmt(unit[p.key])}
                        </Led>
                    ))}
                </div>

                {/* The six control sliders, on a hairline scale. */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
                    justifyItems: 'center', gap: '2px', marginBottom: '6px',
                    padding: '4px 2px', borderRadius: '3px',
                    background: 'linear-gradient(to bottom, #d9d2bb, #cdc6af)',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.25)'
                }}>
                    {params.map((p) => (
                        <VarcSlider key={p.key} value={normOf(p)} onChange={(n) => setParam(p, n)}
                                    label={p.label} display={p.fmt(unit[p.key])} />
                    ))}
                </div>

                {/* Slider display keys: press one and the display spells out what
                    that slider actually is. On the original this is the only way
                    to see a parameter's full name. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '3px', marginBottom: '10px' }}>
                    {params.map((p) => (
                        <Key key={p.key} label={p.short} size={7}
                             title={p.name + ' — ' + p.hint}
                             onClick={() => flash(`${p.name.toUpperCase()} ${p.fmt(unit[p.key])}`, 2200)} />
                    ))}
                </div>

                {/* The three rockers along the bottom edge. */}
                <div style={{ display: 'flex', gap: '6px' }}>
                    {[
                        { label: 'BANK', dec: () => stepBank(-1), inc: () => stepBank(1) },
                        { label: 'PROGRAM', dec: () => stepProgram(-1), inc: () => stepProgram(1) },
                        { label: 'PAGE', dec: () => stepPage(-1), inc: () => stepPage(1) },
                    ].map((r) => (
                        <div key={r.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ display: 'flex', gap: '2px' }}>
                                <Key wide label="◀" size={8} onClick={r.dec} title={`Previous ${r.label.toLowerCase()}`} />
                                <Key wide label="▶" size={8} onClick={r.inc} title={`Next ${r.label.toLowerCase()}`} />
                            </div>
                            <div style={{
                                textAlign: 'center', fontSize: '6.5px', fontWeight: '700',
                                letterSpacing: '1px', color: '#5c5644'
                            }}>
                                &lt; {r.label} &gt;
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
