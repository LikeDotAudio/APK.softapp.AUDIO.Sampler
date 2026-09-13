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

// The BUSS COMPRESSOR panel — the centre section of the desk, the one unit in
// this rack that everything else eventually goes through.
//
// Laid out as the hardware is: a moving-coil GAIN REDUCTION meter across the
// top, then three rows of three — a large knob at each side and a small one
// between them — and the three latching buttons along the bottom. The switches
// The later revisions added to that faceplate (F/B, LOW THD, Σ S/C, the mix law and the 44K
// intensity) sit in a column beside the plate rather than crowded onto it,
// because they are mode switches rather than things a hand reaches for mid-mix.
//
// The meter is why this panel exists. Threshold and ratio are numbers you could
// have typed; how many dB the mix is actually giving up, and whether the needle
// is breathing with the music or clamped flat against the stop, is only ever a
// picture.

// Where each engraved mark sits along the meter's travel. Evenly spaced, 0 at
// the left and 20 at the right, so the needle climbs to the right as the
// compressor works harder — the way the plate this is drawn from reads.
const GR_MARKS = [0, 4, 8, 12, 16, 20];
const GR_FULL = 20;

// ---------------------------------------------------------------------------
// A panel knob. Black skirt, brushed cap, white pointer, with the scale engraved
// into the faceplate around it — the numbers spread evenly across 270° of
// travel, low end first.
// ---------------------------------------------------------------------------
const BussKnob = ({ value, min, max, defaultVal, ticks, size = 54, onChange, title, label, display }) => {
    // Room outside the knob for the collar. The engraved numbers sit past the
    // tick marks and a three-character label is ~14px wide, so the box has to
    // clear the knob by more than the label radius or the end stops get cropped.
    const S = size + 34;
    const cx = S / 2, cy = S / 2;
    const bodyR = size / 2;
    const [uid] = React.useState(() => 'bk' + Math.random().toString(36).slice(2, 8));

    const rad = (d) => d * Math.PI / 180;
    const pt = (r, a) => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];

    // A knob with no writer is a READOUT. The adapter marks a deprecated
    // parameter unwritable and hands back a `set` that does nothing; without
    // this, the knob still turned, still reported, and was heard by nothing.
    // Same guard, same three lines of styling, as RackKnob in CompressorEditor.
    const live = typeof onChange === 'function';

    const clampV = (v) => Math.max(min, Math.min(max, v));
    const cur = clampV(value);
    const angle = (((cur - min) / ((max - min) || 1)) * 2 - 1) * 135;

    // Drag vertically, wheel to nudge, alt-click to reset — the same gesture set
    // as every other control in the mixer, so the hands do not relearn.
    const readout = window.useOaReadout({
        label, color: window.OA_BUSS_COLOR,
        display: display != null ? display : cur,
        pct: ((cur - min) / ((max - min) || 1)) * 100,
    });

    const onPointerDown = (e) => {
        if (!live) return;
        if (e.altKey) { onChange(defaultVal); return; }
        readout.begin(e);
        const startY = e.clientY;
        const startV = cur;
        e.target.setPointerCapture(e.pointerId);
        const move = (em) => onChange(clampV(startV + ((startY - em.clientY) / 150) * (max - min)));
        const up = (eu) => {
            e.target.removeEventListener('pointermove', move);
            e.target.removeEventListener('pointerup', up);
            e.target.removeEventListener('pointercancel', up);
            try { e.target.releasePointerCapture(eu.pointerId); } catch (x) {}
        };
        e.target.addEventListener('pointermove', move);
        e.target.addEventListener('pointerup', up);
        e.target.addEventListener('pointercancel', up);
        e.preventDefault();
    };
    const onWheel = (e) => {
        if (!live) return;
        e.preventDefault();
        onChange(clampV(cur + (e.deltaY < 0 ? 1 : -1) * (max - min) / 50));
    };

    const marks = [];
    (ticks || []).forEach((label, i) => {
        const a = -135 + (i / Math.max(1, ticks.length - 1)) * 270;
        const [x1, y1] = pt(bodyR + 3, a);
        const [x2, y2] = pt(bodyR + 6, a);
        const [lx, ly] = pt(bodyR + 13, a);
        marks.push(
            <React.Fragment key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b9bec6" strokeWidth={1.1} strokeLinecap="round" />
                <text x={lx} y={ly + 2.6} fill="#cfd4da" fontSize="6.5" fontWeight="700"
                      textAnchor="middle" style={{ userSelect: 'none' }}>{label}</text>
            </React.Fragment>
        );
    });

    // The knurled skirt. Fine radial nicks around the rim — exactly the detail
    // that stops a filled circle from reading as a sticker.
    const knurl = [];
    for (let i = 0; i < 40; i++) {
        const [x1, y1] = pt(bodyR - 0.5, i * 9);
        const [x2, y2] = pt(bodyR - 3.5, i * 9);
        knurl.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#050505" strokeWidth={0.9} opacity={0.5} />);
    }

    const [px1, py1] = pt(bodyR * 0.10, angle);
    const [px2, py2] = pt(bodyR * 0.94, angle);

    return (
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}
             role="img" aria-label={title}
             style={{
                 display: 'block', touchAction: 'none',
                 cursor: live ? 'ns-resize' : 'default',
                 filter: live ? undefined : 'grayscale(1) brightness(0.6)',
                 opacity: live ? undefined : 0.7,
             }}
             onPointerDown={onPointerDown} onWheel={onWheel}>
            <defs>
                <radialGradient id={uid} cx="36%" cy="24%" r="82%">
                    <stop offset="0%" stopColor="#54565c" />
                    <stop offset="45%" stopColor="#2a2c31" />
                    <stop offset="100%" stopColor="#0a0a0c" />
                </radialGradient>
                <linearGradient id={uid + 'c'} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e9ecf1" />
                    <stop offset="48%" stopColor="#aeb4bd" />
                    <stop offset="100%" stopColor="#5f646c" />
                </linearGradient>
            </defs>
            {marks}
            <circle cx={cx} cy={cy + 1.5} r={bodyR} fill="#00000066" />
            <circle cx={cx} cy={cy} r={bodyR} fill={`url(#${uid})`} stroke="#000" strokeWidth={1} />
            {knurl}
            {/* The brushed cap on top of the skirt, and the pointer cut across
                it — on this unit the line runs right over the cap rather than
                stopping at its edge, which is what makes the setting readable
                from across a room. */}
            <circle cx={cx} cy={cy} r={bodyR * 0.72} fill={`url(#${uid}c)`} stroke="#0a0a0a" strokeWidth={0.8} />
            <line x1={px1} y1={py1} x2={px2} y2={py2} stroke="#15171a" strokeWidth={2.4} strokeLinecap="round" />
            <line x1={px1} y1={py1} x2={px2} y2={py2} stroke="#f6f8fa" strokeWidth={1.1} strokeLinecap="round" />
        </svg>
    );
};

// A word engraved into the faceplate: pale ink with a hairline shadow under it,
// which is how a filled letter sits in dark paint.
const Cut = ({ children, size = 8, style }) => (
    <div style={{
        fontSize: `${size}px`, fontWeight: '700', letterSpacing: '1.5px', color: '#e3e7ec',
        textShadow: '0 1px 0 rgba(0,0,0,0.85)', whiteSpace: 'nowrap', ...style
    }}>
        {children}
    </div>
);

// One of the three big latching buttons along the bottom of the plate. Lit is
// in; unlit sits proud of its well.
const BigButton = ({ label, active, lit, onPress, title, disabled }) => (
    <button
        onClick={onPress}
        title={title}
        disabled={disabled}
        style={{
            flex: '1 1 0', minWidth: 0, height: '34px', borderRadius: '3px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.4 : 1,
            background: active
                ? `linear-gradient(to bottom, ${lit} 0%, ${lit} 55%, #00000044 100%)`
                : 'linear-gradient(to bottom, #33373d 0%, #22252a 60%, #15171a 100%)',
            border: '1px solid #0a0b0d',
            boxShadow: active
                ? `inset 0 2px 5px rgba(0,0,0,0.45), 0 0 10px ${lit}66`
                : '0 2px 0 #0a0b0d, 0 3px 5px rgba(0,0,0,0.55)',
            transform: active ? 'translateY(2px)' : 'none',
            padding: 0, fontSize: '9px', fontWeight: '800', letterSpacing: '1.4px',
            color: active ? '#14171a' : '#aeb4bd',
            transition: 'transform .06s, box-shadow .06s',
        }}
    >
        {label}
    </button>
);

// A small mode switch, for the row of extra options beside the plate.
const ModeSwitch = ({ label, active, onPress, title, disabled }) => (
    <button
        onClick={onPress}
        title={title}
        disabled={disabled}
        style={{
            width: '100%', padding: '5px 4px', borderRadius: '3px', textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.35 : 1,
            border: `1px solid ${active && !disabled ? window.OA_BUSS_COLOR : '#3a3f47'}`,
            background: active && !disabled ? '#16323c' : '#22252a',
            color: active && !disabled ? window.OA_BUSS_COLOR : '#8d949d',
            fontSize: '8.5px', fontWeight: '700', letterSpacing: '1px',
        }}
    >
        {label}
    </button>
);

const bScrew = (
    <div style={{
        width: '9px', height: '9px', borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #d3d7dc, #71767e 60%, #2f3237)',
        boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.6), 0 1px 1px rgba(0,0,0,0.5)',
        position: 'relative', flex: '0 0 auto'
    }}>
        <i style={{
            position: 'absolute', left: '1px', right: '1px', top: '4px', height: '1px',
            background: '#25282c', display: 'block'
        }}></i>
    </div>
);

/**
 * The gain-reduction meter. A cream moving-coil face behind glass, reading dB
 * of compression left to right.
 *
 * `posRef` is handed straight to the animation loop, which writes a transform
 * onto it sixty times a second. Routing a needle angle through React state
 * would re-render the whole faceplate for every frame of a moving needle.
 */
// A BLACK-FACED movement, everything printed on it in white.
//
// The cream-and-black VU on the channel limiter is the older instrument — a
// painted card lit from in front. This one is the later kind: a dark face with
// the scale screened on in white and a lamp behind it, which is what the
// gain-reduction meters in a console centre section are. It also stops the one
// bright rectangle on the plate from being the thing the eye lands on first;
// what should catch the eye here is the NEEDLE, and a white needle on black is
// the highest contrast either layout can offer it.
//
// One colour for every mark, label and pointer, so the face cannot drift into
// two whites that are nearly but not quite the same.
const FACE_INK = '#ffffff';

const GrMeter = ({ posRef }) => {
    const W = 250, H = 106;
    const pivotX = W / 2, pivotY = H * 1.78;
    // The needle stops just past the scale rather than running on to the edge of
    // the glass — a pointer that overshoots its own marks reads as pointing
    // somewhere between them.
    const scaleR = H * 1.36;
    const needleR = scaleR + 3;
    const A0 = -29, A1 = 29;

    const rad = (d) => d * Math.PI / 180;
    const pt = (r, a) => [pivotX + r * Math.sin(rad(a)), pivotY - r * Math.cos(rad(a))];

    const marks = GR_MARKS.map((db) => {
        const a = A0 + (db / GR_FULL) * (A1 - A0);
        const [x1, y1] = pt(scaleR, a);
        const [x2, y2] = pt(scaleR - 6, a);
        const [lx, ly] = pt(scaleR - 15, a);
        return (
            <React.Fragment key={db}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={FACE_INK} strokeWidth={1.3} />
                <text x={lx} y={ly + 3} fill={FACE_INK} fontSize="8" fontWeight="700" textAnchor="middle">{db}</text>
            </React.Fragment>
        );
    });

    // Halfway ticks, unlabelled — a scale with only six marks on it reads as a
    // diagram rather than an instrument.
    const minor = [2, 6, 10, 14, 18].map((db) => {
        const a = A0 + (db / GR_FULL) * (A1 - A0);
        const [x1, y1] = pt(scaleR, a);
        const [x2, y2] = pt(scaleR - 3.5, a);
        return <line key={db} x1={x1} y1={y1} x2={x2} y2={y2} stroke={FACE_INK} strokeWidth={0.8} />;
    });

    const arcPath = (a0, a1) => {
        const [x0, y0] = pt(scaleR, a0), [x1, y1] = pt(scaleR, a1);
        return `M ${x0} ${y0} A ${scaleR} ${scaleR} 0 0 1 ${x1} ${y1}`;
    };

    return (
        <div style={{
            // A LIGHTER bezel than the face it holds. It used to be near-black
            // around a cream card, which needed no help; around a black card the
            // same frame disappears into it and the meter reads as a smudge
            // rather than as glass set into a plate. Machined aluminium, lit from
            // the top, with the glass sunk behind it.
            padding: '5px', borderRadius: '3px', maxWidth: '100%', minWidth: 0,
            background: 'linear-gradient(to bottom, #4a5058 0%, #333940 45%, #22262c 100%)',
            border: '1px solid #0a0b0d',
            boxShadow: 'inset 0 1px 0 #ffffff28, inset 0 -1px 0 #00000060, 0 2px 6px rgba(0,0,0,0.7)'
        }}>
            {/* Sized in percent as well as pixels: the meter is the widest thing
                on the plate, and on a small phone it has to give ground rather
                than push the faceplate off the line. */}
            <svg width="100%" height="auto" viewBox={`0 0 ${W} ${H}`}
                 style={{
                     display: 'block', borderRadius: '2px', width: `${W}px`, maxWidth: '100%', height: 'auto',
                     // The shadow the bezel casts onto the card behind it.
                     boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.9)',
                 }}>
                <defs>
                    {/* The face: near-black, lifted a little through the middle
                        so it reads as a curved card behind glass rather than a
                        hole cut in the plate. */}
                    <linearGradient id="bussface" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0a0b0c" />
                        <stop offset="55%" stopColor="#15171a" />
                        <stop offset="100%" stopColor="#060708" />
                    </linearGradient>
                    {/* The lamp behind the card. Kept faint: on a dark face its
                        job is to say the meter is LIT, not to grey the black. */}
                    <radialGradient id="bussglow" cx="50%" cy="16%" r="84%">
                        <stop offset="0%" stopColor="#cfe6f2" stopOpacity="0.16" />
                        <stop offset="100%" stopColor="#cfe6f2" stopOpacity="0" />
                    </radialGradient>
                </defs>
                <rect x={0} y={0} width={W} height={H} fill="url(#bussface)" />
                <rect x={0} y={0} width={W} height={H} fill="url(#bussglow)" />

                <path d={arcPath(A0, A1)} fill="none" stroke={FACE_INK} strokeWidth={1.3} />
                {marks}
                {minor}

                <text x={W / 2} y={H - 26} fill={FACE_INK} fontSize="9" fontWeight="700"
                      letterSpacing="1.5" textAnchor="middle">dB</text>
                <text x={W / 2} y={H - 14} fill={FACE_INK} fontSize="8" fontWeight="700"
                      letterSpacing="2" textAnchor="middle">COMPRESSION</text>

                {/* The needle, and the only thing on the face allowed to glow.
                    A moving-coil pointer catches the lamp along its whole length
                    and is the one mark on the card that is nearer the glass than
                    the print is. */}
                <g ref={posRef} style={{ transformOrigin: `${pivotX}px ${pivotY}px` }}>
                    <line x1={pivotX} y1={pivotY} x2={pivotX} y2={pivotY - needleR}
                          stroke={FACE_INK} strokeWidth={1.8} strokeLinecap="round"
                          style={{ filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.55))' }} />
                </g>
                {/* The hub the pointer is mounted on — machined metal, so it
                    stays lighter than the card without competing with the print. */}
                <circle cx={pivotX} cy={pivotY} r={10} fill="#3a3f45" />
                {/* Glass: a diagonal sheen across the face, weaker than it was on
                    the cream card — the same white veil over black would fog it. */}
                <path d={`M 0 ${H} L ${W * 0.52} 0 L ${W * 0.72} 0 L ${W * 0.2} ${H} Z`} fill="#ffffff" opacity="0.05" />
            </svg>
        </div>
    );
};

/**
 * The master bus compressor's front panel. There is only one, so unlike every
 * other editor in the rack it takes no channel index — `idx` is accepted and
 * ignored so the panel can be opened the same way as its neighbours.
 */
window.BussCompEditor = ({ onClose, oaPopped, oaHosted }) => {
    const [showHelp, setShowHelp] = React.useState(false);
    const panel = window.useOaPanel({
        id: 'buss', title: 'MASTER BUSS — COMPRESSOR', copy: oaPopped, hosted: oaHosted,
        render: () => <window.BussCompEditor onClose={onClose} oaPopped />,
    });
    const unit = window.useOaState('buss', 0);
    // Armed for a take: the bus is routed around the compressor entirely, so
    // the plate greys and stops taking knob moves that nothing would hear.
    const bypassed = window.useOaFxBypass();
    const veil = window.oaBypassVeil(bypassed);

    // Taken once, so ABORT goes back to how the mix sounded when the panel was
    // opened rather than to a factory setting.
    const opened = React.useRef(null);
    React.useEffect(() => {
        const u = window.oaPluginState('buss', 0);
        const snap = {};
        window.OA_BUSS_SWITCHES.forEach((s) => { snap[s.key] = u[s.key]; });
        window.oaPluginParams('buss', 0).forEach((p) => { snap[p.key] = u[p.key]; });
        opened.current = snap;
    }, []);

    // The native fallback cannot honour four of these switches, so ask once per
    // open whether the full DSP is behind the panel. Offering a control that
    // quietly does nothing is worse than not offering it.
    const [full, setFull] = React.useState(true);
    React.useEffect(() => { setFull(window.oaBussFullDsp()); }, []);

    // What controls this unit has, what their bounds are, and which of them may
    // be written — all from the adapter, so the desk in the room and the desk on
    // the network are the same desk. PLAN-18.12.
    const surface = window.useOaConsoleSurface('buss', 0);

    // The collapsed header's one-line reading. It took its formatters out of
    // `params` and its values out of `unit`; the descriptor already carries the
    // value formatted, so this is the same string with nothing hand-joined. A
    // key the schema drops degrades to '—' rather than throwing in a header.
    const summary = () => ['ratio', 'attack', 'release']
        .map((k) => (surface.by[k] ? surface.by[k].display : '—'))
        .join(' · ');
    const set = (k, v) => window.oaPluginSet('buss', 0, k, v);
    const on = !!unit.on;

    const dirty = !!opened.current && Object.keys(opened.current)
        .some((k) => opened.current[k] !== unit[k]);
    const abort = () => {
        if (!opened.current) return;
        Object.keys(opened.current).forEach((k) => set(k, opened.current[k]));
    };

    // ---- the needle, the readouts and the fade ---------------------------
    const needleRef = React.useRef(null);
    const grRef = React.useRef(null);
    const fadeRef = React.useRef(null);
    const shownRef = React.useRef(0);          // smoothed needle position, 0..1
    const A0 = -29, A1 = 29;

    // A fade is a transport action, not a stored setting, so its direction is
    // the panel's to remember. Its POSITION is not — that comes off the frame,
    // which is the only thing that knows where the ramp has got to.
    const [fading, setFading] = React.useState(
        () => (window.oaPluginFrame('buss', 0)[window.oaPluginLayout('buss').FADE] || 1) < 0.999,
    );

    window.useOaFrame('buss', 0, (frame, L) => {
        const gr = frame[L.GR];
        const target = frame[L.ACTIVE] ? Math.min(1, gr / GR_FULL) : 0;

        // A moving-coil movement has mass. Rising fast and falling slow is both
        // what the real one does and what makes the reading legible.
        shownRef.current += (target - shownRef.current) * (target > shownRef.current ? 0.35 : 0.12);
        if (needleRef.current) {
            needleRef.current.setAttribute('transform',
                `rotate(${(A0 + shownRef.current * (A1 - A0)).toFixed(2)} 125 188.68)`);
        }
        if (grRef.current) {
            grRef.current.textContent = gr > 0.05 ? '-' + gr.toFixed(1) + ' dB' : '0.0 dB';
        }
        if (fadeRef.current) {
            const f = frame[L.FADE];
            fadeRef.current.textContent = f > 0.999 ? '' : Math.round(f * 100) + '%';
        }
    });

    // ONE knob column, from ONE descriptor. This used to reach into `params`
    // for the bounds, into `unit` for the value, and assume everything it was
    // handed could be written. A key the plugin does not declare now draws
    // NOTHING rather than a knob with invented bounds, and a key the adapter
    // marks read-only — `mix`, deprecated so old presets still load — comes up
    // engraved, greyed and inert instead of turning and being heard by nothing.
    const knob = (key, size) => {
        const d = surface.by[key];
        if (!d) return null;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                <BussKnob
                    value={d.value} min={d.min} max={d.max} defaultVal={d.def}
                    ticks={d.ticks} size={size}
                    title={d.writable ? d.label : `${d.label} — read-only`}
                    onChange={d.writable ? d.set : undefined}
                    label={d.label.toUpperCase()} display={d.display}
                />
                <Cut size={7} style={{ letterSpacing: '1.8px' }}>{d.label.toUpperCase()}</Cut>
                <div style={{
                    fontSize: '8.5px', color: window.OA_BUSS_COLOR, fontWeight: '700',
                    fontVariantNumeric: 'tabular-nums', opacity: 0.9
                }}>
                    {d.display}
                </div>
            </div>
        );
    };

    // Three knobs to a row, the middle one smaller — except where a control has
    // been deprecated out of the faceplate, and the row is simply shorter.
    const row = (...keys) => (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-around',
            width: '100%', gap: '4px'
        }}>
            {keys.filter(Boolean).map((k, i) => (
                <React.Fragment key={k}>{knob(k, keys.length === 3 && i === 1 ? 34 : 54)}</React.Fragment>
            ))}
        </div>
    );

    const sw = (key) => window.OA_BUSS_SWITCHES.find((s) => s.key === key);

    return panel.frame(
        <div {...panel.frameProps({
            position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--panel)', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.7)', zIndex: 1200,
            // WIDE ENOUGH FOR THE CONTENTS AND NO WIDER. Both columns below are
            // capped — the faceplate at 340 and the switch column at 168 — so
            // anything past 340 + 10 + 168 + the padding was dead panel, and at
            // 700 there were nearly 180px of it sitting to the right of the
            // switches. A dialog that is bigger than what is in it reads as
            // something failing to load.
            padding: '10px 12px', width: 'min(552px, 97vw)', maxHeight: '86vh', overflowY: 'auto'
        })}>
            <div {...panel.handle({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' })}>
                <span style={{ fontSize: '12px', color: window.OA_BUSS_COLOR, fontWeight: 'bold', letterSpacing: '1px' }}>
                    MASTER BUSS — COMPRESSOR
                </span>
                {/* Four words, not a sentence. The long version — "channels,
                    strips, reverbs and tapes" — was competing with the title AND
                    three buttons for one line, and lost: it ended up crushed
                    under the Help button. What it was listing is in the help
                    text, which is where a list belongs. */}
                <span style={{ fontSize: '9px', color: '#666', whiteSpace: 'nowrap' }}>
                    across the whole mix
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    {panel.chrome && <window.SeqButton label={panel.popLabel} onClick={panel.togglePop}
                        title={panel.popTitle}
                        style={{ padding: '4px 10px' }} />}
                    {/* Help is a BUTTON rather than a standing paragraph: it is
                        read once and then in the way for ever, and the panel is
                        already tall enough to scroll. */}
                    <window.SeqButton label="? Help" onClick={() => setShowHelp((v) => !v)}
                        active={showHelp}
                        title="How to set this thing"
                        style={{ padding: '4px 10px' }} />
                    <window.SeqButton label="⟲ Abort" onClick={abort} disabled={!dirty}
                        color={dirty ? '#b71c1c' : undefined} textColor={dirty ? '#fff' : undefined}
                        title="Back to how the mix sounded when the panel was opened"
                        style={{ padding: '4px 10px', border: 'none' }} />
                    {bypassed && <window.OaOutOfCircuit />}
                    {panel.chrome && <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', ...veil }}>

                {/* ---- the faceplate: dark brushed steel, portrait, rack ears ---- */}
                <div style={{
                    flex: '1 1 300px', minWidth: '272px', maxWidth: '340px',
                    borderRadius: '5px', overflow: 'hidden',
                    border: '1px solid #000', boxShadow: '0 3px 12px rgba(0,0,0,0.6)',
                    padding: '8px 10px 10px',
                    background: 'linear-gradient(to bottom, #3c4046 0%, #2c3036 14%, #24272c 58%, #191b1f 100%)',
                    // Brushed metal: a fine vertical grain over the paint.
                    backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, rgba(0,0,0,0.045) 1px 2px), linear-gradient(to bottom, #3c4046 0%, #2c3036 14%, #24272c 58%, #191b1f 100%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        {bScrew}{bScrew}
                    </div>

                    <GrMeter posRef={needleRef} />

                    {/* The live figure under the glass. The needle tells you the
                        shape; the number tells you how much. */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        fontSize: '7.5px', fontWeight: '700', letterSpacing: '1.2px', color: '#9aa1aa',
                        fontVariantNumeric: 'tabular-nums'
                    }}>
                        <span>GR <i ref={grRef} style={{ fontStyle: 'normal', color: window.OA_BUSS_COLOR }}>0.0 dB</i></span>
                        <span style={{ color: '#c98a2e' }}>
                            <i ref={fadeRef} style={{ fontStyle: 'normal' }}></i>
                        </span>
                    </div>

                    {row('thresh', 'sc', 'makeup')}
                    {/* MIX is deprecated: parallel compression belongs on a
                        channel, not across the master, and every channel strip
                        already has a BLEND knob. Two knobs on this row now. */}
                    {row('attack', 'release')}
                    {row('ratio', 'trim', 'rate')}

                    {/* IN, ANALOG and FADE. Everything above decides what the
                        compressor does; these three decide whether it is doing
                        it at all, whether it is doing it dirty, and whether the
                        whole mix is on its way to silence. */}
                    <div style={{ display: 'flex', gap: '6px', width: '100%', marginTop: '2px' }}>
                        <BigButton
                            label="IN" active={on} lit="#f0b34a" title={sw('on').hint}
                            onPress={() => set('on', !on)}
                        />
                        <BigButton
                            label="ANALOG" active={!!unit.fourK && full} lit={window.OA_BUSS_COLOR}
                            disabled={!full}
                            title={full ? sw('fourK').hint : 'Needs the AudioWorklet DSP — this browser is on the native fallback chain'}
                            onPress={() => set('fourK', !unit.fourK)}
                        />
                        <BigButton
                            label={fading ? 'FADE' : 'FADE OFF'} active={fading} lit="#e0803a"
                            title={`Walk the master to silence over ${Math.round(unit.rate)}s — press again to bring it back`}
                            onPress={() => { const next = !fading; setFading(next); set('fade', next); }}
                        />
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '2px' }}>
                        <Cut size={10} style={{ letterSpacing: '3px' }}>44 BUSS</Cut>
                        <Cut size={6} style={{ letterSpacing: '1.6px', opacity: 0.75, marginTop: '1px' }}>
                            MASTER BUSS COMPRESSOR
                        </Cut>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        {bScrew}{bScrew}
                    </div>
                </div>

                {/* ---- the mode switches, as a companion panel ---- */}
                <div style={{
                    // Capped rather than free to grow: this column is switches
                    // and captions, and every pixel it takes past that comes off
                    // the meter and the knobs, which are what anyone is actually
                    // looking at.
                    flex: '0 1 156px', minWidth: '140px', maxWidth: '168px',
                    display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                    <div style={{
                        border: '1px solid #333840', borderRadius: '5px', padding: '8px',
                        background: '#1b1e23', display: 'flex', flexDirection: 'column', gap: '6px'
                    }}>
                        <div style={{ fontSize: '8px', color: '#7d848d', letterSpacing: '1.6px', fontWeight: '700' }}>
                            SIDE CHAIN
                        </div>
                        <ModeSwitch label="F/B  FEED-BACK" active={!!unit.fb} disabled={!full}
                            title={full ? sw('fb').hint : 'Worklet only — the native fallback cannot feed a detector from its own output'}
                            onPress={() => set('fb', !unit.fb)} />
                        <ModeSwitch label="LOW THD" active={!!unit.lowThd} disabled={!full}
                            title={full ? sw('lowThd').hint : 'Worklet only — the release cap lives inside the per-sample loop'}
                            onPress={() => set('lowThd', !unit.lowThd)} />
                        <ModeSwitch label="Σ  S/C  SUM" active={!!unit.scSum} disabled={!full}
                            title={full ? sw('scSum').hint : 'Worklet only — a native compressor has no side-chain input'}
                            onPress={() => set('scSum', !unit.scSum)} />
                    </div>

                    {/* MIX LAW went with MIX: it only ever described how that
                        knob crossfaded, and with the unit always fully wet there
                        is nothing left for it to say. */}

                    <div style={{
                        border: '1px solid #333840', borderRadius: '5px', padding: '8px',
                        background: '#1b1e23', display: 'flex', flexDirection: 'column', gap: '6px',
                        opacity: full ? 1 : 0.4
                    }}>
                        <div style={{ fontSize: '8px', color: '#7d848d', letterSpacing: '1.6px', fontWeight: '700' }}>
                            44K DISTORTION
                        </div>
                        {/* Nine steps, as nine cells rather than a knob — the
                            hardware sets this with a pair of + / - buttons and
                            reports it as a colour, so showing all nine at once is
                            closer to the truth than a pointer is.
                            
                            Stacked rather than in a row, and 9 at the top: it is
                            an AMOUNT, so it reads as a ladder that fills from the
                            bottom the way every other level in the rack does. It
                            also costs a column 26px wide instead of the width of
                            the whole panel. */}
                        <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '2px', flex: '0 0 auto' }}>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                    <button
                                        key={n}
                                        disabled={!full}
                                        onClick={() => set('dist', n)}
                                        title={`44K distortion ${n} of 9`}
                                        style={{
                                            width: '26px', height: '15px', padding: 0,
                                            borderRadius: '2px', cursor: full ? 'pointer' : 'not-allowed',
                                            border: `1px solid ${Math.round(unit.dist) === n ? window.OA_BUSS_COLOR : '#3a3f47'}`,
                                            background: n <= Math.round(unit.dist) && unit.fourK ? '#16323c' : '#22252a',
                                            color: Math.round(unit.dist) === n ? window.OA_BUSS_COLOR : '#6c737c',
                                            fontSize: '8px', fontWeight: '700', lineHeight: 1,
                                        }}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                            <div style={{ fontSize: '8.5px', color: '#7d848d', lineHeight: 1.45, flex: '1 1 0', minWidth: 0 }}>
                                Even-order harmonics from an unbalanced VCA. Shaped, not overloaded, so it costs no headroom.
                            </div>
                        </div>
                    </div>

                    {/* THE SETTINGS PICKER LIVES HERE, not on a row of its own
                        under both columns.

                        The faceplate is portrait and the switch column is short,
                        so this column ran out of content about half way down and
                        left a tall empty rectangle beside the knobs — while the
                        picker sat below in a full-width strip, making the panel
                        taller still. Putting it in the gap costs no height at
                        all and the gap stops being a gap. */}
                    <div style={{
                        border: '1px solid #333840', borderRadius: '5px', padding: '8px',
                        background: '#1b1e23', display: 'flex', flexDirection: 'column', gap: '6px'
                    }}>
                        <div style={{ fontSize: '8px', color: '#7d848d', letterSpacing: '1.6px', fontWeight: '700' }}>
                            SETTING
                        </div>
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) window.oaPluginPreset('buss', 0, e.target.value); }}
                            style={{
                                width: '100%', minWidth: 0, background: '#222', color: window.OA_BUSS_COLOR,
                                border: '1px solid #444', borderRadius: '3px', fontSize: '10px', padding: '3px 4px'
                            }}
                        >
                            <option value="">Load a setting…</option>
                            {Object.keys(window.OA_BUSS_PRESETS).map((k) => (
                                <option key={k} value={k}>{window.OA_BUSS_PRESETS[k].label}</option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{
                                width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block', flex: '0 0 auto',
                                background: on ? window.OA_BUSS_COLOR : '#26343a',
                                boxShadow: on ? `0 0 6px ${window.OA_BUSS_COLOR}` : 'inset 0 1px 2px #000'
                            }}></span>
                            <span style={{ fontSize: '8.5px', color: '#8f9299', letterSpacing: '.8px', lineHeight: 1.35 }}>
                                {on
                                    ? summary()
                                    : 'OUT OF CIRCUIT'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                {!full && (
                    <span style={{ fontSize: '9px', color: '#c98a2e', fontStyle: 'italic' }}>
                        native fallback chain — F/B, LOW THD, Σ S/C, 44K and the negative ratios are unavailable
                    </span>
                )}
            </div>

            {showHelp && (
            <div style={{
                fontSize: '9px', color: '#8f9299', marginTop: '10px', lineHeight: 1.6,
                border: '1px solid #333840', borderRadius: '5px', background: '#1b1e23', padding: '8px 10px'
            }}>
                Everything audible goes through this one: every channel, every channel strip,
                both reverb returns and all four tape returns sum into the master bus, and this
                sits across it. So a little goes a long way — two or three dB on the meter is
                what "glue" costs, and a needle that never comes back up is a threshold set too
                low rather than a compressor working hard. Start at 4:1 with RELEASE on AUTO,
                pull THRESHOLD down until the needle breathes in time with the music, then put
                the level back with MAKE-UP. If every kick drum ducks the record, that is not the
                threshold — bring SC FILTER up to 60–100 Hz and the detector stops hearing the
                bottom end while the mix keeps it.
            </div>
            )}
        </div>
    );
};
