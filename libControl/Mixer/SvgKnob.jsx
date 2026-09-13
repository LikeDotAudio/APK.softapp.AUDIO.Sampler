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

// `label` and `display` are what the drag overlay says — the knob's engraved
// name and the value as the panel beside it would print it. Without them the
// overlay still appears, showing the raw number.
const SvgKnob = ({ value = 0, min = 0, max = 1, defaultVal = 0, bipolar = false, color = "var(--accent)", size = 42, label, display, onChange }) => {
    const cx = size / 2, cy = size / 2, R = size / 2 - 3, bodyR = R - 4;
    const [uid] = React.useState(() => "k" + Math.random().toString(36).slice(2, 8));
    
    const rad = d => d * Math.PI / 180;
    const pt = (r, a) => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];
    const arc = (rr, a0, a1) => {
        const p0 = pt(rr, a0), p1 = pt(rr, a1);
        const large = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 >= a0 ? 1 : 0;
        return `M ${p0[0]} ${p0[1]} A ${rr} ${rr} 0 ${large} ${sweep} ${p1[0]} ${p1[1]}`;
    };

    // A knob with no writer is a READOUT, and it must refuse the GESTURE, not
    // merely fail to write — a control that still moves under the hand and is
    // heard by nothing is the failure this repository's first law names.
    // PLAN-18.12: guarded here rather than in each faceplate, because SvgKnob
    // is the shared one and DriveEditor, DrumSynthEditor, UiKnob and Mixer all
    // draw through it. RackKnob and BussKnob carry the identical three lines.
    const live = typeof onChange === 'function';

    const clampV = v => Math.max(min, Math.min(max, v));
    const cur = clampV(value);
    const angleFor = v => (((v - min) / ((max - min) || 1)) * 2 - 1) * 135;
    
    const a = angleFor(cur);
    const [ix, iy] = pt(bodyR * 0.32, a);
    const [ox, oy] = pt(bodyR * 0.9, a);

    const readout = window.useOaReadout({
        label, color, bipolar,
        display: display != null ? display : cur,
        pct: ((cur - min) / ((max - min) || 1)) * 100,
    });

    const handlePointerDown = (e) => {
        if (!live) return;
        if (e.altKey) { onChange(defaultVal); return; }
        readout.begin(e);
        const startY = e.clientY;
        const startV = cur;
        e.target.setPointerCapture(e.pointerId);
        
        const move = (em) => {
            const nv = Math.round((startV + ((startY - em.clientY) / 150) * (max - min)) * 100) / 100;
            onChange(clampV(nv));
        };
        const up = (eu) => {
            e.target.removeEventListener('pointermove', move);
            e.target.removeEventListener('pointerup', up);
            e.target.removeEventListener('pointercancel', up);
            try { e.target.releasePointerCapture(eu.pointerId); } catch(x){}
        };
        e.target.addEventListener('pointermove', move);
        e.target.addEventListener('pointerup', up);
        e.target.addEventListener('pointercancel', up);
        e.preventDefault();
    };

    const handleWheel = (e) => {
        if (!live) return;
        e.preventDefault();
        const delta = (e.deltaY < 0 ? 1 : -1) * (max - min) / 50;
        onChange(clampV(cur + delta));
    };

    const flLines = [];
    const FL = 18;
    for (let i = 0; i < FL; i++) {
        const ang = i * (360 / FL);
        const [x1, y1] = pt(bodyR - 1, ang);
        const [x2, y2] = pt(bodyR - 5, ang);
        flLines.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#15171b" strokeWidth={1.2} opacity={0.7} />);
    }

    return (
        <svg 
            width={size} height={size} viewBox={`0 0 ${size} ${size}`} 
            style={{
                display: 'block', touchAction: 'none', overflow: 'visible',
                cursor: live ? 'ns-resize' : 'default',
                filter: live ? undefined : 'grayscale(1) brightness(0.6)',
                opacity: live ? undefined : 0.7,
            }}
            onPointerDown={handlePointerDown}
            onWheel={handleWheel}
        >
            <defs>
                <radialGradient id={uid} cx="38%" cy="30%" r="75%">
                    <stop offset="0%" stopColor="#6a6f78" />
                    <stop offset="55%" stopColor="#3a3e45" />
                    <stop offset="100%" stopColor="#1b1d22" />
                </radialGradient>
            </defs>
            <path d={arc(R, -135, 135)} fill="none" stroke="#444b57" strokeWidth={3} strokeLinecap="round" />
            <path d={arc(R, bipolar ? 0 : -135, a)} fill="none" style={{ stroke: color }} strokeWidth={3} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={bodyR} fill={`url(#${uid})`} stroke="#0a0a0a" strokeWidth={1} />
            {flLines}
            <line x1={ix} y1={iy} x2={ox} y2={oy} stroke="#eef1f5" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={Math.max(2, bodyR * 0.16)} fill="#23262c" stroke="#0a0a0a" strokeWidth={0.5} />
        </svg>
    );
};

window.SvgKnob = SvgKnob;
