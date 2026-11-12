// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: LensesPanels.jsx
 * Purpose: The six lens bodies of LensesView — what each tab draws once a scan is in.
 * Description: Drawn by LensesView.jsx, which owns the scan, the state and the
 *   exporters, and hands what these read over as one object (`lv`). Plain
 *   functions, not components: each is called where its markup used to sit,
 *   so the element tree is unchanged. The tab declarations stay in
 *   LensesView.jsx, which is where test/lensTabs.mjs reads them.
 */

// Lens 1: UCS Taxonomy
const oaLensTaxonomy = (lv) => {
    const {
        creatorId, filename, fname, isDictating, setCreatorId, setSourceId, setUcsCatKey, sourceId,
        speakText, startDictation, ucsCatKey, withoutContainer,
    } = lv;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px' }}>
            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px', border: '1px solid #2a2f38' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>UCS CATEGORY CONFIGURATION</span>
                    <button onClick={() => startDictation(txt => setUcsCatKey(txt.toUpperCase().replace(/\s+/g, '-')))}
                        style={{ background: isDictating ? '#ff5252' : '#333', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>
                        {isDictating ? '🎙️ Listening…' : '🎤 Dictate CatKey'}
                    </button>
                </div>
                <label style={{ display: 'block', marginBottom: '4px' }}>CatKey (6-Part Schema):</label>
                <input value={ucsCatKey} onChange={e => setUcsCatKey(e.target.value)}
                    style={{ width: '100%', background: '#0d0e12', border: '1px solid #444', color: '#fff', padding: '4px', borderRadius: '3px', marginBottom: '8px' }} />

                <label style={{ display: 'block', marginBottom: '4px' }}>Creator ID:</label>
                <input value={creatorId} onChange={e => setCreatorId(e.target.value)}
                    style={{ width: '100%', background: '#0d0e12', border: '1px solid #444', color: '#fff', padding: '4px', borderRadius: '3px', marginBottom: '8px' }} />

                <label style={{ display: 'block', marginBottom: '4px' }}>Source ID:</label>
                <input value={sourceId} onChange={e => setSourceId(e.target.value)}
                    style={{ width: '100%', background: '#0d0e12', border: '1px solid #444', color: '#fff', padding: '4px', borderRadius: '3px' }} />
            </div>
            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px', border: '1px solid #2a2f38' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '6px' }}>COMPOSED UCS BASENAME</div>
                <div style={{ fontSize: '12px', color: '#7dff4a', background: '#0d0e12', padding: '8px', borderRadius: '3px', wordBreak: 'break-all' }}>
                    {`${ucsCatKey}_${withoutContainer(fname)}_${creatorId}_${sourceId}.wav`}
                </div>
                <button onClick={() => speakText(`UCS Category Key: ${ucsCatKey}. Composed filename: ${ucsCatKey}_${withoutContainer(fname)}_${creatorId}_${sourceId}.wav`)}
                    style={{ marginTop: '8px', background: '#2a2f38', color: '#7dff4a', border: '1px solid #444', borderRadius: '3px', padding: '3px 8px', fontSize: '9px', cursor: 'pointer' }}>
                    🔊 Read Aloud UCS Basename
                </button>
            </div>
        </div>
    );
};

window.oaLensTaxonomy = oaLensTaxonomy;

// Lens 2: Pitch & Beats
const oaLensMusicality = (lv) => {
    const {
        NOT_MEASURED, beatMarkers, measured, musicality, num, sections, speakText,
    } = lv;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '11px' }}>
            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                <div style={{ color: '#aaa' }}>DETECTED KEY & PITCH</div>
                <div style={{ fontSize: '20px', color: musicality.key ? 'var(--accent)' : '#666', fontWeight: 'bold' }}>{musicality.key || NOT_MEASURED}</div>
                <div>{num(musicality.pitchHz, 2)} Hz ({num(musicality.centsOffset)} cents)</div>
                {!musicality.key && <div style={{ color: '#777', marginTop: '4px' }}>No frame cleared the scanner's noise floor, so this buffer has no key to report.</div>}
                <button onClick={() => speakText(musicality.key
                    ? `Key: ${musicality.key}, ${num(musicality.pitchHz, 1)} Hertz`
                    : 'No key or pitch was measured in this buffer.')}
                    style={{ marginTop: '6px', background: '#2a2f38', color: '#ccc', border: 'none', padding: '2px 5px', fontSize: '9px', borderRadius: '2px', cursor: 'pointer' }}>
                    🔊 Speak Pitch
                </button>
            </div>
            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                <div style={{ color: '#aaa' }}>ESTIMATED TEMPO</div>
                <div style={{ fontSize: '20px', color: measured(musicality.bpm) ? '#7dff4a' : '#666', fontWeight: 'bold' }}>{num(musicality.bpm, 1)} BPM</div>
                <div>{beatMarkers.length} Energy Onsets Detected</div>
                {!measured(musicality.bpm) && <div style={{ color: '#777', marginTop: '4px' }}>A tempo needs several bars of onsets to autocorrelate; this buffer has none.</div>}
            </div>
            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                <div style={{ color: '#aaa' }}>SOUNDING CHUNKS</div>
                <div style={{ fontSize: '20px', color: '#42a5f5', fontWeight: 'bold' }}>{sections.length} Chunks</div>
                <div>Ready for 16-Pad Slicing</div>
            </div>
        </div>
    );
};

window.oaLensMusicality = oaLensMusicality;

// Lens 3: Lyric Dictation
const oaLensLyrics = (lv) => {
    const {
        isDictating, lyricWords, setScanData, speakText, startDictation,
    } = lv;
    return (
        <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px', fontSize: '11px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>VOICE ACTIVITY & SUBTITLE ALIGNMENT</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => startDictation(txt => {
                        const nowSec = 0.0;
                        setScanData(prev => ({
                            ...prev,
                            lyrics: {
                                words: [...((prev && prev.lyrics && prev.lyrics.words) || []), { start: nowSec, text: txt }]
                            }
                        }));
                    })} style={{ background: isDictating ? '#ff5252' : '#333', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>
                        {isDictating ? '🎙️ Listening…' : '🎤 Dictate Lyric Line'}
                    </button>
                    <button onClick={() => {
                        if (lyricWords.length) speakText(lyricWords.map(w => w.text).join(' '));
                    }} style={{ background: '#2a2f38', color: '#7dff4a', border: '1px solid #444', borderRadius: '3px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>
                        🔊 Read Aloud Lyrics
                    </button>
                </div>
            </div>
            <div>Vocal Phrasing Detected: {lyricWords.length} Word Timestamps</div>
            <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '6px', background: '#0d0e12', padding: '6px', borderRadius: '3px' }}>
                {lyricWords.length === 0
                    ? <span style={{ color: '#777' }}>Nothing has transcribed this file — the deep scanner runs no recogniser. Dictate a line, or import an .LRC.</span>
                    : lyricWords.map((w, i) => (
                        <span key={i} style={{ display: 'inline-block', marginRight: '8px', color: '#cde' }}>
                            [{w.start.toFixed(2)}s] {w.text}
                        </span>
                    ))}
            </div>
        </div>
    );
};

window.oaLensLyrics = oaLensLyrics;

// Lens 4: EBU R128 Loudness
const oaLensLoudness = (lv) => {
    const {
        loudness, measured, num,
    } = lv;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '11px' }}>
            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                <div style={{ color: '#aaa' }}>INTEGRATED LOUDNESS</div>
                <div style={{ fontSize: '20px', color: !measured(loudness.integratedLUFS) ? '#666' : (loudness.integratedLUFS > -14 ? '#ff5252' : '#7dff4a'), fontWeight: 'bold' }}>
                    {num(loudness.integratedLUFS, 2)} LUFS
                </div>
                <div>EBU R128 Target: -23 LUFS</div>
                {!measured(loudness.integratedLUFS) && <div style={{ color: '#777', marginTop: '4px' }}>No 400 ms block cleared the −70 LUFS absolute gate.</div>}
            </div>
            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                <div style={{ color: '#aaa' }}>MAX TRUE PEAK</div>
                <div style={{ fontSize: '20px', color: measured(loudness.maxTruePeakdBTP) ? '#ffb74d' : '#666', fontWeight: 'bold' }}>{num(loudness.maxTruePeakdBTP, 2)} dBTP</div>
                <div>Ceiling: -1.0 dBTP</div>
                {!measured(loudness.maxTruePeakdBTP) && <div style={{ color: '#777', marginTop: '4px' }}>Digital silence — its true peak is −∞ dB, which is not a reading.</div>}
            </div>
            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                <div style={{ color: '#aaa' }}>LOUDNESS RANGE (LRA)</div>
                <div style={{ fontSize: '20px', color: measured(loudness.lraLU) ? '#42a5f5' : '#666', fontWeight: 'bold' }}>{num(loudness.lraLU, 2)} LU</div>
                <div>Dynamic Range Window</div>
                {!measured(loudness.lraLU) && <div style={{ color: '#777', marginTop: '4px' }}>A range needs 3 s of gated short-term blocks; this buffer has none.</div>}
            </div>
        </div>
    );
};

window.oaLensLoudness = oaLensLoudness;

// Lens 5: AES Preservation
const oaLensArchival = (lv) => {
    const {
        NOT_MEASURED, scanData,
    } = lv;
    return (
        <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px', fontSize: '11px' }}>
            <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '6px' }}>AES SC-03-06 ARCHIVAL PRESERVATION METADATA</div>
            <div>BWF bext Version: 2 (EBU Tech 3285)</div>
            <div style={{ wordBreak: 'break-all' }}>
                SHA-256 of the decoded PCM:{' '}
                <span style={{ color: scanData.pcm_sha256 ? '#7dff4a' : '#777' }}>
                    {scanData.pcm_sha256 || NOT_MEASURED}
                </span>
            </div>
            {/* The constant that used to stand here — e3b0c442…b855 — is the
                SHA-256 of the EMPTY STRING, printed under a preservation
                heading as though it were this file's checksum (PLAN-601.01).
                This page holds an AudioBuffer and not the bytes it was decoded
                from, so the file's own digest is a thing it cannot compute;
                what it can hash is the samples, and the label says which. */}
            <div style={{ color: '#777', marginTop: '4px' }}>
                This identifies the AUDIO, not the container — two encodes of one take agree here and differ on disk.
                {!scanData.pcm_sha256 && ' Unavailable: crypto.subtle is absent on an insecure origin.'}
            </div>
            <div>Sample-Accurate Time Reference: 0 samples since midnight</div>
        </div>
    );
};

window.oaLensArchival = oaLensArchival;

// Lens 6: AES69 3D Spatial
const oaLensSpatial = (lv) => {
    const {
        measured,
    } = lv;
    return (
        <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px', fontSize: '11px' }}>
            <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '6px' }}>AES69 / SOFA 3D SPATIAL AUDIO METADATA</div>
            {/* EM DASHES, NOT `0.0° | 0.0° | 1.0 m`. This lens
                drew three literals typed into the JSX — not
                even read back from the export — so it presented
                a placement as though it had come off the file.
                It says which gate was not cleared instead, the
                way every unmeasured scalar in this view does.
                PLAN-908.01. */}
            <div>Azimuth (Φ): — | Elevation (Θ): — | Distance (r): —</div>
            <div style={{ color: '#7a8494', marginTop: '4px' }}>
                No placement was measured: nothing in this view offers a position
                control, and a decoded AudioBuffer carries no SOFA source. The
                sidecar writes these three as <code>null</code>.
            </div>
            <div style={{ marginTop: '4px' }}>Spatial Format: AES69 SOFA HRTF / EBU ADM (Tech 3364)</div>
        </div>
    );
};

window.oaLensSpatial = oaLensSpatial;
