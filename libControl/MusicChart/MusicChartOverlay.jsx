// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MUSIC CHART & LYRIC OVERLAY UI
 *
 * Renders an interactive music chart timeline displaying:
 * - Structural song sections (Intro, Verse, Chorus, Bridge, Outro)
 * - Interactive chord progression blocks
 * - Note pitch contour & key changes
 * - Vocal-section cue points
 *
 * THE VOCAL CUES TAB IS NOT A LYRIC VIEW. `oaDeepScanAudio` runs no speech
 * recognition, so `data.lyrics` is always empty; what this draws is
 * `data.vocal_section_cues`, eight evenly spaced seek points inside each Verse
 * or Chorus. It said "Synchronized Vocal & Lyric Alignment Map" over sixteen
 * chips reading `[Vocal Word 1]`…`[Vocal Word 16]` until PLAN-570.01. If the
 * scanner ever fills `lyrics`, THAT is what a lyric view draws.
 *
 * `filename` NAMES THE BUFFER, and it is not decoration. Chop to 16 Pads writes
 * `<filename> — <section>` onto all sixteen pads, so a wrong name here is
 * printed sixteen times on the surface the visitor plays from. It is the
 * caller's job to supply it because only the caller knows where `audioBuffer`
 * came from — a pad's loaded sample, a recording, a cloud pick. Absent or
 * empty, oaChopSongToPads falls back to `Track`, which is honest; a
 * placeholder that looks like a real file is not.
 */

window.MusicChartOverlay = ({ chartData, audioBuffer, filename, trim, setTrimPoint, headPos, onPlayChord }) => {
    const [activeTab, setActiveTab] = React.useState('chart'); // 'chart' | 'notes' | 'cues'
    const [scanning, setScanning] = React.useState(false);
    // `{ frame, totalFrames }` from the scan's own yields, or null before the
    // first one. See `oaDeepScanner.js` for why this is frames rather than a
    // percentage; the button below is narrow, so it draws the numerator only
    // and lets the count itself be the evidence that something is happening.
    const [scanProgress, setScanProgress] = React.useState(null);
    const [data, setData] = React.useState(chartData || null);

    React.useEffect(() => {
        if (chartData) setData(chartData);
    }, [chartData]);

    const runDeepScan = async () => {
        if (!audioBuffer) return;
        setScanning(true);
        setScanProgress(null);
        try {
            const res = await window.oaDeepScanAudio(audioBuffer, setScanProgress);
            setData(res);
        } catch (e) {
            console.error("Deep Scan failed:", e);
        }
        setScanning(false);
    };

    const dur = audioBuffer ? audioBuffer.duration : (data ? data.duration_seconds : 1);
    const pc = (sec) => (dur ? Math.max(0, Math.min(100, (sec / dur) * 100)) : 0);

    return (
        <div style={{ background: '#121212', border: '1px solid #333', borderRadius: '6px', padding: '10px', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px' }}>
                    📊 MUSIC CHART & LYRIC OVERLAY
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={runDeepScan} disabled={scanning || !audioBuffer}
                        style={{
                            fontSize: '10px', padding: '3px 8px', background: 'var(--accent)', color: '#111',
                            border: 'none', borderRadius: '3px', fontWeight: 'bold', cursor: 'pointer'
                        }}>
                        {scanning
                            ? (scanProgress
                                ? `Scanning… ${scanProgress.frame.toLocaleString()}/${scanProgress.totalFrames.toLocaleString()}`
                                : 'Scanning…')
                            : '⚡ Deep Scan Song'}
                    </button>
                    <button onClick={() => {
                        if (audioBuffer && window.oaChopSongToPads) {
                            window.oaChopSongToPads(audioBuffer, filename, data);
                        }
                    }} disabled={!audioBuffer}
                        style={{
                            fontSize: '10px', padding: '3px 8px', background: '#388e3c', color: '#fff',
                            border: 'none', borderRadius: '3px', fontWeight: 'bold', cursor: 'pointer'
                        }} title="Map song chunks directly onto pads 1..16 as a sample bank!">
                        🎛️ Chop to 16 Pads
                    </button>
                    <button onClick={() => setActiveTab('chart')}
                        style={{
                            fontSize: '10px', padding: '3px 6px', background: activeTab === 'chart' ? '#333' : '#222',
                            color: activeTab === 'chart' ? 'var(--accent)' : '#aaa', border: '1px solid #444', borderRadius: '3px'
                        }}>
                        Chart Timeline
                    </button>
                    <button onClick={() => setActiveTab('notes')}
                        style={{
                            fontSize: '10px', padding: '3px 6px', background: activeTab === 'notes' ? '#333' : '#222',
                            color: activeTab === 'notes' ? 'var(--accent)' : '#aaa', border: '1px solid #444', borderRadius: '3px'
                        }}>
                        Notes & Pitch
                    </button>
                    <button onClick={() => setActiveTab('cues')}
                        style={{
                            fontSize: '10px', padding: '3px 6px', background: activeTab === 'cues' ? '#333' : '#222',
                            color: activeTab === 'cues' ? 'var(--accent)' : '#aaa', border: '1px solid #444', borderRadius: '3px'
                        }}>
                        Vocal Cues
                    </button>
                </div>
            </div>

            {!data ? (
                <div style={{ fontSize: '11px', color: '#777', padding: '12px', textAlign: 'center', background: '#0a0a0a', borderRadius: '4px' }}>
                    Press <b>⚡ Deep Scan Song</b> to generate key change, chord progression, and lyric word chart.
                </div>
            ) : (
                <div>
                    {/* CHART TIMELINE OVERLAY */}
                    {activeTab === 'chart' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {/* SECTION CHUNKS LANE */}
                            <div style={{ position: 'relative', height: '24px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '3px', overflow: 'hidden' }}>
                                {data.sections && data.sections.map((sec, idx) => (
                                    <div key={idx} onClick={() => {
                                        if (setTrimPoint) {
                                            setTrimPoint('in', sec.start_seconds);
                                            setTrimPoint('out', sec.end_seconds);
                                        }
                                    }} style={{
                                        position: 'absolute', left: `${pc(sec.start_seconds)}%`, width: `${pc(sec.duration_seconds)}%`,
                                        top: 0, bottom: 0, background: idx % 2 === 0 ? 'rgba(76,175,80,0.25)' : 'rgba(33,150,243,0.25)',
                                        borderLeft: '1px solid var(--accent)', padding: '2px 4px', fontSize: '9px', color: '#fff',
                                        cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }} title={`Click to Chop ${sec.label} (${sec.key_center})`}>
                                        {sec.label} ({sec.key_center})
                                    </div>
                                ))}
                            </div>

                            {/* CHORD PROGRESSION LANE */}
                            <div style={{ position: 'relative', height: '26px', background: '#181818', border: '1px solid #333', borderRadius: '3px', overflowX: 'auto', display: 'flex', alignItems: 'center', padding: '2px' }}>
                                {data.chords && data.chords.map((ch, idx) => (
                                    <button key={idx} onClick={() => {
                                        if (setTrimPoint) setTrimPoint('in', ch.timestamp_seconds);
                                        if (onPlayChord) onPlayChord(ch.chord);
                                    }} style={{
                                        fontSize: '9px', padding: '2px 5px', background: '#262626', color: 'var(--accent)',
                                        border: '1px solid #444', borderRadius: '3px', cursor: 'pointer', marginRight: '4px', whiteSpace: 'nowrap'
                                    }} title={`Chord ${ch.chord} @ ${ch.timestamp_seconds}s`}>
                                        🎼 {ch.chord}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* NOTES & PITCH CONTOUR VIEW */}
                    {activeTab === 'notes' && (
                        <div style={{ background: '#0a0a0a', padding: '8px', borderRadius: '4px', border: '1px solid #333', maxHeight: '120px', overflowY: 'auto' }}>
                            <div style={{ fontSize: '10px', color: 'var(--accent)', marginBottom: '4px', fontWeight: 'bold' }}>
                                🎵 Root Notes & Pitch Map
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {data.notes && data.notes.map((nt, idx) => (
                                    <span key={idx} onClick={() => {
                                        if (setTrimPoint) setTrimPoint('in', nt.timestamp_seconds);
                                    }} style={{
                                        fontSize: '10px', padding: '2px 5px', background: '#1c1c1c', color: 'var(--accent)',
                                        border: '1px solid #333', borderRadius: '3px', cursor: 'pointer'
                                    }} title={`Jump to Note ${nt.root_note} @ ${nt.timestamp_seconds}s`}>
                                        🎶 {nt.root_note} <span style={{ fontSize: '8px', color: '#666' }}>({nt.timestamp_seconds}s)</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* VOCAL-SECTION CUE POINTS — seek marks, not recognised words */}
                    {activeTab === 'cues' && (
                        <div style={{ background: '#0a0a0a', padding: '8px', borderRadius: '4px', border: '1px solid #333', maxHeight: '120px', overflowY: 'auto' }}>
                            <div style={{ fontSize: '10px', color: 'var(--accent)', marginBottom: '2px', fontWeight: 'bold' }}>
                                🎯 Vocal Section Cue Points
                            </div>
                            <div style={{ fontSize: '9px', color: '#777', marginBottom: '4px' }}>
                                No lyric recognition runs in this scan. These are evenly spaced seek marks inside each Verse / Chorus, not detected words.
                            </div>
                            {data.vocal_section_cues && data.vocal_section_cues.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {data.vocal_section_cues.map((cue, idx) => (
                                        <span key={idx} onClick={() => {
                                            if (setTrimPoint) setTrimPoint('in', cue.timestamp_seconds);
                                        }} style={{
                                            fontSize: '10px', padding: '2px 5px', background: '#222', color: '#e0e0e0',
                                            border: '1px solid #333', borderRadius: '3px', cursor: 'pointer'
                                        }} title={`Jump to ${cue.label} @ ${cue.timestamp_seconds}s`}>
                                            {cue.label} <span style={{ fontSize: '8px', color: '#777' }}>({cue.timestamp_seconds}s)</span>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: '10px', color: '#666' }}>No Verse or Chorus section in this scan, so there is nothing to cue.</div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
