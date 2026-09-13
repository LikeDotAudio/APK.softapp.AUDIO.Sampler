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
 * The pitch wheel, laid on its side under the pads.
 *
 * It is the SAME control as the keyboard's wheel, not a copy of it: the
 * hardware wheel moves this one (useMidiPads reads it and calls oaSetPitchBend,
 * which announces itself), and dragging this one bends the hardware's notes
 * (same function, same standing offset).
 *
 * And like the wheel upstairs it LATCHES. Let go of a sprung wheel and it
 * returns home; let go of this one and the pitch stays exactly where it was
 * dropped, which is what makes it usable for tuning a pad by ear and then
 * playing it there. ⟲ (or a double-click) is the way back to no bend.
 */
window.PitchWheel = ({ maxWidth = 460 }) => {
    const range = window.OA_BEND_RANGE || 200;
    const [cents, setCents] = React.useState(() => window.OA_PITCH_BEND || 0);
    // Which pad the wheel is holding. It follows the last pad played, so the
    // bar always reads the tuning of the sound you just heard.
    const [pad, setPad] = React.useState(() => window.OA_BEND_PAD || 0);
    const trackRef = React.useRef(null);
    const dragRef = React.useRef(false);

    // Whichever wheel moved — this one, the keyboard's, or a pad being struck —
    // they all read the same.
    React.useEffect(() => {
        const onBend = (e) => {
            setCents((e.detail && e.detail.cents) || 0);
            if (e.detail && e.detail.idx != null) setPad(e.detail.idx);
        };
        window.addEventListener('oa-pitch-bend', onBend);
        // A bend set before this mounted (a wheel nudged on the Sequencer tab)
        // never fires an event this component is around to hear.
        setCents(window.OA_PITCH_BEND || 0);
        setPad(window.OA_BEND_PAD || 0);
        return () => window.removeEventListener('oa-pitch-bend', onBend);
    }, []);

    const padName = (window.OA_DRUM_KIT && window.OA_DRUM_KIT[pad] && window.OA_DRUM_KIT[pad].name) || `Pad ${pad + 1}`;

    const apply = (c) => {
        const v = Math.max(-range, Math.min(range, c));
        if (window.oaSetPitchBend) window.oaSetPitchBend(v);
        else setCents(v);            // no audio engine (a bare mount in a test)
    };

    const centsAt = (clientX) => {
        const r = trackRef.current.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
        const c = (t * 2 - 1) * range;
        // A detent at zero — the middle of the travel should be findable by
        // hand, the way the notch in a real wheel is.
        return Math.abs(c) < range * 0.04 ? 0 : c;
    };

    const p = (cents / range + 1) / 2;               // 0 (flat) … 0.5 … 1 (sharp)
    const lo = Math.min(0.5, p), hi = Math.max(0.5, p);
    const semis = cents / 100;
    const label = `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${Math.abs(Math.round(cents))}¢`;

    // Bipolar, because the wheel's own travel is drawn from the centre out.
    const readout = window.useOaReadout({ label: 'Pitch bend', display: label, pct: p * 100, bipolar: true });

    return (
        <div style={{ width: '100%', maxWidth: `${maxWidth}px`, marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', boxSizing: 'border-box', padding: '0 4px' }}>
            {/* The wheel tunes ONE pad — whichever was played last — so it says
                which, or a bend would look like it had gone missing when the
                next pad's (untouched) tuning came up. */}
            <span title={`The wheel is holding ${padName}. Play another pad and it takes that pad's tuning.`}
                style={{ fontSize: '9px', fontWeight: 'bold', color: '#888', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
                PITCH <b style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{padName}</b>
            </span>

            <div
                ref={trackRef}
                title={`Pitch wheel — ±${range}¢ (${(range / 100).toFixed(0)} semitones).\nDrag to bend; it HOLDS where you let go, and every note played keeps that pitch.\nDouble-click or ⟲ to return to zero.`}
                onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragRef.current = true;
                    readout.begin(e);
                    apply(centsAt(e.clientX));
                }}
                onPointerMove={(e) => { if (dragRef.current) apply(centsAt(e.clientX)); }}
                onPointerUp={() => { dragRef.current = false; }}      // latched — nothing springs back
                onPointerCancel={() => { dragRef.current = false; }}
                onDoubleClick={() => apply(0)}
                style={{
                    position: 'relative', flex: 1, height: '30px', minWidth: 0,
                    background: 'linear-gradient(#0b0b0b, #191919)',
                    border: '1px solid #000', borderTop: '1px solid #3a3a3a',
                    borderRadius: '15px', overflow: 'hidden',
                    boxShadow: 'inset 0 2px 7px rgba(0,0,0,0.85)',
                    cursor: 'ew-resize', touchAction: 'none'
                }}>
                {/* How far from centre, drawn from centre. */}
                <div style={{
                    position: 'absolute', top: '3px', bottom: '3px',
                    left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`,
                    background: cents === 0 ? 'transparent' : 'var(--accent-t15)', opacity: 0.5
                }} />
                {/* Centre detent, and the ends of the travel. */}
                <div style={{ position: 'absolute', left: '50%', top: '4px', bottom: '4px', width: '1px', background: '#666' }} />
                <div style={{ position: 'absolute', left: '6px', top: '12px', bottom: '12px', width: '2px', background: '#333' }} />
                <div style={{ position: 'absolute', right: '6px', top: '12px', bottom: '12px', width: '2px', background: '#333' }} />
                {/* The wheel itself: knurled, and lit when it is off centre. */}
                <div style={{
                    position: 'absolute', top: '2px', bottom: '2px', width: '26px',
                    left: `calc(13px + ${p} * (100% - 26px))`, transform: 'translateX(-13px)',
                    borderRadius: '5px',
                    background: 'repeating-linear-gradient(90deg, #1e1e1e 0px, #1e1e1e 1px, #575757 1px, #575757 3px)',
                    borderTop: '1px solid #7a7a7a', borderBottom: '1px solid #000',
                    boxShadow: cents === 0 ? '0 1px 4px rgba(0,0,0,0.8)' : '0 0 10px 1px rgba(var(--accent-rgb), 0.55)',
                    pointerEvents: 'none'
                }} />
            </div>

            <span style={{ fontSize: '11px', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums', color: cents === 0 ? '#777' : 'var(--accent)', minWidth: '46px', textAlign: 'right' }}
                title={`${semis >= 0 ? '+' : '−'}${Math.abs(semis).toFixed(2)} semitones`}>
                {label}
            </span>

            <button
                onClick={() => apply(0)}
                disabled={cents === 0}
                title="Return the wheel to centre (no bend)"
                style={{
                    background: cents === 0 ? '#222' : 'var(--accent-t15)', color: cents === 0 ? '#666' : '#111',
                    border: '1px solid #444', borderRadius: '3px', padding: '3px 7px',
                    fontSize: '11px', fontWeight: 'bold', cursor: cents === 0 ? 'default' : 'pointer'
                }}>⟲</button>
        </div>
    );
};
