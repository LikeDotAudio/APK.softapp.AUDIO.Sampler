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

window.SeqTrack = ({ 
    trackName, trkIdx, muted, tvol, 
    toggleMute, openMenu,
    steps, pattern, isPlaying, currentStep, activeFader, recordedNotes,
    onStepPointerDown
}) => {
    const volAngle = -135 + tvol * 270;
    const velOf = (c) => (typeof c === 'number' ? c : (c ? 100 : 0));

    // With no sample loaded this track IS a synth voice, so its name opens the
    // synth editor rather than the sample menu.
    const hasSample = !!(window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[trkIdx] && window.OA_DRUM_SAMPLES[trkIdx].buffer);
    const onNameClick = (e) => {
        if (hasSample) return openMenu(e);
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('oa-open-synth', { detail: { idx: trkIdx } }));
    };

    return (
        <div
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = e.dataTransfer ? e.dataTransfer.files : [];
                if (files && files.length > 0 && window.oaLoadSampleToPad) {
                    await window.oaLoadSampleToPad(trkIdx, files[0]);
                    window.dispatchEvent(new CustomEvent('oa-sample-changed', { detail: { idx: trkIdx } }));
                }
            }}
            style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <div style={{ width: '70px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px', paddingRight: '6px', position: 'sticky', left: 0, background: '#161616', zIndex: 2 }}>
                <span
                    onClick={onNameClick}
                    title={hasSample
                        ? `${trackName} — click to pick a sample / pitch / vol / pan`
                        : `${trackName} — no sample loaded; click to edit its synth voice`}
                    style={{ fontSize: '11px', color: muted ? '#666' : (hasSample ? '#ccc' : '#9fb6c9'), textAlign: 'right', whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                    {trackName}
                </span>
            </div>
            {/* Half the vertical padding of the horizontal — rows sit tighter
                together without crowding the steps side to side. */}
            <div role="group" aria-label={`${trackName} — ${steps} steps`} style={{ display: 'flex', gap: '3px', background: '#0a0a0a', padding: '2px 4px', borderRadius: '4px', border: '1px solid #222', opacity: muted ? 0.4 : 1 }}>
                {[...Array(steps)].map((_, step) => {
                    const vel = velOf(pattern[trkIdx][step]);
                    const isLit = vel > 0;
                    const isBeat = step % 4 === 0;
                    const isCurrent = isPlaying && currentStep === step;
                    const isFading = activeFader && activeFader.trkIdx === trkIdx && activeFader.step === step;
                    const isNewlyRecorded = recordedNotes.has(`${trkIdx}-${step}`);

                    return (
                        <div key={step}
                            data-oa-trk={trkIdx} data-oa-step={step}
                            role="checkbox"
                            aria-checked={isLit}
                            aria-label={`${trackName} step ${step + 1}${isLit ? `, velocity ${vel}` : ''}`}
                            onPointerDown={(e) => onStepPointerDown(e, trkIdx, step)}
                            title={isLit ? `Velocity ${vel} — Drag up/down to adjust intensity` : 'Click/drag horizontally to paint · Drag vertically for intensity'}
                            style={{
                                position: 'relative', overflow: 'hidden',
                                width: '18px', height: '20px',
                                backgroundColor: isCurrent ? '#fff' : (isBeat && !isLit ? '#333' : '#1a1a1a'),
                                border: isFading ? '1px solid #fff' : (isLit ? (isNewlyRecorded ? '1px solid #ff5252' : '1px solid var(--accent-t15)') : '1px solid #111'),
                                cursor: 'pointer', borderRadius: '2px', touchAction: 'none',
                                boxShadow: isLit ? (isNewlyRecorded ? `0 0 4px rgba(211, 47, 47, ${0.2 + 0.4 * (vel / 100)})` : `0 0 4px rgba(var(--accent-rgb), ${0.2 + 0.4 * (vel / 100)})`) : 'none',
                            }}>
                            {isLit && !isCurrent && (
                                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.max(14, vel)}%`, background: isNewlyRecorded ? `rgba(211, 47, 47, ${0.4 + 0.6 * (vel / 100)})` : `rgba(var(--accent-rgb), ${0.4 + 0.6 * (vel / 100)})`, pointerEvents: 'none' }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
