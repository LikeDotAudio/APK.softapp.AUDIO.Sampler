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

const loadDrumSets = () => { try { return JSON.parse(window.localStorage.getItem('oaDrumSets')) || {}; } catch (e) { return {}; } };
const midiNoteName = window.midiNoteName;
const PadWave = window.PadWave;
const Pads = ({ label = "Drum Pads", centerVelocity = 100, edgeVelocity = 10, onHit = null, showSets = true }) => {
    // Shared drum kit — the SAME voices the Sequencer uses (DrumKit.js), as
    // many as the current grid holds.
    const grid = window.useOaPadGrid();
    const KIT = window.OA_DRUM_KIT || [];
    // Per-pad loaded-sample file name (for display); null = uses the synth voice.
    // The decoded audio lives in window.OA_DRUM_SAMPLES so the Sequencer plays it
    // too. Seed from that shared store so pads loaded before a remount still show.
    const [sampleNames, setSampleNames] = React.useState(() =>
        Array(window.OA_PAD_MAX).fill(null).map((_, i) => {
            const e = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[i];
            return e ? (e.name || '(loaded)') : null;
        }));
    const { 
        toneRoot, setToneRoot, toneRootRef, velocities, setVelocities, browsePad, setBrowsePad,
        pendingAssign, setPendingAssign, showPadBrowse, setShowPadBrowse, midiBase, setMidiBase, midiBaseRef,
        kitMeta, restoreMsg, missingCount, restoreSounds, handleFile, publishSample
    } = window.useSamplerState(setSampleNames);
    const { sets, currentSet, newSet, deleteSet, loadSet, isFactorySet } = window.useSamplerSets(setSampleNames, publishSample);
    const padButtons = React.useRef([]);
    const fileInputs = React.useRef([]);
    const rootRef = React.useRef(null);
    // Sets live inside the sequencer's ⚙ Config drop-up rather than owning a footer button.
    const [setsNode, setSetsNode] = React.useState(null);
    React.useEffect(() => {
        setSetsNode(document.getElementById('config-dropup-slot'));
    }, []);
    // The drop-up belongs to the Sequencer; ask it to close once a set is chosen.
    const closeConfig = () => window.dispatchEvent(new CustomEvent('oa-close-config'));

    const { hitPad, startGlow, triggerPadAt, triggerPadKey } = window.useSamplerPads(
        centerVelocity, edgeVelocity, onHit, toneRoot, midiBaseRef, 
        setVelocities, setToneRoot, padButtons
    );
    const layout = window.oaPadNumbers();
    const { midiStatus, midiNote } = window.useMidiPads(midiBase, toneRootRef, padButtons, triggerPadAt, setVelocities);
    window.useKeyboardPads(triggerPadKey);
    // Glow a pad whenever the Sequencer plays that voice (intensity = step velocity).
    // Imperative only (no state) so 16th-note flashes don't churn React renders.
    React.useEffect(() => {
        const onPlay = (e) => {
            const idx = e.detail && e.detail.idx;
            if (idx == null) return;
            const el = padButtons.current[idx];
            if (!el) return;
            const i = Math.max(0, Math.min(1, (e.detail.velocity || 0) / 100));
            el.style.filter = `brightness(${0.9 + 0.5 * i})`;
            startGlow(el, idx, i);
            setTimeout(() => { if (el) el.style.filter = 'none'; }, 120);
        };
        window.addEventListener('oa-drum-play', onPlay);
        return () => window.removeEventListener('oa-drum-play', onPlay);
    }, []);
    // A sample can now be loaded from somewhere other than these pads — the
    // mixer's SAMPLER panel picks straight into a channel — so the names the
    // pads show are re-read from the shared store whenever one changes, rather
    // than only at mount.
    React.useEffect(() => {
        const onChanged = (e) => {
            const idx = e.detail && e.detail.idx;
            if (idx == null) return;
            const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[idx];
            setSampleNames((prev) => {
                const next = entry ? (entry.name || '(loaded)') : null;
                if (prev[idx] === next) return prev;
                const n = [...prev]; n[idx] = next; return n;
            });
        };
        window.addEventListener('oa-sample-changed', onChanged);
        return () => window.removeEventListener('oa-sample-changed', onChanged);
    }, []);
    // A sound sent over from the EDITOR tab, which has no pad of its own to load
    // into — it arrives armed, and the next pad clicked takes it.
    React.useEffect(() => {
        const onAssign = (e) => {
            if (e.detail && e.detail.file) setPendingAssign({ file: e.detail.file, meta: e.detail.meta || {} });
        };
        window.addEventListener('oa-assign-sample', onAssign);
        return () => window.removeEventListener('oa-assign-sample', onAssign);
    }, []);
    // Esc cancels "Load to other pad" mode.
    React.useEffect(() => {
        if (!pendingAssign) return;
        const onEsc = (e) => { if (e.key === 'Escape') setPendingAssign(null); };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, [pendingAssign]);
    const holdTimerRef = React.useRef(null);
    const holdTriggeredRef = React.useRef(false);
    const [samplerEditorPad, setSamplerEditorPad] = React.useState(null);

    const clearHold = () => {
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
    };

    return (
        <div ref={rootRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box' }}>
            {/* Velocity glow: bright on strike (scaled by --gi), fades over the sound's length. */}
            <style>{`
                @keyframes oaPadGlow {
                    from {
                        box-shadow: 0 0 calc(12px + var(--gi, 0.5) * 48px) calc(3px + var(--gi, 0.5) * 16px) rgba(var(--accent-rgb), calc(0.5 + var(--gi, 0.5) * 0.5));
                    }
                    to {
                        box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0);
                    }
                }
                /* On a phone the four columns must fit the viewport, so the pads
                   stop being a fixed 120px and share the width evenly instead. */
                @media (max-width: 800px) {
                    .oa-pad-grid {
                        grid-template-columns: repeat(${grid.cols}, 1fr) !important;
                        gap: 1px !important;
                        padding: 0 1px;
                    }
                    .oa-pad {
                        width: 100% !important;
                        height: auto !important;
                        aspect-ratio: 1 / 1;
                        min-width: 0;
                    }
                    .oa-pad-name { font-size: 12px !important; }
                }
                @media (max-width: 420px) {
                    .oa-pad-name { font-size: 10px !important; }
                }
            `}</style>
            <div className="oa-pad-grid" role="group" aria-label={`${label} — ${grid.count} velocity pads`} style={{ width: '100%', maxWidth: `${Math.min(1100, 200 * grid.cols)}px`, display: 'grid', gridTemplateColumns: `repeat(${grid.cols}, max-content)`, gap: '8px', justifyContent: 'center' }}>
                {layout.map((padNum) => {
                    const idx = padNum - 1;
                    const name = (KIT[idx] && KIT[idx].name) || `Pad ${padNum}`;
                    const midiNote = midiBase + idx;   // Chromatic C1: pad 1 = 36
                    const hasSample = !!(window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[idx] && window.OA_DRUM_SAMPLES[idx].buffer);
                    const remembered = kitMeta[idx];        // known from MQTT but not (yet) loaded
                    const vel = velocities[idx];            // side-car value (0-100)
                    
                    const isToneMode = toneRoot !== null;
                    const padNote = midiBase + padNum - 1;
                    const noteName = midiNoteName(padNote);
                    return (
                        <div key={padNum} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <window.Pad 
                                padNum={padNum} idx={idx} name={name} 
                                isToneMode={isToneMode} toneRoot={toneRoot} hasSample={hasSample} 
                                remembered={remembered} vel={vel} sampleNames={sampleNames}
                                midiNote={midiNote} noteName={noteName}
                                PadWave={window.PadWave}
                                setPadButtonRef={(el) => { padButtons.current[idx] = el; }}
                                onPointerDown={(e) => {
                                    clearHold();
                                    holdTriggeredRef.current = false;
                                    const eventRef = { clientX: e.clientX, clientY: e.clientY, currentTarget: e.currentTarget };

                                    holdTimerRef.current = setTimeout(() => {
                                        holdTriggeredRef.current = true;
                                        setSamplerEditorPad(idx);
                                        const el = eventRef.currentTarget;
                                        if (el) {
                                            el.style.transform = 'scale(1)';
                                            el.style.filter = 'none';
                                        }
                                    }, 400);

                                    if (e.ctrlKey) {
                                        clearHold();
                                        e.preventDefault();
                                        const newRoot = toneRoot === idx ? null : idx;
                                        setToneRoot(newRoot);
                                        if (newRoot !== null && window.oaPrecacheTones) window.oaPrecacheTones(newRoot);
                                        window.dispatchEvent(new CustomEvent('oa-tone-mode', { detail: { rootIdx: newRoot } }));
                                        return;
                                    }
                                    if (pendingAssign) {
                                        clearHold();
                                        e.preventDefault();
                                        handleFile(idx, pendingAssign.file, pendingAssign.meta);
                                        setPendingAssign(null);
                                        return;
                                    }
                                    if (e.altKey) {
                                        clearHold();
                                        e.preventDefault();
                                        if (window.SoundBrowser) setBrowsePad(idx);
                                        else { const input = fileInputs.current[idx]; if (input) input.click(); }
                                        return;
                                    }
                                    const v = hitPad(e, idx, padNum);
                                    const i = v / 100;
                                    const el = e.currentTarget;
                                    el.style.transform = 'scale(0.95)';
                                    el.style.filter = `brightness(${0.9 + 0.7 * i})`;
                                    startGlow(el, idx, i);
                                }}
                                onPointerUp={(e) => {
                                    clearHold();
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.filter = 'none';
                                }}
                                onPointerLeave={(e) => {
                                    clearHold();
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.filter = 'none';
                                }}
                                />
                            
                            {/* Hidden per-pad file input — only reachable via ALT+press */}
                            <input
                                ref={(el) => { fileInputs.current[idx] = el; }}
                                type="file"
                                accept="audio/*"
                                style={{ display: 'none' }}
                                onChange={(e) => handleFile(idx, e.target.files[0])}
                            />
                        </div>
                    );
                })}
            </div>
            {/* The keyboard's pitch wheel, on its side — see PitchWheel.jsx for
                why it holds its position instead of springing back. */}
            {window.PitchWheel && <window.PitchWheel maxWidth={Math.min(1100, 200 * grid.cols)} />}
            {missingCount > 0 && (
                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <button onClick={restoreSounds} title="Re-load the samples remembered on these pads (from MQTT) using the saved folder"
                        style={{ background: 'var(--accent-t15)', color: '#111', border: 'none', borderRadius: '3px', padding: '5px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                        ↻ Restore {missingCount} sample{missingCount > 1 ? 's' : ''}{restoreMsg ? ` · ${restoreMsg}` : ''}
                    </button>
                </div>
            )}
            
            {/* Web MIDI — a section of the ⚙ Config drop-up */}
            {setsNode && ReactDOM.createPortal(
                        <div style={{
                            borderTop: '1px solid #444',
                            paddingTop: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            minWidth: '180px'
                        }}>
                            <span style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>MIDI</span>
                            <span style={{ fontSize: '11px', color: '#ccc' }}>
                                Status: <b style={{ color: (midiStatus && !/not supported|denied|No MIDI/i.test(midiStatus)) ? '#4caf50' : '#f55' }}>{midiStatus || 'connecting…'}</b>
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '11px', color: '#888' }}>Pad 1 Note:</span>
                                <input type="number" value={midiBase} onChange={(e) => setMidiBase(Number(e.target.value))} title="MIDI note number that triggers pad 1" style={{ width: '50px', background: '#000', color: 'var(--accent)', border: '1px solid #444', textAlign: 'center', borderRadius: '3px', fontSize: '11px' }} />
                            </div>
                            {midiNote != null && <span style={{ fontSize: '11px', color: '#888' }}>Last Note: <b style={{ color: 'var(--accent)' }}>{midiNote}</b></span>}
                        </div>,
                setsNode
            )}
            
            {/* SETS — a section of the sequencer's ⚙ Config drop-up, shown on the PADS tab */}
            {setsNode && showSets && ReactDOM.createPortal(
                        <div style={{
                            borderTop: '1px solid #444',
                            paddingTop: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            minWidth: '220px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Drum Kits:</span>
                                {Object.keys(sets).map((n) => (
                                    <button key={n} onClick={() => { loadSet(n); closeConfig(); }}
                                        style={{
                                            background: currentSet === n ? 'var(--accent)' : '#222',
                                            color: currentSet === n ? '#111' : '#ccc',
                                            border: '1px solid #444',
                                            borderRadius: '3px',
                                            padding: '4px 10px',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            fontWeight: currentSet === n ? 'bold' : 'normal'
                                        }}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                            
                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                <button onClick={() => { newSet(); closeConfig(); }} title="Save the current kit as a new set"
                                    style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: '3px', padding: '5px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', flex: 1 }}>
                                    + NEW set
                                </button>
                                {window.PadBrowse && (
                                    <button onClick={() => { setShowPadBrowse(true); closeConfig(); }} title="Browse a folder into all 16 pads at once"
                                        style={{ background: 'var(--accent-t15)', color: '#111', border: 'none', borderRadius: '3px', padding: '5px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', flex: 1 }}>
                                        🎛 Pad Browser
                                    </button>
                                )}
                            </div>
                            
                            {currentSet && !isFactorySet(currentSet) && (
                                <button onClick={() => { deleteSet(currentSet); closeConfig(); }} title={`Delete "${currentSet}"`}
                                    style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '3px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer', alignSelf: 'flex-start', marginTop: '4px' }}>✕ Delete "{currentSet}"</button>
                            )}
                        </div>,
                setsNode
            )}
            {browsePad != null && window.SoundBrowser && (
                <window.SoundBrowser
                    targetLabel={(KIT[browsePad] && KIT[browsePad].name) || `Pad ${browsePad + 1}`}
                    onClose={() => setBrowsePad(null)}
                    onChoose={(file, meta) => { handleFile(browsePad, file, meta); setBrowsePad(null); }}
                    onChooseOther={(file, meta) => { setBrowsePad(null); setPendingAssign({ file, meta }); }}
                />
            )}
            {showPadBrowse && window.PadBrowse && (
                <window.PadBrowse onClose={() => setShowPadBrowse(false)} />
            )}
            {pendingAssign && (
                <div style={{ position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 10001, background: 'var(--accent-t15)', color: '#111', padding: '8px 16px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
                    👆 Click a pad to assign "{pendingAssign.meta && pendingAssign.meta.name}" — Esc to cancel
                </div>
            )}
            {samplerEditorPad != null && window.SamplerEditor && ReactDOM.createPortal(
                <window.SamplerEditor
                    idx={samplerEditorPad}
                    name={(KIT[samplerEditorPad] && KIT[samplerEditorPad].name) || `Pad ${samplerEditorPad + 1}`}
                    onClose={() => setSamplerEditorPad(null)}
                />,
                document.body
            )}
        </div>
    );
};
window.Pads = Pads;
