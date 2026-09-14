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

// The COMPRESS panel for one channel: a 1U limiting amplifier, with the two
// knobs that decide how hard it works (INPUT and OUTPUT), the two that decide
// what it sounds like while it does (ATTACK and RELEASE), the ratio buttons,
// and the meter that shows you the gain being taken away in real time.
//
// The needle is the reason this panel exists. Every other control here is a
// number you could have typed; the meter is the only way to see that a 4:1 at
// this input setting is pulling 6dB off the peaks and nothing off the tails.
//
// The paint is not a colour, it is the theme accent shaded down — the plate,
// the ears, the engraving and the IN lamp all come off the one custom property
// Config's colour picker rewrites, so the box repaints with the rest of the app
// instead of staying orange under a blue theme. Only the parts that are not
// paint keep their own colour: black knobs, aluminium caps, steel screws, and
// the amber meter face, which is a lamp behind glass rather than a panel finish
// and has to stay legible whatever hue the plate ends up.

// Top-lit, the way a plate sits under a rack light: full accent along the top
// edge, four stops of shade down to the bottom rail. The stops are the same
// drop-per-inch the hand-mixed orange had, so the plate reads as the same piece
// of painted steel it always did — it is only the hue that is now borrowed.
const PLATE = 'linear-gradient(to bottom, var(--accent) 0%, var(--accent-s15) 16%,'
            + ' var(--accent-s25) 60%, var(--accent-s40) 100%)';
// The rack ears: the same paint, one stop further down, because an ear is the
// part of the plate the room light misses.
const EARS = 'linear-gradient(to bottom, var(--accent-s25) 0%, var(--accent-s55) 100%)';
const INK = 'var(--accent-s85)';            // engraved letters, cut into the paint
// The hairline of light under a cut letter — the paint's own tint, thinned.
const INK_LIT = 'color-mix(in srgb, var(--accent-t40) 35%, transparent)';

// Where each engraved dB mark sits along the meter's travel. A real VU scale is
// squashed at the quiet end and stretched around 0, and the needle has to land
// on the marks, so one table drives both the drawing and the pointing.
const VU_MARKS = [
    { db: -20, p: 0.00 }, { db: -10, p: 0.20 }, { db: -7, p: 0.30 },
    { db: -5,  p: 0.38 }, { db: -3,  p: 0.47 }, { db: -1, p: 0.57 },
    { db: 0,   p: 0.63 }, { db: 1,   p: 0.75 }, { db: 2,  p: 0.86 },
    { db: 3,   p: 1.00 },
];
const VU_ZERO = 0.63;                       // where the "0" mark falls

const vuPos = (db) => {
    if (db <= VU_MARKS[0].db) return 0;
    for (let i = 1; i < VU_MARKS.length; i++) {
        const a = VU_MARKS[i - 1], b = VU_MARKS[i];
        if (db <= b.db) return a.p + (db - a.db) / (b.db - a.db) * (b.p - a.p);
    }
    return 1;
};

// ---------------------------------------------------------------------------
// A panel knob: a black skirted knob with the scale engraved on the faceplate
// around it, which is what makes a rack unit look like a rack unit. The numbers
// are spread evenly across the 270° of travel, low end first.
// ---------------------------------------------------------------------------
const RackKnob = ({ value, min, max, defaultVal, ticks, size = 62, label, display, onChange }) => {
    // No writer means the adapter said this parameter is read-only. A knob that
    // turns and is heard by nothing is the failure this whole lane is about, so
    // it comes up GREYED AND INERT — both, exactly as oaBypassVeil argues: a
    // grey knob that still turns is a worse lie than no indication at all, and
    // a dead knob with no explanation is a fault with no symptom.
    const live = typeof onChange === 'function';
    // Room outside the knob for the collar. The engraved numbers sit past the
    // tick marks and a two-character label is ~10px wide, so the box has to
    // clear the knob by more than the label radius or the end stops get cropped.
    const S = size + 36;
    const cx = S / 2, cy = S / 2;
    const bodyR = size / 2;
    const [uid] = React.useState(() => 'ck' + Math.random().toString(36).slice(2, 8));

    const rad = (d) => d * Math.PI / 180;
    const pt = (r, a) => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];

    const clampV = (v) => Math.max(min, Math.min(max, v));
    const cur = clampV(value);
    const angle = (((cur - min) / ((max - min) || 1)) * 2 - 1) * 135;

    // Drag vertically, wheel to nudge, alt-click to reset — the same gesture
    // set as every other control in the mixer, so the hands do not relearn.
    const readout = window.useOaReadout({
        label, color: window.OA_COMP_COLOR,
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
        const [lx, ly] = pt(bodyR + 12, a);
        // Stroke and fill go through `style` rather than the presentation
        // attribute: var() in a presentation attribute resolves in Firefox and
        // silently falls back to black in WebKit, which would take the
        // engraving with it.
        marks.push(
            <React.Fragment key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1.2} strokeLinecap="round"
                      style={{ stroke: INK }} />
                <text x={lx} y={ly + 2.6} fontSize="7" fontWeight="700"
                      textAnchor="middle" style={{ fill: INK, userSelect: 'none' }}>{label}</text>
            </React.Fragment>
        );
    });

    // The knurled skirt. Fine radial nicks around the rim, exactly the detail
    // that stops a filled circle from reading as a sticker.
    const knurl = [];
    for (let i = 0; i < 36; i++) {
        const [x1, y1] = pt(bodyR - 0.5, i * 10);
        const [x2, y2] = pt(bodyR - 4, i * 10);
        knurl.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#050505" strokeWidth={1} opacity={0.55} />);
    }

    const [px1, py1] = pt(bodyR * 0.42, angle);
    const [px2, py2] = pt(bodyR * 0.93, angle);

    return (
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}
             style={{
                 display: 'block', touchAction: 'none',
                 cursor: live ? 'ns-resize' : 'default',
                 filter: live ? undefined : 'grayscale(1) brightness(0.6)',
                 opacity: live ? undefined : 0.7,
             }}
             onPointerDown={onPointerDown} onWheel={onWheel}>
            <defs>
                <radialGradient id={uid} cx="36%" cy="26%" r="80%">
                    <stop offset="0%" stopColor="#4a4a4e" />
                    <stop offset="45%" stopColor="#232326" />
                    <stop offset="100%" stopColor="#08080a" />
                </radialGradient>
                <radialGradient id={uid + 'c'} cx="34%" cy="24%" r="78%">
                    <stop offset="0%" stopColor="#f2f4f7" />
                    <stop offset="52%" stopColor="#b9bec7" />
                    <stop offset="100%" stopColor="#767c86" />
                </radialGradient>
            </defs>
            {marks}
            <circle cx={cx} cy={cy + 1.5} r={bodyR} fill="#00000055" />
            <circle cx={cx} cy={cy} r={bodyR} fill={`url(#${uid})`} stroke="#000" strokeWidth={1} />
            {knurl}
            {/* The brushed aluminium cap on top of the skirt. */}
            <circle cx={cx} cy={cy} r={bodyR * 0.62} fill={`url(#${uid}c)`} stroke="#0a0a0a" strokeWidth={0.8} />
            <line x1={px1} y1={py1} x2={px2} y2={py2} stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
        </svg>
    );
};

// One latching push button — the interlocking kind, which is why pressing one
// releases the last. Sits down in its well when it is in.
//
// Taller than it is wide, as the originals are: these are square-topped
// mechanical keys standing proud of the plate, and at anything near square they
// read as indicator lamps instead.
const PushButton = ({ label, active, onPress, title, width = 20, height = 28 }) => (
    <button
        onClick={onPress}
        title={title}
        style={{
            width: `${width}px`, height: `${height}px`, borderRadius: '2px', cursor: 'pointer',
            background: active
                ? 'linear-gradient(to bottom, #d8d2c4 0%, #b7b0a0 70%, #8a8478 100%)'
                : 'linear-gradient(to bottom, #f4f1e8 0%, #d6d1c4 60%, #b3ada0 100%)',
            border: `1px solid ${INK}`,
            boxShadow: active
                ? 'inset 0 3px 5px rgba(0,0,0,0.55)'
                : `0 2px 0 ${INK}, 0 3px 4px rgba(0,0,0,0.5)`,
            transform: active ? 'translateY(2px)' : 'none',
            padding: 0, fontSize: '8px', fontWeight: '700', color: INK,
            transition: 'transform .06s, box-shadow .06s',
        }}
    >
        {label}
    </button>
);

// A word engraved into the faceplate: dark ink with a hairline highlight under
// it, which is how a cut letter catches the light on a painted panel.
const Engraved = ({ children, size = 8, style }) => (
    <div style={{
        fontSize: `${size}px`, fontWeight: '700', letterSpacing: '1.4px', color: INK,
        textShadow: `0 1px 0 ${INK_LIT}`, ...style
    }}>
        {children}
    </div>
);

/**
 * The meter. `pos` is 0..1 across the engraved scale and arrives already
 * smoothed by the caller — a needle that follows the samples is a blur, and a
 * real moving-coil movement takes about a third of a second to settle anyway.
 */
const VuMeter = ({ posRef, mode }) => {
    const W = 196, H = 92;
    const pivotX = W / 2, pivotY = H * 1.72;
    // The needle stops just past the scale rather than running on to the edge of
    // the glass — a pointer that overshoots its own marks reads as pointing
    // somewhere between them.
    const scaleR = H * 1.30;
    const needleR = scaleR + 3;
    const A0 = -33, A1 = 33;

    const rad = (d) => d * Math.PI / 180;
    const pt = (r, a) => [pivotX + r * Math.sin(rad(a)), pivotY - r * Math.cos(rad(a))];

    const marks = VU_MARKS.map((m) => {
        const a = A0 + m.p * (A1 - A0);
        const [x1, y1] = pt(scaleR, a);
        const [x2, y2] = pt(scaleR - 5, a);
        const [lx, ly] = pt(scaleR - 13, a);
        const hot = m.db >= 0;
        return (
            <React.Fragment key={m.db}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={hot ? '#c22a10' : '#3a2205'} strokeWidth={m.db % 5 === 0 ? 1.4 : 1} />
                <text x={lx} y={ly + 3} fill={hot ? '#c22a10' : '#3a2205'} fontSize="7.5" fontWeight="700" textAnchor="middle">
                    {m.db > 0 ? '+' + m.db : m.db}
                </text>
            </React.Fragment>
        );
    });

    // The arc itself, drawn once — black below 0, red from 0 up, as on every
    // moving-coil meter ever fitted to a limiter.
    const arcPath = (a0, a1) => {
        const [x0, y0] = pt(scaleR, a0), [x1, y1] = pt(scaleR, a1);
        return `M ${x0} ${y0} A ${scaleR} ${scaleR} 0 0 1 ${x1} ${y1}`;
    };
    const zeroAngle = A0 + VU_ZERO * (A1 - A0);

    // The percentage row under the dB row, like the original's lower scale.
    const pctMarks = [0, 20, 40, 60, 80, 100].map((v) => {
        const a = A0 + (v / 100) * VU_ZERO * (A1 - A0);
        const [lx, ly] = pt(scaleR - 24, a);
        return <text key={v} x={lx} y={ly + 3} fill="#6b4410" fontSize="5.5" fontWeight="700" textAnchor="middle">{v}</text>;
    });

    return (
        <div style={{
            padding: '5px', borderRadius: '3px', maxWidth: '100%', minWidth: 0,
            background: 'linear-gradient(to bottom, #141416 0%, #26262a 50%, #101012 100%)',
            border: '1px solid #000', boxShadow: 'inset 0 1px 0 #ffffff18, 0 2px 5px rgba(0,0,0,0.6)'
        }}>
            {/* Sized in percent rather than pixels: the meter is the widest thing
                on the plate, and on a small phone it has to give ground instead
                of pushing the ratio and meter buttons off the line. */}
            <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
                 style={{ display: 'block', borderRadius: '2px', width: `${W}px`, maxWidth: '100%', height: 'auto' }}>
                <defs>
                    <linearGradient id="vuface" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffd98a" />
                        <stop offset="45%" stopColor="#f7bf5c" />
                        <stop offset="100%" stopColor="#e09a2c" />
                    </linearGradient>
                    <radialGradient id="vuglow" cx="50%" cy="18%" r="80%">
                        <stop offset="0%" stopColor="#fff2cc" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#fff2cc" stopOpacity="0" />
                    </radialGradient>
                </defs>
                <rect x={0} y={0} width={W} height={H} fill="url(#vuface)" />
                {/* The lamp behind the face — the reason these meters glow. */}
                <rect x={0} y={0} width={W} height={H} fill="url(#vuglow)" />

                <path d={arcPath(A0, zeroAngle)} fill="none" stroke="#3a2205" strokeWidth={1.4} />
                <path d={arcPath(zeroAngle, A1)} fill="none" stroke="#c22a10" strokeWidth={1.8} />
                {marks}
                {pctMarks}

                <text x={12} y={20} fill="#3a2205" fontSize="8" fontWeight="700" letterSpacing="1">VU</text>
                <text x={W - 20} y={20} fill="#c22a10" fontSize="8" fontWeight="700" letterSpacing="1">VU</text>
                <text x={W / 2} y={H - 6} fill="#6b4410" fontSize="6.5" fontWeight="700" letterSpacing="1.2" textAnchor="middle">
                    {mode === 'off' ? 'METER OFF' : (mode === 'gr' ? 'GAIN REDUCTION' : 'OUTPUT LEVEL ' + mode)}
                </text>

                {/* The needle. Driven straight through a ref by the animation
                    loop — routing 60 frames a second of needle angle through
                    React state would re-render the whole panel for each one. */}
                <g ref={posRef} style={{ transformOrigin: `${pivotX}px ${pivotY}px` }}>
                    <line x1={pivotX} y1={pivotY} x2={pivotX} y2={pivotY - needleR}
                          stroke="#d42a10" strokeWidth={2} strokeLinecap="round" />
                </g>
                <circle cx={pivotX} cy={pivotY} r={9} fill="#1a1a1c" />
                {/* Glass: a diagonal sheen across the face. */}
                <path d={`M 0 ${H} L ${W * 0.55} 0 L ${W * 0.78} 0 L ${W * 0.2} ${H} Z`} fill="#ffffff" opacity="0.07" />
            </svg>
        </div>
    );
};

const screw = (
    <div style={{
        width: '9px', height: '9px', borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #cfd3d8, #6d727a 60%, #33363b)',
        boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.6), 0 1px 1px rgba(0,0,0,0.5)',
        position: 'relative'
    }}>
        <i style={{
            position: 'absolute', left: '1px', right: '1px', top: '4px', height: '1px',
            background: '#2a2d31', display: 'block'
        }}></i>
    </div>
);

/**
 * The compressor panel for one channel. Writes straight to the live unit, and
 * because the strip is shared by every voice on the channel, a knob move lands
 * on the sound that is already ringing rather than waiting for the next hit.
 */
window.CompressorEditor = ({ idx, name, onClose, oaPopped, oaHosted }) => {
    const [showHelp, setShowHelp] = React.useState(false);
    const panel = window.useOaPanel({
        id: `comp-${idx}`, title: `${name} — COMPRESS`, copy: oaPopped, hosted: oaHosted,
        render: () => <window.CompressorEditor idx={idx} name={name} onClose={onClose} oaPopped />,
    });
    // On a phone the plate cannot hold one row, so it wraps. Left to itself the
    // wrap breaks the panel in the wrong places — the meter separated from the
    // buttons that aim it, and the two time knobs standing in a tall column that
    // pushes everything else down. Below this width the groups are re-cut.
    const [narrow, setNarrow] = React.useState(window.innerWidth <= 800);
    React.useEffect(() => {
        const onResize = () => setNarrow(window.innerWidth <= 800);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    // Settings and faceplate through the interface; the subscribe/unsubscribe
    // pair each editor used to write out longhand lives in the hook now, which
    // is one fewer listener that can outlive its panel and keep the whole
    // component tree alive behind it.
    const unit = window.useOaState('comp', idx);
    const params = window.useOaParams('comp', idx);
    // Armed for a take: the strip is out of the path, so the plate greys and
    // stops taking knob moves that nothing would hear.
    const bypassed = window.useOaFxBypass();
    const veil = window.oaBypassVeil(bypassed);

    // Taken once per channel, so ABORT goes back to how this channel sounded
    // when the panel was opened rather than to a factory setting.
    const opened = React.useRef(null);
    React.useEffect(() => {
        const u = window.oaPluginState('comp', idx);
        opened.current = { on: u.on, ratio: u.ratio };
        window.oaPluginParams('comp', idx).forEach((p) => { opened.current[p.key] = u[p.key]; });
    }, [idx]);

    // The control list, its bounds and its writability all come from
    // PLAN-18.01's adapter now; the engraving still comes from the plugin's own
    // schema. `P` survives only for the two places that want a formatter for a
    // value they are not drawing a control for.
    const surface = window.useOaConsoleSurface('comp', idx);
    const P = (k) => params.find((p) => p.key === k);
    const ratio = window.oaCompRatio(unit.ratio);
    const on = unit.on && unit.mix > 0.0005;
    const set = (k, v) => window.oaPluginSet('comp', idx, k, v);

    const dirty = !!opened.current && (opened.current.on !== unit.on || opened.current.ratio !== unit.ratio
        || params.some((p) => opened.current[p.key] !== unit[p.key]));
    const abort = () => {
        if (!opened.current) return;
        set('on', opened.current.on);
        set('ratio', opened.current.ratio);
        params.forEach((p) => set(p.key, opened.current[p.key]));
    };

    // ---- the needle ------------------------------------------------------
    const needleRef = React.useRef(null);
    const grRef = React.useRef(null);
    const meterMode = unit.meter || 'gr';
    // The panel used to find its own compressor in ctx.__oaComps, pull a
    // thousand floats out of its analyser and reduce them to a peak — the same
    // work the Mixer was doing on the same node in its own loop. Both readings
    // now come off the plugin's frame, which is filled once by the back end.
    //
    // Everything below is presentation: a scale position, a needle with mass, a
    // number formatted for a readout. That is all a front panel should be.
    const A0 = -33, A1 = 33;
    const shownRef = React.useRef(0);        // smoothed needle position, 0..1

    window.useOaFrame('comp', idx, (frame, L) => {
        const gr = frame[L.GR];

        let target;
        const meta = window.OA_COMP_METERS.find((m) => m.key === meterMode);
        if (meterMode === 'off' || !frame[L.ACTIVE]) {
            target = 0;
        } else if (meterMode === 'gr') {
            // The same engraved scale, read backwards: no reduction parks the
            // needle on 0 and every dB taken off swings it left.
            target = VU_ZERO * (1 - Math.min(1, gr / 20));
        } else {
            const peak = frame[L.PEAK_L];
            const db = peak > 1e-6 ? 20 * Math.log10(peak) : -80;
            target = vuPos(db - (meta ? meta.ref : -18));
        }

        // A moving-coil movement has mass. Rising fast and falling slow is both
        // what the real one does and what makes the reading legible.
        shownRef.current += (target - shownRef.current) * (target > shownRef.current ? 0.35 : 0.12);
        if (needleRef.current) {
            needleRef.current.setAttribute('transform',
                `rotate(${(A0 + shownRef.current * (A1 - A0)).toFixed(2)} 98 158.24)`);
        }
        if (grRef.current) grRef.current.textContent = gr > 0.05 ? '-' + gr.toFixed(1) + ' dB' : '0.0 dB';
    });

    // ONE knob column, from ONE descriptor. This used to reach into `params`
    // for the bounds and into `unit` for the value and assume every parameter
    // it was handed could be written — the hand-written per-mixer surface
    // PLAN-18.01 step 5 exists to delete. It now draws whatever the adapter
    // says this plugin has, and a read-only parameter comes back engraved and
    // inert rather than as a knob whose writes land nowhere.
    const knobCol = (key, size) => {
        const d = surface.by[key];
        if (!d) return null;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                <RackKnob
                    value={d.value} min={d.min} max={d.max} defaultVal={d.def}
                    ticks={d.ticks} size={size} onChange={d.writable ? d.set : undefined}
                    label={d.label.toUpperCase()} display={d.display}
                />
                <Engraved size={7.5} style={{ letterSpacing: '2px' }}>{d.label.toUpperCase()}</Engraved>
                <div style={{
                    fontSize: '8.5px', color: INK, fontWeight: '700',
                    fontVariantNumeric: 'tabular-nums', opacity: 0.85
                }}>
                    {d.display}
                </div>
            </div>
        );
    };

    return panel.frame(
        <div {...panel.frameProps({
            position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--panel)', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.7)', zIndex: 1200,
            padding: '10px 12px', width: 'min(870px, 97vw)', maxHeight: '82vh', overflowY: 'auto'
        })}>
            <div {...panel.handle({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' })}>
                <span style={{ fontSize: '12px', color: window.OA_COMP_COLOR, fontWeight: 'bold', letterSpacing: '1px' }}>
                    {name} — COMPRESS
                </span>
                <span style={{ fontSize: '9px', color: '#666' }}>after the pan, sends tapped ahead of it</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    {panel.chrome && <window.SeqButton label={panel.popLabel} onClick={panel.togglePop}
                        title={panel.popTitle}
                        style={{ padding: '4px 10px' }} />}
                    {/* Help is a BUTTON rather than a standing paragraph: it is
                        read once and then in the way for ever. */}
                    <window.SeqButton label="? Help" onClick={() => setShowHelp((v) => !v)}
                        active={showHelp}
                        title="How to set this thing"
                        style={{ padding: '4px 10px' }} />
                    <window.SeqButton label="⟲ Abort" onClick={abort} disabled={!dirty}
                        color={dirty ? '#b71c1c' : undefined} textColor={dirty ? '#fff' : undefined}
                        title="Back to how this channel sounded when the panel was opened"
                        style={{ padding: '4px 10px', border: 'none' }} />
                    {bypassed && <window.OaOutOfCircuit />}
                    {panel.chrome && <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />}
                </div>
            </div>

            {/* ---- the faceplate: brushed paint, 1U, rack ears at both ends ---- */}
            <div style={{
                display: 'flex', alignItems: 'stretch', borderRadius: '4px', overflow: 'hidden',
                border: '1px solid #000', boxShadow: '0 3px 10px rgba(0,0,0,0.55)',
                background: PLATE, ...veil
            }}>
                {/* Rack ear */}
                <div style={{
                    width: '26px', flex: '0 0 auto', display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-between', alignItems: 'center', padding: '8px 0',
                    background: EARS,
                    borderRight: '1px solid #00000055'
                }}>
                    {screw}{screw}
                </div>

                <div style={{
                    flex: 1, minWidth: 0, padding: '6px 8px',
                    background: PLATE,
                    // Brushed metal: a fine vertical grain over the paint.
                    backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 1px, rgba(0,0,0,0.035) 1px 2px), ${PLATE}`,
                    // space-around rather than centre: the groups are different
                    // heights and widths, and clustering them in the middle left
                    // a band of bare paint down each side of the plate.
                    display: 'flex', alignItems: 'center', gap: '4px',
                    flexWrap: 'wrap', justifyContent: 'space-around'
                }}>
                    {/* IN — the only control the original does not have. Something
                        has to be able to take the strip out of circuit. */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <button
                            onClick={() => set('on', !unit.on)}
                            title={on ? 'Compressor in circuit' : 'Compressor out of circuit — the channel passes through untouched'}
                            style={{
                                width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer',
                                border: `2px solid ${INK}`,
                                background: on
                                    ? 'radial-gradient(circle at 38% 30%, var(--accent-t40), var(--accent) 45%, var(--accent-s40) 100%)'
                                    : 'radial-gradient(circle at 38% 30%, #6b6357, #3a3128 60%, #241d16 100%)',
                                boxShadow: on
                                    ? '0 0 12px rgba(var(--accent-rgb),0.75), inset 0 1px 2px rgba(255,255,255,0.5)'
                                    : 'inset 0 2px 4px rgba(0,0,0,0.6)',
                                padding: 0
                            }}
                        />
                        <Engraved size={7} style={{ letterSpacing: '2px' }}>IN</Engraved>
                        {knobCol('mix', 40)}
                        {/* The badge. It used to be a full-width row across the
                            bottom of the plate, which cost a whole extra flex
                            line of height while this column sat half empty. */}
                        <div style={{ textAlign: 'center', marginTop: '2px' }}>
                            {/* The badge carries the name, so it is cut deeper
                                than the control legends around it. */}
                            <Engraved size={10} style={{ letterSpacing: '3px', fontWeight: '900', WebkitTextStroke: `0.3px ${INK}` }}>APK 4476</Engraved>
                            <Engraved size={6} style={{ letterSpacing: '1.4px', opacity: 0.8, marginTop: '1px' }}>
                                LIMITING AMPLIFIER
                            </Engraved>
                        </div>
                    </div>

                    {knobCol('input', 62)}
                    {knobCol('output', 62)}

                    {/* ATTACK over RELEASE, stacked, as on the front panel —
                        except when the plate is narrow, where a two-knob column
                        is the tallest thing on it and side by side costs
                        nothing that a wrapped row was not going to cost anyway. */}
                    <div style={{
                        display: 'flex', flexDirection: narrow ? 'row' : 'column',
                        alignItems: 'center', gap: '6px'
                    }}>
                        {knobCol('attack', 42)}
                        {knobCol('release', 42)}
                    </div>

                    {/* RATIO, the meter, and the METER buttons travel together:
                        the buttons on the right are what the needle is reading,
                        and a wrap that leaves them on the line below reads as a
                        second, unrelated bank of switches. */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        flexWrap: 'nowrap', minWidth: 0
                    }}>
                        {/* RATIO — interlocking buttons, one circuit at a time. */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <Engraved size={7} style={{ letterSpacing: '1.6px', marginBottom: '1px' }}>RATIO</Engraved>
                            {window.OA_COMP_RATIOS.map((r) => (
                                <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{
                                        fontSize: '7.5px', fontWeight: '700', color: INK, width: '18px',
                                        textAlign: 'right', textShadow: `0 1px 0 ${INK_LIT}`
                                    }}>{r.label}</span>
                                    <PushButton label="" active={unit.ratio === r.key} title={r.hint}
                                        onPress={() => set('ratio', r.key)} width={16} height={26} />
                                </div>
                            ))}
                        </div>

                        {/* The meter, with the live reduction figure tucked into
                            the space under it — the needle tells you the shape,
                            the number tells you how much. */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: 0 }}>
                            <VuMeter posRef={needleRef} mode={meterMode} />
                            <span style={{
                                fontSize: '7px', fontWeight: '700', letterSpacing: '1.2px', color: INK,
                                fontVariantNumeric: 'tabular-nums', opacity: 0.8,
                                textShadow: `0 1px 0 ${INK_LIT}`
                            }}>
                                GR <i ref={grRef} style={{ fontStyle: 'normal' }}>0.0 dB</i>
                            </span>
                        </div>

                        {/* METER — where the needle is pointing. Panel only; it
                            changes nothing about what the channel sounds like. */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <Engraved size={7} style={{ letterSpacing: '1.6px', marginBottom: '1px' }}>METER</Engraved>
                            {window.OA_COMP_METERS.map((m) => (
                                <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <PushButton label="" active={meterMode === m.key} title={m.hint}
                                        onPress={() => set('meter', m.key)} width={16} height={26} />
                                    <span style={{
                                        fontSize: '7.5px', fontWeight: '700', color: INK, width: '20px',
                                        textShadow: `0 1px 0 ${INK_LIT}`
                                    }}>{m.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

                <div style={{
                    width: '26px', flex: '0 0 auto', display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-between', alignItems: 'center', padding: '8px 0',
                    background: EARS,
                    borderLeft: '1px solid #00000055'
                }}>
                    {screw}{screw}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', color: '#aaa' }}>Setting</span>
                <select
                    value=""
                    onChange={(e) => { if (e.target.value) window.oaPluginPreset('comp', idx, e.target.value); }}
                    style={{ background: '#222', color: window.OA_COMP_COLOR, border: '1px solid #444', borderRadius: '3px', fontSize: '11px', padding: '3px 6px' }}
                >
                    <option value="">Load a setting…</option>
                    {Object.keys(window.OA_COMP_PRESETS).map((k) => (
                        <option key={k} value={k}>{window.OA_COMP_PRESETS[k].label}</option>
                    ))}
                </select>
                <span style={{
                    width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block',
                    background: on ? window.OA_COMP_COLOR : '#3a2a16',
                    boxShadow: on ? `0 0 6px ${window.OA_COMP_COLOR}` : 'inset 0 1px 2px #000'
                }}></span>
                <span style={{ fontSize: '9px', color: '#8f9299', letterSpacing: '1.5px' }}>
                    {on ? `IN — ${ratio.label}${ratio.key === 'all' ? '' : ':1'}` : 'OUT OF CIRCUIT'}
                </span>
                <span style={{ fontSize: '10px', color: '#777', fontStyle: 'italic' }}>{ratio.hint}</span>
            </div>

            {showHelp && (
            <div style={{
                fontSize: '9px', color: '#8f9299', marginTop: '10px', lineHeight: 1.6,
                border: '1px solid #333840', borderRadius: '5px', background: '#1b1e23', padding: '8px 10px'
            }}>
                There is no threshold knob: the threshold is fixed inside the box and INPUT
                drives the signal into it, so turning input up is turning compression up. Take
                the level back with OUTPUT. Both time knobs run backwards — fully clockwise is
                the FASTEST setting. A slow ATTACK lets the front of a hit through before the
                gain clamps, which is how a compressor makes a drum hit harder rather than
                duller; RELEASE too fast and you hear the channel breathe between hits. BLEND
                below 100% is parallel compression: peaks held down, transients intact
                underneath. Watch the needle, not the numbers.
            </div>
            )}
        </div>
    );
};
