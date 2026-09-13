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
 * The browser's big waveform, with the chop drawn on it.
 *
 * Four handles: IN and OUT, and a fade handle inside each of them. Whatever is
 * outside IN…OUT is greyed off — it is not part of the sound any more — and the
 * fades are drawn as the ramps they actually are. Everything is draggable, and
 * I / O set the two marks at the playhead so a sound can be chopped while it
 * plays without going anywhere near a handle.
 *
 * Clicking anywhere else on the waveform still scrubs, as it always did.
 */
window.WaveTrim = ({ buffer, trim, setTrimPoint, pos, onScrub, active, beatMarkers, chunkMaps }) => {
    const canvasRef = React.useRef(null);
    const boxRef = React.useRef(null);
    const dragRef = React.useRef(null);
    const [accentTick, setAccentTick] = React.useState(0);

    // A canvas keeps whatever it was last painted with, so unlike every
    // var(--accent) style around it, it does not follow a theme change on its own.
    React.useEffect(() => window.oaOnAccent(() => setAccentTick((n) => n + 1)), []);
    React.useEffect(() => { window.drawWave(canvasRef.current, buffer, window.oaAccent()); }, [buffer, accentTick]);

    const dur = buffer ? buffer.duration : 0;
    const t = trim || { in: 0, out: dur, fadeIn: 0, fadeOut: 0 };
    const pc = (sec) => (dur ? Math.max(0, Math.min(100, (sec / dur) * 100)) : 0);

    const inX = pc(t.in), outX = pc(t.out);
    const fiX = pc(t.in + t.fadeIn), foX = pc(t.out - t.fadeOut);

    const secAt = (clientX) => {
        const r = boxRef.current.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width))) * dur;
    };

    // Each handle captures the pointer itself, so a fast drag that outruns the
    // cursor keeps its grip, and the click never reaches the scrub underneath.
    const handleProps = (which) => ({
        onPointerDown: (e) => {
            if (!dur) return;
            e.stopPropagation(); e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = which;
            setTrimPoint(which, secAt(e.clientX));
        },
        onPointerMove: (e) => { if (dragRef.current === which) setTrimPoint(which, secAt(e.clientX)); },
        onPointerUp: (e) => { dragRef.current = null; e.stopPropagation(); },
        onPointerCancel: () => { dragRef.current = null; },
        onClick: (e) => e.stopPropagation(),
    });

    const grip = (label, colour, title) => (
        <span title={title} style={{
            position: 'absolute', top: 0, fontSize: '9px', fontWeight: 'bold', lineHeight: '12px',
            padding: '0 3px', background: colour, color: '#111', borderRadius: '0 0 3px 3px', pointerEvents: 'none',
        }}>{label}</span>
    );

    return (
        <div ref={boxRef} onClick={onScrub}
            style={{ position: 'relative', width: '100%', height: '72px', background: '#0a0a0a', border: '1px solid #444', cursor: active ? 'pointer' : 'default', touchAction: 'none', overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

            {active && (
                <React.Fragment>
                    {/* Everything outside IN…OUT is not part of the sound. */}
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${inX}%`, background: 'rgba(0,0,0,0.66)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${outX}%`, right: 0, background: 'rgba(0,0,0,0.66)', pointerEvents: 'none' }} />

                    {/* The fades, as ramps. Non-uniform scaling is what lets the
                        geometry be written in percentages; the stroke opts out
                        of it so the lines stay 1px at any width. */}
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                        {t.fadeIn > 0 && (
                            <polygon points={`${inX},0 ${fiX},0 ${inX},100`} fill="rgba(0,0,0,0.55)" stroke="var(--accent)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        )}
                        {t.fadeOut > 0 && (
                            <polygon points={`${foX},0 ${outX},0 ${outX},100`} fill="rgba(0,0,0,0.55)" stroke="#e57373" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        )}
                    </svg>

                    {/* IN */}
                    <div {...handleProps('in')} title={`IN — ${t.in.toFixed(3)}s (drag, or press I at the playhead)`}
                        style={{ position: 'absolute', top: 0, bottom: 0, left: `${inX}%`, width: '14px', marginLeft: '-7px', cursor: 'ew-resize' }}>
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '6px', width: '2px', background: 'var(--accent)' }} />
                        {grip('I', 'var(--accent)', '')}
                    </div>
                    {/* OUT */}
                    <div {...handleProps('out')} title={`OUT — ${t.out.toFixed(3)}s (drag, or press O at the playhead)`}
                        style={{ position: 'absolute', top: 0, bottom: 0, left: `${outX}%`, width: '14px', marginLeft: '-7px', cursor: 'ew-resize' }}>
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '6px', width: '2px', background: '#e57373' }} />
                        <span style={{ position: 'absolute', top: 0, right: 0, fontSize: '9px', fontWeight: 'bold', lineHeight: '12px', padding: '0 3px', background: '#e57373', color: '#111', borderRadius: '0 0 3px 3px', pointerEvents: 'none' }}>O</span>
                    </div>
                    {/* FADE IN / FADE OUT — the far end of each ramp. */}
                    <div {...handleProps('fadeIn')} title={`FADE IN — ${t.fadeIn.toFixed(3)}s (drag, or Shift+I at the playhead)`}
                        style={{ position: 'absolute', top: 0, height: '16px', left: `${fiX}%`, width: '14px', marginLeft: '-7px', cursor: 'ew-resize' }}>
                        <div style={{ position: 'absolute', top: '2px', left: '4px', width: '6px', height: '6px', background: 'var(--accent)', transform: 'rotate(45deg)' }} />
                    </div>
                    <div {...handleProps('fadeOut')} title={`FADE OUT — ${t.fadeOut.toFixed(3)}s (drag, or Shift+O at the playhead)`}
                        style={{ position: 'absolute', top: 0, height: '16px', left: `${foX}%`, width: '14px', marginLeft: '-7px', cursor: 'ew-resize' }}>
                        <div style={{ position: 'absolute', top: '2px', left: '4px', width: '6px', height: '6px', background: '#e57373', transform: 'rotate(45deg)' }} />
                    </div>

                    {/* BEAT MARKERS OVERLAY */}
                    {beatMarkers && beatMarkers.length > 0 && (
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
                            {beatMarkers.map((bm, bIdx) => {
                                const bx = pc(bm.timestamp_seconds);
                                return (
                                    <line key={bIdx} x1={bx} y1="0" x2={bx} y2="100"
                                        stroke={bm.is_downbeat ? 'var(--accent)' : 'rgba(255,255,255,0.25)'}
                                        strokeWidth={bm.is_downbeat ? '1.5' : '0.8'}
                                        strokeDasharray={bm.is_downbeat ? 'none' : '2,2'}
                                        vectorEffect="non-scaling-stroke" />
                                );
                            })}
                        </svg>
                    )}

                    {/* CHUNK NOTE TAGS OVERLAY */}
                    {chunkMaps && chunkMaps.length > 0 && (
                        <div style={{ position: 'absolute', bottom: '2px', left: 0, right: 0, height: '18px', pointerEvents: 'none', zIndex: 2 }}>
                            {chunkMaps.map((cm, cIdx) => {
                                const cx0 = pc(cm.start_seconds);
                                return (
                                    <span key={cIdx} style={{
                                        position: 'absolute', left: `${cx0}%`, bottom: '2px',
                                        fontSize: '9px', fontWeight: 'bold', padding: '1px 4px',
                                        background: 'rgba(20,20,20,0.85)', color: 'var(--accent)',
                                        border: '1px solid var(--accent)', borderRadius: '3px',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        🎵 {cm.root_note_name}
                                    </span>
                                );
                            })}
                        </div>
                    )}

                    {/* No playhead where there is nothing playing to follow —
                        the SAMPLER panel edits a pad that fires and is gone. */}
                    {pos != null && <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos * 100}%`, width: '2px', background: '#fff', pointerEvents: 'none', zIndex: 3 }} />}
                </React.Fragment>
            )}
        </div>
    );
};
