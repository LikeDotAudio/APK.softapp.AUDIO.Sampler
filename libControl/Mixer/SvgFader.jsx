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

const DB_MIN = -60, DB_MAX = 12;
const MAX_GAIN = Math.pow(10, DB_MAX / 20);
const gainToPos = g => g <= 0 ? 0 : Math.max(0, Math.min(1, (20 * Math.log10(g) - DB_MIN) / (DB_MAX - DB_MIN)));
const posToGain = p => p <= 0.004 ? 0 : Math.pow(10, (DB_MIN + p * (DB_MAX - DB_MIN)) / 20);

// A fader reads in dB on its own scale, so that is what the drag overlay shows
// unless the caller hands over a `display` of its own. `label` names the thing
// being moved — which channel, which return.
const dbLabel = (g) => (g <= 0.0011 ? '-∞ dB' : `${(20 * Math.log10(g)).toFixed(1)} dB`);

const SvgFader = ({ value = 0, color = "var(--accent)", width = 50, height = 180, label, display, onChange }) => {
    // A tall cap, so it can be grabbed with a fingertip rather than a cursor.
    const thumbW = 30, thumbH = 34;
    // Half a cap of clearance at each end. The cap's CENTRE travels the slot,
    // so without this the top and bottom of it would hang outside the control
    // and sit over whatever is next to it in the strip.
    const padTop = thumbH / 2 + 2, padBot = padTop, travel = height - padTop - padBot;
    const slotCx = 14, slotW = 9, slotX = slotCx - slotW / 2;
    const yAt = p => padTop + (1 - p) * travel;

    const clampV = v => Math.max(0, Math.min(MAX_GAIN, v));
    const cur = clampV(value);
    const p = gainToPos(cur);
    const y = yAt(p);
    
    const readout = window.useOaReadout({
        label, color,
        display: display != null ? display : dbLabel(cur),
        pct: p * 100,
    });

    const handlePointerDown = (e) => {
        const svg = e.currentTarget;
        readout.begin(e);
        svg.setPointerCapture(e.pointerId);
        
        const update = (em) => {
            const r = svg.getBoundingClientRect();
            const np = Math.max(0, Math.min(1, 1 - ((em.clientY - (r.top + padTop)) / travel)));
            const nv = Math.round(posToGain(np) * 1000) / 1000;
            onChange(clampV(nv));
        };
        update(e);
        
        const move = (em) => update(em);
        const up = (eu) => {
            svg.removeEventListener('pointermove', move);
            svg.removeEventListener('pointerup', up);
            svg.removeEventListener('pointercancel', up);
            try { svg.releasePointerCapture(eu.pointerId); } catch(x){}
        };
        svg.addEventListener('pointermove', move);
        svg.addEventListener('pointerup', up);
        svg.addEventListener('pointercancel', up);
        e.preventDefault();
    };

    const ticks = [12, 6, 0, -6, -12, -24, -40].map(db => {
        const ty = yAt((db - DB_MIN) / (DB_MAX - DB_MIN));
        const zero = db === 0;
        return (
            <g key={db}>
                <line x1={slotX + slotW + 1} y1={ty} x2={slotX + slotW + 1 + (zero ? 7 : 4)} y2={ty} stroke={zero ? "#cfd6e0" : "#6b7280"} strokeWidth={zero ? 1.5 : 1} />
                <text x={slotX + slotW + 12} y={ty + 3} fontSize={7} fontFamily="Arial" fill={zero ? "#cfd6e0" : "#7b828c"}>{db > 0 ? "+" + db : db}</text>
            </g>
        );
    });

    const thumbX = slotCx - thumbW / 2;

    return (
        <svg 
            width={width} height={height} viewBox={`0 0 ${width} ${height}`}
            style={{ display: 'block', touchAction: 'none', cursor: 'ns-resize', overflow: 'visible' }}
            onPointerDown={handlePointerDown}
        >
            <rect x={slotX} y={padTop} width={slotW} height={travel} rx={4} fill="#050505" stroke="#222" />
            <rect x={slotX} y={y} width={slotW} height={Math.max(0, (padTop + travel) - y)} rx={4} style={{ fill: color }} opacity={0.5} />
            {ticks}
            <g transform={`translate(${thumbX}, ${y - thumbH / 2})`}>
                <rect width={thumbW} height={thumbH} rx={4} fill="#dcdcdc" stroke="#555" />
                {/* Grip ridges, so a cap this tall still reads as a cap — the
                    dark centre line is the one that marks the value. */}
                {[-9, -6, 6, 9].map((d) => (
                    <line key={d} x1={5} y1={thumbH / 2 + d} x2={thumbW - 5} y2={thumbH / 2 + d}
                          stroke="#b4b4b4" strokeWidth={2} />
                ))}
                <line x1={3} y1={thumbH / 2} x2={thumbW - 3} y2={thumbH / 2} stroke="#333" strokeWidth={2} />
            </g>
        </svg>
    );
};

window.SvgFader = SvgFader;
