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
 * Header: GalaxyKnob.jsx
 * Purpose: The hardware controls a tape echo faceplate is made of — brushed
 *   silver knobs on a painted panel, and the big numbered HEAD SELECT dial.
 * Description: These are drawn, not skinned: every highlight is an SVG gradient
 *   so a knob stays sharp at any size and costs no image bytes. Both controls
 *   speak in a normalised 0..1 position and leave the units to the caller —
 *   milliseconds, hertz and percent all turn the same way under the finger.
 *
 *   Dragging is vertical, the way a hardware knob is turned on a desk: up is
 *   more. Shift drags at a quarter speed for the last few percent, the wheel
 *   nudges, and Alt-clicking drops the control back to its factory position.
 */

const gRad = (d) => d * Math.PI / 180;
const gPt = (cx, cy, r, deg) => [cx + r * Math.sin(gRad(deg)), cy - r * Math.cos(gRad(deg))];

// Knobs sweep the usual 270°: 7 o'clock round to 5 o'clock, with the dead zone
// at the bottom where a real pointer would run into its end stop.
const SWEEP = 135;
const angleOf = (n) => (n * 2 - 1) * SWEEP;

// The pointer drag, shared by both controls. `norm` is where the control is now;
// every move reports an absolute position rather than a delta, so a drag that
// runs past an end stop and comes back lands where the finger is.
// No writer means no gesture. A dial that still turns under the hand while its
// writes land nowhere is worse than one that plainly will not move. PLAN-18.12,
// the same guard SvgKnob, RackKnob and BussKnob carry.
const useGalaxyDrag = (norm, onNorm, defaultNorm, readout) => React.useCallback((e) => {
    if (typeof onNorm !== 'function') return;
    if (e.altKey && defaultNorm != null) { onNorm(defaultNorm); return; }
    if (readout) readout.begin(e);
    const el = e.currentTarget;
    const startY = e.clientY;
    const start = norm;
    try { el.setPointerCapture(e.pointerId); } catch (x) {}

    const move = (em) => {
        // 160px of travel is the whole range; holding shift stretches that to
        // 640px, which is how a 2-second head gets set to the millisecond.
        const span = em.shiftKey ? 640 : 160;
        onNorm(Math.max(0, Math.min(1, start + (startY - em.clientY) / span)));
    };
    const up = (eu) => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        try { el.releasePointerCapture(eu.pointerId); } catch (x) {}
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    e.preventDefault();
}, [norm, onNorm, defaultNorm]);

const useGalaxyWheel = (norm, onNorm) => React.useCallback((e) => {
    if (typeof onNorm !== 'function') return;
    e.preventDefault();
    const stepBy = (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.005 : 0.02);
    onNorm(Math.max(0, Math.min(1, norm + stepBy)));
}, [norm, onNorm]);

/**
 * The metal itself. Turned aluminium: a bright quadrant up and to the left where
 * the room light lands, a dark rim, fine radial knurling around the skirt and a
 * machined dimple in the middle. `r` is the radius of the silver, and the collar
 * it sits in is drawn a little wider.
 */
const KnobBody = ({ uid, cx, cy, r, angle, knurl = 22 }) => {
    const lines = [];
    for (let i = 0; i < knurl; i++) {
        const a = i * (360 / knurl);
        const [x1, y1] = gPt(cx, cy, r * 0.99, a);
        const [x2, y2] = gPt(cx, cy, r * 0.78, a);
        lines.push(
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={i % 2 ? '#ffffff' : '#3d444c'} strokeWidth={r * 0.045} opacity={i % 2 ? 0.28 : 0.32} />
        );
    }
    const [px1, py1] = gPt(cx, cy, r * 0.22, angle);
    const [px2, py2] = gPt(cx, cy, r * 0.93, angle);

    return (
        <g>
            {/* The collar: the pale blue-grey washer the knob turns in. */}
            <circle cx={cx} cy={cy} r={r * 1.14} fill={`url(#${uid}c)`} stroke="#161a1e" strokeWidth={1} />
            {/* Cast shadow under the skirt, so the knob sits above the panel. */}
            <ellipse cx={cx} cy={cy + r * 0.1} rx={r * 1.02} ry={r * 1.0} fill="#000" opacity={0.35} />
            <circle cx={cx} cy={cy} r={r} fill={`url(#${uid}f)`} stroke="#4a5158" strokeWidth={0.8} />
            {lines}
            {/* Brushed top face, inside the knurled skirt. */}
            <circle cx={cx} cy={cy} r={r * 0.76} fill={`url(#${uid}t)`} stroke="#8c949c" strokeWidth={0.5} />
            {/* The pointer groove, cut into the metal rather than painted on. */}
            <line x1={px1} y1={py1} x2={px2} y2={py2} stroke="#20252a" strokeWidth={Math.max(1.6, r * 0.10)} strokeLinecap="round" />
            <line x1={px1} y1={py1 + 1} x2={px2} y2={py2 + 1} stroke="#ffffff" strokeWidth={Math.max(0.6, r * 0.035)} strokeLinecap="round" opacity={0.35} />
            <circle cx={cx} cy={cy} r={r * 0.17} fill={`url(#${uid}d)`} stroke="#6f767e" strokeWidth={0.5} />
        </g>
    );
};

const KnobDefs = ({ uid }) => (
    <defs>
        <radialGradient id={`${uid}c`} cx="35%" cy="25%" r="80%">
            <stop offset="0%" stopColor="#d3dde6" />
            <stop offset="60%" stopColor="#93a1ae" />
            <stop offset="100%" stopColor="#5c6672" />
        </radialGradient>
        <radialGradient id={`${uid}f`} cx="34%" cy="26%" r="82%">
            <stop offset="0%" stopColor="#f6f8fa" />
            <stop offset="45%" stopColor="#c6ccd3" />
            <stop offset="82%" stopColor="#8f979f" />
            <stop offset="100%" stopColor="#626a73" />
        </radialGradient>
        <linearGradient id={`${uid}t`} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#fbfcfd" />
            <stop offset="38%" stopColor="#d5dae0" />
            <stop offset="62%" stopColor="#aab2ba" />
            <stop offset="100%" stopColor="#d9dee3" />
        </linearGradient>
        <radialGradient id={`${uid}d`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#e9edf1" />
            <stop offset="100%" stopColor="#9aa2aa" />
        </radialGradient>
    </defs>
);

/**
 * One silver knob on the painted panel, with its screened label above and the
 * value it is sitting on below. The ring of dots is the panel print the real
 * machine has around every control — they mark the sweep, not the setting.
 */
window.GalaxyKnob = ({
    norm = 0, onNorm, defaultNorm, size = 46, label, readout, title, dots = 11, accent = '#dfe6c8',
}) => {
    const [uid] = React.useState(() => 'g' + Math.random().toString(36).slice(2, 8));
    const pad = 5;
    const box = size + pad * 2;
    const cx = box / 2, cy = box / 2;
    const r = size / 2 - 3;
    const n = Math.max(0, Math.min(1, norm));
    // The knob already prints its own name and value under it; the overlay shows
    // the same two, at a size that survives a finger over the panel.
    const rd = window.useOaReadout({ label, display: readout != null ? readout : Math.round(n * 100), pct: n * 100, color: accent });
    const down = useGalaxyDrag(n, onNorm, defaultNorm, rd);
    const wheel = useGalaxyWheel(n, onNorm);

    const marks = [];
    for (let i = 0; i < dots; i++) {
        const a = -SWEEP + (i / (dots - 1)) * SWEEP * 2;
        const [x, y] = gPt(cx, cy, r * 1.30, a);
        // The print is a dark cast of whatever the plate is painted, so it goes
        // through `style` — var() in a fill attribute resolves in Firefox and
        // silently blackens in WebKit.
        marks.push(<circle key={i} cx={x} cy={y} r={Math.max(0.8, size * 0.022)}
                           opacity={0.85} style={{ fill: 'var(--accent-s85)' }} />);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', width: `${box + 6}px` }}>
            {label && (
                <div style={{
                    fontSize: '7.5px', color: '#eef2e2', letterSpacing: '0.8px',
                    textAlign: 'center', lineHeight: 1.2, textShadow: '0 1px 1px #0006', whiteSpace: 'nowrap'
                }}>
                    {label}
                </div>
            )}
            <svg
                width={box} height={box} viewBox={`0 0 ${box} ${box}`} title={title}
                style={{ display: 'block', touchAction: 'none', cursor: 'ns-resize' }}
                onPointerDown={down} onWheel={wheel}
            >
                <KnobDefs uid={uid} />
                {marks}
                <KnobBody uid={uid} cx={cx} cy={cy} r={r} angle={angleOf(n)} knurl={22} />
            </svg>
            {readout != null && (
                <div style={{
                    fontSize: '8px', color: accent, fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '0.3px', textShadow: '0 1px 1px #0008', whiteSpace: 'nowrap'
                }}>
                    {readout}
                </div>
            )}
        </div>
    );
};

/**
 * The HEAD SELECT dial. On the original machine this is a rotary switch that
 * picks which playback heads are live; here the ring is printed with every note
 * division that fits in the head's range, and the knob turns freely between
 * them.
 *
 * Turning it sets the head in milliseconds and takes it off the grid. Tapping a
 * printed division locks the head to that note value instead, so it follows the
 * tempo — which is why the ring redraws when the BPM moves: the same divisions
 * sit at different times, and a lock that no longer fits drops off the dial.
 */
window.GalaxyHeadSelect = ({
    norm = 0, onNorm, defaultNorm, size = 78, label, readout, detents = [], activeSteps = 0,
    onDetent, footer,
}) => {
    const [uid] = React.useState(() => 'h' + Math.random().toString(36).slice(2, 8));
    const pad = 21;
    const box = size + pad * 2;
    const cx = box / 2, cy = box / 2;
    const r = size / 2 - 2;
    const n = Math.max(0, Math.min(1, norm));
    const rd = window.useOaReadout({ label, display: readout != null ? readout : Math.round(n * 100), pct: n * 100, color: activeSteps ? '#c6ff8a' : '#dfe6c8' });
    const down = useGalaxyDrag(n, onNorm, defaultNorm, rd);
    const wheel = useGalaxyWheel(n, onNorm);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            {label && (
                <div style={{
                    fontSize: '8px', color: '#eef2e2', letterSpacing: '1.4px',
                    textShadow: '0 1px 1px #0006', whiteSpace: 'nowrap'
                }}>
                    {label}
                </div>
            )}
            <svg
                width={box} height={box} viewBox={`0 0 ${box} ${box}`}
                style={{ display: 'block', touchAction: 'none' }}
            >
                <KnobDefs uid={uid} />

                {/* The printed dial face: a lighter green disc under the numbers. */}
                <circle cx={cx} cy={cy} r={r * 1.62} fill="#ffffff" opacity={0.05} />
                <circle cx={cx} cy={cy} r={r * 1.62} fill="none" stroke="#dfe6c8" strokeWidth={0.7} opacity={0.45} />

                {detents.map((d) => {
                    const a = angleOf(d.norm);
                    const [tx, ty] = gPt(cx, cy, r * 1.22, a);
                    const [tx2, ty2] = gPt(cx, cy, r * 1.36, a);
                    const [lx, ly] = gPt(cx, cy, r * 1.52, a);
                    const lit = activeSteps === d.steps;
                    return (
                        <g key={d.steps} onPointerDown={(e) => { e.stopPropagation(); onDetent && onDetent(d.steps); }}
                            style={{ cursor: 'pointer' }}>
                            {/* A generous invisible target — these are 8px numbers. */}
                            <circle cx={lx} cy={ly} r={7} fill="transparent" />
                            <title>{d.title}</title>
                            <line x1={tx} y1={ty} x2={tx2} y2={ty2}
                                stroke={lit ? '#c6ff8a' : '#e8eedd'} strokeWidth={lit ? 1.6 : 1} opacity={lit ? 1 : 0.6} />
                            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
                                fontSize={7.5} fontWeight={lit ? 700 : 500}
                                fill={lit ? '#c6ff8a' : '#eef2e2'} opacity={lit ? 1 : 0.75}
                                style={lit ? { filter: 'drop-shadow(0 0 3px #7dff4a)' } : undefined}>
                                {d.label}
                            </text>
                        </g>
                    );
                })}

                {/* The legend printed across the bottom gap, where the dial has no
                    positions — the original prints REVERB ONLY there. */}
                <text x={cx} y={box - 3} textAnchor="middle" fontSize={6} fill="#eef2e2" opacity={0.6} letterSpacing="1">
                    {footer}
                </text>

                <g onPointerDown={down} onWheel={wheel} style={{ cursor: 'ns-resize' }}>
                    <circle cx={cx} cy={cy} r={r * 1.16} fill="transparent" />
                    <KnobBody uid={uid} cx={cx} cy={cy} r={r} angle={angleOf(n)} knurl={26} />
                </g>
            </svg>
            {readout != null && (
                <div style={{
                    fontSize: '9px', color: activeSteps ? '#c6ff8a' : '#dfe6c8',
                    fontVariantNumeric: 'tabular-nums', textShadow: '0 1px 1px #0008'
                }}>
                    {readout}
                </div>
            )}
        </div>
    );
};
