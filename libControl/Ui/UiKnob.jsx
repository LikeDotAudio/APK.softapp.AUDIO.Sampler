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
 * Header: UiKnob.jsx
 * Purpose: One rotary control, several skins.
 * Description: The rack has four knobs drawn four ways — the mixer's SvgKnob,
 *   the tape machine's GalaxyKnob, the limiter's RackKnob and the pedal's small
 *   one — and every one of them implemented the SAME GESTURE by hand:
 *
 *     drag vertically over 150px of travel for the full range;
 *     wheel to nudge by a fiftieth;
 *     alt-click to snap back to the default;
 *     capture the pointer so a fast drag does not fall off the control.
 *
 *   That gesture set is the part the hands learn, so it must not vary between
 *   panels — and it is the part that was quietly varying. The DRAWING is what
 *   should vary, because a tape machine's knob and a rack limiter's knob are
 *   different objects.
 *
 *   So: behaviour here, appearance in a `skin`. Adding a look means adding a
 *   drawing function, not another copy of the pointer maths.
 */

/** Turn a pointer gesture into value changes. Shared by every skin. */
const useKnobGesture = ({ value, min, max, defaultVal, onChange }) => {
    const span = (max - min) || 1;
    const clampV = (v) => Math.max(min, Math.min(max, v));
    const cur = clampV(value);

    const onPointerDown = (e) => {
        if (e.altKey) { onChange(defaultVal != null ? defaultVal : min); return; }
        const startY = e.clientY;
        const startV = cur;
        const el = e.target;
        try { el.setPointerCapture(e.pointerId); } catch (x) {}
        // 150px of travel for the whole range: far enough to be fine, short
        // enough that a knob can be swept end to end without lifting.
        const move = (em) => onChange(clampV(startV + ((startY - em.clientY) / 150) * span));
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
    };

    const onWheel = (e) => {
        e.preventDefault();
        onChange(clampV(cur + (e.deltaY < 0 ? 1 : -1) * span / 50));
    };

    return { cur, span, onPointerDown, onWheel };
};
window.useOaKnobGesture = useKnobGesture;

/**
 * 270° of travel, centred on straight up — the convention on every panel here,
 * and the reason -135°/+135° appears in each skin below.
 */
const SWEEP = 135;
const angleOf = (cur, min, span) => (((cur - min) / span) * 2 - 1) * SWEEP;

/**
 * skin 'rack': a black skirted knob with a knurled rim, a brushed aluminium cap
 * and the scale ENGRAVED ON THE FACEPLATE around it — which is what makes a box
 * look like a rack unit rather than like a plugin.
 */
const RackSkin = ({ size, cur, min, span, ticks }) => {
    const T = window.OA_UI;
    // Room outside the knob for the collar: the engraved numbers sit past the
    // ticks and a two-character label is ~10px wide, so the box has to clear the
    // knob by more than the label radius or the end stops get cropped.
    const S = size + 36;
    const cx = S / 2, cy = S / 2, bodyR = size / 2;
    const [uid] = React.useState(() => window.oaUiId('ck'));
    const pt = (r, a) => window.oaUiPolar(cx, cy, r, a);
    const angle = angleOf(cur, min, span);

    const marks = [];
    (ticks || []).forEach((label, i) => {
        const a = -SWEEP + (i / Math.max(1, ticks.length - 1)) * SWEEP * 2;
        const [x1, y1] = pt(bodyR + 3, a);
        const [x2, y2] = pt(bodyR + 6, a);
        const [lx, ly] = pt(bodyR + 12, a);
        // Stroke and fill go through `style` rather than the presentation
        // attribute: var() in a presentation attribute resolves in Firefox and
        // silently falls back to black in WebKit, taking the engraving with it.
        marks.push(
            <React.Fragment key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1.2} strokeLinecap="round"
                      style={{ stroke: T.INK }} />
                <text x={lx} y={ly + 2.6} fontSize="7" fontWeight="700"
                      textAnchor="middle" style={{ fill: T.INK, userSelect: 'none' }}>{label}</text>
            </React.Fragment>
        );
    });

    // Fine radial nicks around the rim — the detail that stops a filled circle
    // from reading as a sticker.
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
             style={{ display: 'block', touchAction: 'none', cursor: 'ns-resize' }}>
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
            <circle cx={cx} cy={cy} r={bodyR * 0.62} fill={`url(#${uid}c)`} stroke="#0a0a0a" strokeWidth={0.8} />
            <line x1={px1} y1={py1} x2={px2} y2={py2} stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
        </svg>
    );
};

/**
 * skin 'arc': a thin ring with the value swept into it and a pointer line. The
 * mixer's own knob — small, legible at a glance down a row of sixteen, and
 * BIPOLAR-aware, because a pan control has to show its travel from the centre
 * rather than from the left end stop.
 */
const ArcSkin = ({ size, cur, min, span, color, bipolar }) => {
    const r = size / 2;
    const track = r - 5;
    const angle = angleOf(cur, min, span);
    const pt = (rad, a) => window.oaUiPolar(r, r, rad, a);

    const arcPath = (a0, a1) => {
        const [x0, y0] = pt(track, a0);
        const [x1, y1] = pt(track, a1);
        return `M ${x0} ${y0} A ${track} ${track} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1} ${y1}`;
    };

    const [px1, py1] = pt(track * 0.30, angle);
    const [px2, py2] = pt(track * 0.86, angle);
    const from = bipolar ? 0 : -SWEEP;

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
             style={{ display: 'block', touchAction: 'none', cursor: 'ns-resize' }}>
            <path d={arcPath(-SWEEP, SWEEP)} fill="none" stroke="#3a3f47" strokeWidth={3} strokeLinecap="round" />
            {Math.abs(angle - from) > 0.5 && (
                <path d={arcPath(from, angle)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
            )}
            <circle cx={r} cy={r} r={track * 0.72} fill="#23262b" stroke="#111" strokeWidth={1} />
            <line x1={px1} y1={py1} x2={px2} y2={py2} stroke={color} strokeWidth={2} strokeLinecap="round" />
        </svg>
    );
};

const SKINS = { rack: RackSkin, arc: ArcSkin };

/**
 * The knob. `skin` chooses the drawing; everything else is the same control
 * whichever one is picked.
 */
window.UiKnob = ({
    value = 0, min = 0, max = 1, defaultVal = 0, ticks, bipolar = false,
    color = 'var(--accent)', size = 42, skin = 'arc', title, onChange, style,
}) => {
    const g = useKnobGesture({ value, min, max, defaultVal, onChange });
    const Skin = SKINS[skin] || ArcSkin;
    return (
        <div title={title}
             onPointerDown={g.onPointerDown}
             onWheel={g.onWheel}
             style={{ display: 'inline-block', lineHeight: 0, ...style }}>
            <Skin size={size} cur={g.cur} min={min} span={g.span}
                  ticks={ticks} color={color} bipolar={bipolar} />
        </div>
    );
};

/**
 * A knob with its name over it and its value under it — the arrangement every
 * panel here uses, repeated in every panel here.
 */
window.UiKnobCell = ({ label, value, display, children, width = 62 }) => {
    const T = window.OA_UI;
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '2px', width: `${width}px`
        }}>
            <window.UiEngraved size={7} style={{ letterSpacing: '1.6px' }}>{label}</window.UiEngraved>
            {children}
            <span style={{
                fontFamily: T.MONO, fontSize: '8px', color: T.INK, letterSpacing: '.5px'
            }}>{display != null ? display : value}</span>
        </div>
    );
};
