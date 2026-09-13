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

// A single waveform thumbnail — decodes its file to render the wave, but only
// once it scrolls into view (a recursive folder scan can yield thousands).
window.WaveThumb = ({ entry, selected, onSelect, scrollRootRef }) => {
    const canvasRef = React.useRef(null);
    const wrapRef = React.useRef(null);
    const [visible, setVisible] = React.useState(false);
    React.useEffect(() => {
        const el = wrapRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
        const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { setVisible(true); io.disconnect(); } }, { root: (scrollRootRef && scrollRootRef.current) || null, rootMargin: '200px' });
        io.observe(el);
        return () => io.disconnect();
    }, []);
    // Canvases keep the colour they were painted with, so a theme change has to
    // ask for a repaint by hand. The decoded buffer is kept rather than re-read:
    // re-decoding every visible thumbnail on a colour change would stall the
    // grid for a scan's worth of files.
    const bufRef = React.useRef(null);
    const paint = React.useCallback(() => {
        if (bufRef.current) {
            window.drawWave(canvasRef.current, bufRef.current, selected ? window.oaAccentMix(0.35) : window.oaAccent());
        }
    }, [selected]);
    React.useEffect(() => window.oaOnAccent(paint), [paint]);
    React.useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        (async () => {
            try {
                const file = entry.file || await entry.handle.getFile();
                const buf = await window.oaDecodeAudio(window.oaAudioCtx(), await file.arrayBuffer());
                if (!cancelled) { bufRef.current = buf; paint(); }
            } catch (e) { /* undecodable — leave blank */ }
        })();
        return () => { cancelled = true; };
    }, [entry, visible, paint]);
    return (
        <div ref={wrapRef} onClick={onSelect} title={entry.sub ? `${entry.sub}/${entry.name}` : entry.name}
            style={{ border: selected ? '2px solid var(--accent)' : '1px solid #444', borderRadius: '4px', padding: '4px', cursor: 'pointer', background: selected ? '#2a2018' : '#141414', boxSizing: 'border-box' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '46px', display: 'block', background: '#0a0a0a' }} />
            <div style={{ fontSize: '10px', color: selected ? 'var(--accent)' : '#bbb', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</div>
        </div>
    );
};
