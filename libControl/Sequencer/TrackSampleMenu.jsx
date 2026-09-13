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

// Per-track sample menu: waveform + pitch + time-shift, opened by clicking a
// track name. Edits the shared kit entry (OA_DRUM_SAMPLES[trkIdx]) directly.
window.TrackSampleMenu = ({ trkIdx, trackName, anchor, version, onBrowse, onClose, onChange }) => {
    const entry = (window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[trkIdx]) || null;
    const hasBuf = !!(entry && entry.buffer);
    const canvasRef = React.useRef(null);
    const semiFromPitch = (p) => Math.round(12 * Math.log2(p || 1));
    const [pitchSemi, setPitchSemi] = React.useState(semiFromPitch(entry && entry.pitch));
    const [offset, setOffset] = React.useState((entry && entry.offset) || 0);
    const [loop, setLoop] = React.useState(!!(entry && entry.loop));
    const [end, setEnd] = React.useState((entry && entry.end != null) ? entry.end : (entry && entry.buffer ? entry.buffer.duration : 0));

    React.useEffect(() => {
        const e = window.OA_DRUM_SAMPLES[trkIdx];
        setPitchSemi(semiFromPitch(e && e.pitch));
        setOffset((e && e.offset) || 0);
        setLoop(!!(e && e.loop));
        setEnd((e && e.end != null) ? e.end : (e && e.buffer ? e.buffer.duration : 0));
    }, [version]);

    React.useEffect(() => {
        const c = canvasRef.current; if (!c) return;
        c.width = c.clientWidth; c.height = c.clientHeight;
        const cx = c.getContext('2d');
        cx.fillStyle = '#0a0a0a'; cx.fillRect(0, 0, c.width, c.height);
        const e = window.OA_DRUM_SAMPLES[trkIdx];
        if (!e || !e.buffer) return;
        const data = e.buffer.getChannelData(0);
        const step = Math.ceil(data.length / c.width); const amp = c.height / 2;
        cx.strokeStyle = window.oaAccent(); cx.beginPath();
        for (let x = 0; x < c.width; x++) { let mn = 1, mx = -1; for (let j = 0; j < step; j++) { const d = data[x * step + j]; if (d === undefined) break; if (d < mn) mn = d; if (d > mx) mx = d; } cx.moveTo(x, (1 + mn) * amp); cx.lineTo(x, (1 + mx) * amp); }
        cx.stroke();
        if (e.buffer.duration) {
            const ox = (e.offset || 0) / e.buffer.duration * c.width; cx.strokeStyle = window.oaAccentMix(0.35); cx.beginPath(); cx.moveTo(ox, 0); cx.lineTo(ox, c.height); cx.stroke();
            const endSec = (e.end != null ? e.end : e.buffer.duration);
            const ex = endSec / e.buffer.duration * c.width; cx.strokeStyle = '#e57373'; cx.beginPath(); cx.moveTo(ex, 0); cx.lineTo(ex, c.height); cx.stroke();
        }
    }, [version, offset, end]);

    const applyPitch = (s) => { setPitchSemi(s); window.oaUpdateDrumSample(trkIdx, { pitch: Math.pow(2, s / 12) }); onChange && onChange(); };
    const applyOffset = (o) => { setOffset(o); window.oaUpdateDrumSample(trkIdx, { offset: o }); onChange && onChange(); };
    const applyLoop = (b) => {
        setLoop(b);
        window.oaUpdateDrumSample(trkIdx, { loop: b });
        // Checking Loop starts a looping preview immediately; unchecking stops it.
        const loops = window.OA_DRUM_LOOPS || (window.OA_DRUM_LOOPS = {});
        const existing = loops[trkIdx];
        if (existing) { try { existing.stop(); } catch (e) {} loops[trkIdx] = null; }
        if (b && hasBuf && window.oaTriggerDrum) window.oaTriggerDrum(trkIdx, 1);
        onChange && onChange();
    };
    const applyEnd = (val) => { setEnd(val); window.oaUpdateDrumSample(trkIdx, { end: val }); onChange && onChange(); };
    const dur = hasBuf ? entry.buffer.duration : 0;

    return (
        <React.Fragment>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999 }} />
            <div style={{ position: 'fixed', zIndex: 10000, width: '300px', top: Math.min(anchor.y, window.innerHeight - 340), left: Math.min(anchor.x, window.innerWidth - 320), background: '#1c1c1c', border: '1px solid var(--accent)', borderRadius: '6px', padding: '12px', color: '#eee', boxShadow: '0 8px 30px rgba(0,0,0,0.6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '13px' }}>{trackName}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }}>×</button>
                </div>
                <div title={hasBuf ? (entry.name || 'sample') : 'Synth voice — no sample loaded'} style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {hasBuf ? (entry.name || 'sample') : 'Synth voice — no sample loaded'}
                </div>
                <div style={{ width: '100%', height: '56px', background: '#0a0a0a', border: '1px solid #444' }}>
                    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                    <button onClick={onBrowse} style={{ flex: 1, background: 'var(--accent)', color: '#111', border: 'none', borderRadius: '3px', padding: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>📁 Browse sample…</button>
                    <label title="Loop the sample (Sampler pad hold)" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#ccc', cursor: 'pointer' }}>
                        <input type="checkbox" checked={loop} disabled={!hasBuf} onChange={(e) => applyLoop(e.target.checked)} /> Loop
                    </label>
                    <button onClick={() => window.oaTriggerDrum && window.oaTriggerDrum(trkIdx, 1)} title="Preview" style={{ background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '3px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px' }}>►</button>
                </div>
                <div style={{ marginTop: '10px', opacity: hasBuf ? 1 : 0.4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa' }}><span>PITCH</span><span style={{ color: 'var(--accent)' }}>{pitchSemi > 0 ? '+' : ''}{pitchSemi} st</span></div>
                    <input type="range" min="-12" max="12" step="1" value={pitchSemi} disabled={!hasBuf} onChange={(e) => applyPitch(Number(e.target.value))} style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa', marginTop: '6px' }}><span style={{ color: 'var(--accent-t15)' }}>TIME SHIFT (start)</span><span style={{ color: 'var(--accent)' }}>{offset.toFixed(3)}s</span></div>
                    <input type="range" min="0" max={dur ? Number((dur * 0.9).toFixed(3)) : 0} step="0.001" value={offset} disabled={!hasBuf} onChange={(e) => applyOffset(Number(e.target.value))} style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa', marginTop: '6px' }}><span style={{ color: '#e57373' }}>END / CUT-OFF</span><span style={{ color: 'var(--accent)' }}>{Number(end || 0).toFixed(3)}s{dur && Math.abs((end || 0) - dur) < 0.0005 ? ' (EOF)' : ''}</span></div>
                    <input type="range" min="0.01" max={dur ? Number(dur.toFixed(3)) : 0} step="0.001" value={Math.min(end || 0, dur || 0)} disabled={!hasBuf} onChange={(e) => applyEnd(Math.max(offset + 0.01, Number(e.target.value)))} style={{ width: '100%' }} />
                </div>
            </div>
        </React.Fragment>
    );
};
