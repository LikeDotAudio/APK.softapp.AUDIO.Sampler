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
 * SAMPLER — the panel behind the mixer's SAMPLER button.
 *
 * One channel's sound, and everything you would do to it: PICK one (the sound
 * browser, loading straight to this pad), CHOP it (the same IN/OUT/fade handles
 * the browser uses, on the same waveform component), and TUNE it.
 *
 * It edits the shared kit entry in place — OA_DRUM_SAMPLES[idx] — so the pad,
 * the sequencer track and this panel are three windows onto one sound, and a
 * chop made here is heard by the next hit from any of them. That is also why
 * there is no "apply": there is nothing to apply it TO.
 */
window.SamplerEditor = ({ idx, name, onClose, oaPopped }) => {
    const panel = window.useOaPanel({
        id: `sampler-${idx}`, title: `${name} — SAMPLER`, copy: oaPopped,
        render: () => <window.SamplerEditor idx={idx} name={name} onClose={onClose} oaPopped />,
    });

    // The entry lives outside React, and the browser can replace it under us.
    const [ver, bump] = React.useReducer((n) => n + 1, 0);
    React.useEffect(() => {
        const onChanged = (e) => { if (!e.detail || e.detail.idx === idx) bump(); };
        window.addEventListener('oa-sample-changed', onChanged);
        return () => window.removeEventListener('oa-sample-changed', onChanged);
    }, [idx]);

    const [browsing, setBrowsing] = React.useState(false);
    const [err, setErr] = React.useState('');
    const [head, setHead] = React.useState(null);      // preview playhead, 0..1 or null
    const rafRef = React.useRef(null);
    React.useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

    const entry = (window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[idx]) || null;
    const buffer = entry && entry.buffer;
    const dur = buffer ? buffer.duration : 0;
    const trim = window.oaTrimOf(entry);
    const chopped = window.oaTrimmed(trim, dur);
    const pitch = (entry && entry.pitch) || 1;
    const semis = Math.round(12 * Math.log2(pitch));
    const looping = !!(entry && entry.loop);

    const setTrimPoint = (which, sec) => {
        if (!buffer) return;
        const t = window.oaTrimMove(trim, which, sec, dur);
        window.oaUpdateDrumSample(idx, {
            offset: t.in,
            // Out at the very end is not a cut; keep it null so a longer sample
            // dropped in later is not clipped to this one's length.
            end: t.out < dur - 0.0005 ? t.out : null,
            fadeIn: t.fadeIn, fadeOut: t.fadeOut,
            fade: t.fadeIn > 0 || t.fadeOut > 0,
        });
        bump();
    };
    const resetTrim = () => {
        if (!buffer) return;
        window.oaUpdateDrumSample(idx, { offset: 0, end: null, fadeIn: 0, fadeOut: 0, fade: false });
        bump();
    };
    const setSemis = (s) => { window.oaUpdateDrumSample(idx, { pitch: Math.pow(2, s / 12) }); bump(); };

    // Preview is the REAL pad — the same voice, through the same channel, drive
    // and compressor — so what is heard here is what the kit sounds like. The
    // playhead is run from the clock rather than from the voice, because a hit
    // is fire-and-forget and has nothing to ask.
    const preview = () => {
        if (!window.oaTriggerDrum) return;
        window.oaTriggerDrum(idx, 1);
        if (!buffer) return;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const t0 = performance.now();
        const span = Math.max(0.001, (trim.out - trim.in) / ((entry && entry.pitch) || 1));
        const run = () => {
            const on = (performance.now() - t0) / 1000;
            if (on >= span || looping) { setHead(null); rafRef.current = null; return; }
            setHead((trim.in + on * ((entry && entry.pitch) || 1)) / dur);
            rafRef.current = requestAnimationFrame(run);
        };
        rafRef.current = requestAnimationFrame(run);
    };

    const load = async (file, meta) => {
        setErr('');
        try { await window.oaLoadSampleToPad(idx, file, meta); }
        catch (e) { setErr(`Could not decode ${file && file.name}`); }
        bump();
    };

    const btn = (extra) => ({
        background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '3px',
        padding: '5px 11px', cursor: 'pointer', fontSize: '12px', ...extra,
    });
    const secs = (v) => Number(v || 0).toFixed(3);

    return panel.frame(
        <div {...panel.frameProps({
            position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--panel)', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.7)', zIndex: 1200,
            padding: '12px 14px', width: 'min(620px, 94vw)', maxHeight: '80vh', overflowY: 'auto'
        })}>
            <div {...panel.handle({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' })}>
                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px' }}>
                    {name} — SAMPLER
                </span>
                <span style={{ fontSize: '9px', color: '#666' }}>the sound on this channel, and where it starts and stops</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <window.SeqButton label={panel.popLabel} onClick={panel.togglePop} title={panel.popTitle} style={{ padding: '4px 10px' }} />
                    <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span title={buffer ? (entry.name || 'sample') : 'No sample on this channel — it plays the synth voice'} style={{ fontSize: '11px', color: buffer ? '#ccc' : '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {buffer ? (entry.name || 'sample') : 'No sample on this channel — it plays the synth voice'}
                </span>
                {buffer && <span style={{ fontSize: '10px', color: '#666', fontVariantNumeric: 'tabular-nums' }}>{secs(dur)}s</span>}
                <button onClick={() => setBrowsing(true)} title="Pick a sound for this channel"
                    style={btn({ background: 'var(--accent)', color: '#111', border: 'none', fontWeight: 'bold' })}>📁 Browse…</button>
            </div>

            {err && <div style={{ color: '#f88', fontSize: '11px', marginBottom: '6px' }}>⚠️ {err}</div>}

            {/* The chopper — the browser's waveform and handles, on the sound
                that is already loaded. */}
            <window.WaveTrim
                buffer={buffer}
                trim={trim}
                setTrimPoint={setTrimPoint}
                pos={head}
                onScrub={() => {}}
                active={!!buffer}
                beatMarkers={entry && entry.noteMap ? entry.noteMap.beat_markers : null}
                chunkMaps={entry && entry.noteMap ? entry.noteMap.chunk_maps : null}
            />

            {/* Note Root Key & Beat Marker Map Control Bar */}
            {entry && entry.noteMap && (
                <div style={{ marginTop: '8px', padding: '8px', background: '#181818', border: '1px solid #333', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 'bold' }}>
                            🎵 KEY: {entry.noteMap.global_root_note} · {entry.noteMap.global_bpm} BPM · {entry.noteMap.total_beats} BEATS
                        </span>
                        <span style={{ fontSize: '10px', color: '#888' }}>
                            {entry.noteMap.total_chunks} note chunks detected
                        </span>
                    </div>
                    {entry.noteMap.chunk_maps && entry.noteMap.chunk_maps.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingTop: '4px' }}>
                            {entry.noteMap.chunk_maps.map((cm, cIdx) => (
                                <button key={cIdx} onClick={() => {
                                    setTrimPoint('in', cm.start_seconds);
                                    setTrimPoint('out', cm.end_seconds);
                                }} style={{
                                    fontSize: '10px', padding: '3px 6px', background: '#262626', color: 'var(--accent)',
                                    border: '1px solid #444', borderRadius: '3px', cursor: 'pointer', whiteSpace: 'nowrap'
                                }} title={`Snap chop to Chunk ${cIdx}: ${cm.root_note_name} (${cm.start_seconds}s - ${cm.end_seconds}s)`}>
                                    Chop {cIdx + 1}: {cm.root_note_name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button onClick={preview} disabled={!buffer && !window.OA_DRUM_KIT[idx]}
                    style={btn({ background: '#388e3c', border: 'none', fontWeight: 'bold' })}>► Play</button>
                <label title="Hold this sound as a loop between the marks" style={{ fontSize: '11px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="checkbox" checked={looping} disabled={!buffer}
                        onChange={(e) => { window.oaUpdateDrumSample(idx, { loop: e.target.checked }); bump(); }} /> Loop
                </label>
                <label title="Break: stop any currently playing instance of this sample and restart it on new hits" style={{ fontSize: '11px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="checkbox" checked={!!(entry && entry.break)} disabled={!buffer}
                        onChange={(e) => { window.oaUpdateDrumSample(idx, { break: e.target.checked }); bump(); }} /> Break
                </label>
                <span style={{ fontSize: '11px', color: chopped ? 'var(--accent)' : '#666', fontVariantNumeric: 'tabular-nums' }}
                    title="IN → OUT, and the fade at each end. Drag the handles on the waveform.">
                    ✂ {secs(trim.in)} → {secs(trim.out)}s ({secs(trim.out - trim.in)}s)
                    {(trim.fadeIn > 0 || trim.fadeOut > 0) ? ` · fade ${trim.fadeIn.toFixed(2)}/${trim.fadeOut.toFixed(2)}` : ''}
                </span>
                {chopped && (
                    <button onClick={resetTrim} title="Drop the chop — the whole sample, no fades"
                        style={btn({ padding: '3px 8px', fontSize: '11px' })}>⟲ whole</button>
                )}
            </div>

            <div style={{ marginTop: '10px', opacity: buffer ? 1 : 0.4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa' }}>
                    <span>PITCH</span>
                    <span style={{ color: 'var(--accent)' }}>{semis > 0 ? '+' : ''}{semis} st</span>
                </div>
                <input type="range" min="-12" max="12" step="1" value={semis} disabled={!buffer}
                    onChange={(e) => setSemis(Number(e.target.value))} style={{ width: '100%' }} />
            </div>

            {/* Music Chart & Lyric Deep Scan Overlay */}
            {window.MusicChartOverlay && (
                <window.MusicChartOverlay
                    audioBuffer={buffer}
                    // The name belongs to the buffer, so it travels with it —
                    // Chop to 16 Pads labels all sixteen pads from this. Empty
                    // rather than a stand-in when the pad is bare: the chopper
                    // says `Track` for that, and a plausible-looking filename
                    // is the defect PLAN-437.01 removed.
                    filename={entry && entry.name ? entry.name : ''}
                    trim={trim}
                    setTrimPoint={setTrimPoint}
                    headPos={head}
                    chartData={entry && entry.chartData ? entry.chartData : null}
                />
            )}

            {/* The Multi-Lens Inspector & Exporter. `window.LensesView` is the
                component's ONE name. This site rendered it under a second,
                aliased name until PLAN-647.01, and that second name is what
                let a 384-line fork of the component hide in the bundle for as
                long as it did (PLAN-572.01). Do not re-alias it. */}
            {window.LensesView && (
                <div style={{ marginTop: '12px' }}>
                    <window.LensesView
                        audioBuffer={buffer}
                        // Same rule as the overlay above: empty, never a
                        // stand-in. This name is EXPORTED — it titles the .lrc
                        // and names the .PEAK the visitor downloads — so the
                        // last resort belongs to the view that owns the
                        // fallback chain, not to the caller that guessed.
                        filename={entry && entry.name ? entry.name : ''}
                        padIdx={idx}
                    />
                </div>
            )}

            {browsing && window.SoundBrowser && ReactDOM.createPortal(
                <window.SoundBrowser
                    targetLabel={name}
                    onClose={() => setBrowsing(false)}
                    onChoose={(file, meta) => { load(file, meta); setBrowsing(false); }}
                />,
                document.body
            )}
        </div>
    );
};
