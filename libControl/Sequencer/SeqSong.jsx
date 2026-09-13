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

window.SeqSong = ({ songPos, song, togglePlayback, playSong, setSongItems, setSongPos, library, setLibraryItems, mixer, setMixer, nextPatternRef, loadPattern, isPlaying }) => {
    const SeqButton = window.SeqButton;
    const fileRef = React.useRef(null);
    const [queuedPos, setQueuedPos] = React.useState(null);

    // Keep queued indicator in sync with nextPatternRef
    React.useEffect(() => {
        const interval = setInterval(() => {
            if (!nextPatternRef || !nextPatternRef.current) {
                setQueuedPos(null);
            }
        }, 50);
        return () => clearInterval(interval);
    }, [nextPatternRef]);

    const exportSong = () => {
        const name = (window.prompt('Name this export:', 'My Song') || '').trim();
        if (!name) return;
        window.oaExportSong(library, song, name, mixer);
    };

    // Levels are React/MQTT state, so they are applied here rather than in
    // oaApplySongState (which only knows about the audio-layer globals).
    const applyMixer = (m) => {
        if (!m || !setMixer) return;
        if (Array.isArray(m.trackVol)) setMixer.setTrackVol(m.trackVol);
        if (Array.isArray(m.trackPan)) setMixer.setTrackPan(m.trackPan);
        if (Array.isArray(m.mutes)) setMixer.setMutes(m.mutes);
        if (Array.isArray(m.solos)) setMixer.setSolos(m.solos);
        if (m.masterVol != null) setMixer.setMasterVol(m.masterVol);
        if (m.clickVol != null) setMixer.setClickVol(m.clickVol);
        if (m.bpm != null) setMixer.setBpm(m.bpm);
        if (m.steps != null) setMixer.setSteps(m.steps);
    };

    const importFile = (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            let parsed;
            try {
                parsed = window.oaParseSongFile(String(reader.result));
            } catch (err) {
                window.alert(`Could not import: ${err.message}`);
                return;
            }
            const { library: merged, renamed } = window.oaMergePatterns(library, parsed.patterns);
            setLibraryItems(merged);
            // The imported arrangement follows its patterns' new names.
            if (parsed.song.length) {
                setSongItems(parsed.song.map((item) => {
                    if (item && typeof item === 'object') {
                        return { ...item, name: renamed[item.name] || item.name };
                    }
                    return renamed[item] || item;
                }));
            }
            applyMixer(parsed.mixer);

            let state = { synth: 0, samples: 0, sampleNote: '', reverb: false, delay: false, pads: '' };
            try { state = await window.oaApplySongState(parsed); }
            catch (err) { console.error('🛑 [Song] could not restore state:', err); }

            const note = Object.keys(renamed).length
                ? `\n\n${Object.keys(renamed).length} had name clashes and were added with a suffix.`
                : '';
            const restored = [
                parsed.mixer ? 'mixer levels' : null,
                state.synth ? `${state.synth} synth voice(s)` : null,
                state.pads ? `the ${state.pads} pad grid` : null,
                state.reverb ? 'reverb' : null,
                state.delay ? 'tape delays' : null,
                state.samples ? `${state.samples} sample(s)` : null,
            ].filter(Boolean);
            window.alert(`Imported ${parsed.patterns.length} pattern(s)` +
                (parsed.song.length ? ` and a ${parsed.song.length}-part song.` : '.') +
                (restored.length ? `\n\nRestored: ${restored.join(', ')}.` : '') +
                (state.sampleNote ? `\n\n${state.sampleNote}` : '') + note);
        };
        reader.readAsText(file);
    };

    // Arranging = ordering. Nudge a pattern along the chain without rebuilding it.
    const move = (i, delta) => {
        const j = i + delta;
        if (j < 0 || j >= song.length) return;
        const next = [...song];
        [next[i], next[j]] = [next[j], next[i]];
        setSongItems(next);
        if (songPos === i) setSongPos(j);
        else if (songPos === j) setSongPos(i);
    };

    const handlePadClick = (name, i) => {
        const entry = library.find((p) => p.name === name);
        if (isPlaying) {
            // Queue transition on next loop handoff
            if (nextPatternRef) {
                nextPatternRef.current = { idx: i, entry };
                setQueuedPos(i);
            }
        } else {
            if (entry && loadPattern) loadPattern(entry);
            setSongPos(i);
            playSong();
        }
    };

    return (
        <div style={{ marginTop: '10px', borderTop: '1px solid #333', paddingTop: '8px' }}>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                Song
            </div>
            {song.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', marginBottom: '10px' }}>
                    A song chains patterns together. Click ＋ on patterns above to build one.
                </div>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                    {song.map((item, i) => {
                        const name = (item && typeof item === 'object') ? item.name : item;
                        const repeatCount = (item && typeof item === 'object' && item.repeat != null) ? item.repeat : 0;
                        const isActive = songPos === i;
                        const isQueued = queuedPos === i;

                        let padBg = '#222';
                        let borderColor = '#444';
                        let textColor = '#ccc';

                        if (isActive) {
                            padBg = '#1565c0';
                            borderColor = '#64b5f6';
                            textColor = '#fff';
                        }
                        if (isQueued) {
                            borderColor = '#ffb300';
                        }

                        const updateRepeat = (newVal) => {
                            const next = [...song];
                            const cur = next[i];
                            const curName = (cur && typeof cur === 'object') ? cur.name : cur;
                            next[i] = { name: curName, repeat: newVal };
                            setSongItems(next);
                        };

                        return (
                            <React.Fragment key={i}>
                                {i > 0 && <span style={{ color: '#555', fontSize: '14px' }}>→</span>}
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    background: padBg,
                                    borderRadius: '6px',
                                    border: `2px solid ${borderColor}`,
                                    boxShadow: isActive ? '0 0 10px rgba(100, 181, 246, 0.5)' : (isQueued ? '0 0 8px rgba(255, 179, 0, 0.6)' : 'none'),
                                    minWidth: '105px',
                                    overflow: 'hidden',
                                    transition: 'all 0.15s ease'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        justify: 'space-between',
                                        alignItems: 'center',
                                        background: 'rgba(0,0,0,0.3)',
                                        padding: '2px 4px',
                                        borderBottom: '1px solid rgba(255,255,255,0.08)'
                                    }}>
                                        <div style={{ display: 'flex', gap: '2px' }}>
                                            <button
                                                onClick={() => move(i, -1)}
                                                disabled={i === 0}
                                                title="Move earlier"
                                                style={{ background: 'transparent', color: i > 0 ? '#8bc34a' : '#444', border: 'none', padding: '1px 3px', cursor: i > 0 ? 'pointer' : 'default', fontSize: '10px' }}
                                            >
                                                ◀
                                            </button>
                                            <button
                                                onClick={() => move(i, 1)}
                                                disabled={i === song.length - 1}
                                                title="Move later"
                                                style={{ background: 'transparent', color: i < song.length - 1 ? '#8bc34a' : '#444', border: 'none', padding: '1px 3px', cursor: i < song.length - 1 ? 'pointer' : 'default', fontSize: '10px' }}
                                            >
                                                ▶
                                            </button>
                                        </div>
                                        <span style={{ fontSize: '10px', color: isQueued ? '#ffb300' : (isActive ? '#90caf9' : '#888'), fontWeight: 'bold' }}>
                                            {isQueued ? 'NEXT' : (isActive ? 'PLAYING' : `PAD ${i + 1}`)}
                                        </span>
                                        <button
                                            onClick={() => setSongItems(song.filter((_, idx) => idx !== i))}
                                            title="Remove pattern"
                                            style={{ background: 'transparent', color: '#ff8a80', border: 'none', padding: '1px 4px', cursor: 'pointer', fontSize: '12px' }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => handlePadClick(name, i)}
                                        title={isPlaying ? `Queue pattern "${name}" to play on next loop handoff` : `Play from "${name}"`}
                                        style={{
                                            background: 'transparent',
                                            color: textColor,
                                            border: 'none',
                                            padding: '8px 10px 4px 10px',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            fontWeight: 'bold',
                                            textAlign: 'center',
                                            wordBreak: 'break-word',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '2px'
                                        }}
                                    >
                                        <span>{name}</span>
                                    </button>
                                    <div style={{
                                        padding: '4px 6px 8px 6px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        background: 'rgba(0,0,0,0.15)',
                                        borderTop: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <window.SeqKnob
                                            value={repeatCount}
                                            min={0}
                                            max={16}
                                            step={1}
                                            def={0}
                                            size={42}
                                            color={isActive ? '#64b5f6' : 'var(--accent)'}
                                            label="REPEAT"
                                            display={repeatCount}
                                            onChange={updateRepeat}
                                            title={`Repeat pattern "${name}" ${repeatCount} extra time(s)`}
                                        />
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                <SeqButton
                    label={songPos !== null ? '■ Stop Song' : '► Play Song'}
                    onClick={songPos !== null ? togglePlayback : playSong}
                    color={songPos !== null ? '#ffb300' : '#388e3c'} textColor="#fff"
                    disabled={songPos === null && song.length === 0}
                    title="Play the song: each pattern in order, looping the whole song"
                    style={{ padding: '4px 12px', border: 'none' }}
                />
                <SeqButton
                    label="Clear"
                    onClick={() => { setSongItems([]); if (songPos !== null) togglePlayback(); }}
                    disabled={song.length === 0}
                    style={{ padding: '4px 10px', border: 'none' }}
                />

                <span style={{ width: '1px', height: '18px', background: '#444', margin: '0 4px' }} />

                <SeqButton
                    label="⭳ Export"
                    onClick={exportSong}
                    title="Download every saved pattern, the arrangement, the kit, mixer levels and synth settings as a .json file"
                    style={{ padding: '4px 10px', border: 'none' }}
                />
                <SeqButton
                    label="⭱ Import"
                    onClick={() => fileRef.current && fileRef.current.click()}
                    title="Load patterns and a song from a .json export"
                    style={{ padding: '4px 10px', border: 'none' }}
                />
                <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={(e) => { importFile(e.target.files && e.target.files[0]); e.target.value = ''; }}
                />
            </div>
        </div>
    );
};
