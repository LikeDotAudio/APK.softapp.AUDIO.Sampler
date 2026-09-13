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

window.SeqToneTrack = ({ toneRoot, steps, toneTrack, toneTrackRef, toneRootRef, isPlaying, currentStep, recordedNotes, setSeqRef, patternRef, bpmRef, stepsRef, recordingRef, setRecordedNotes, trackVolRef }) => {
    const TRACKS = window.OA_DRUM_KIT || [];
    
    return (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--accent-s25)', paddingBottom: '8px' }}>
            <div style={{ width: '110px', flexShrink: 0, paddingRight: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--accent-t25)', fontWeight: 'bold' }}>
                    TONE: {(TRACKS[toneRoot] && TRACKS[toneRoot].name) || `Pad ${toneRoot+1}`}
                </span>
            </div>
            <div style={{ display: 'flex', gap: '3px', background: 'var(--accent-s85)', padding: '4px', borderRadius: '4px', border: '1px solid var(--accent-s70)' }}>
                {[...Array(steps)].map((_, step) => {
                    const noteData = toneTrack[step];
                    const isLit = noteData && noteData.vel > 0;
                    const isBeat = step % 4 === 0;
                    const isCurrent = isPlaying && currentStep === step;
                    const isNewlyRecorded = recordedNotes.has(`tone-${step}`);
                    
                    const pitch = isLit ? noteData.pitch : 0;
                    const pitchPercent = (pitch / 15) * 100;
                    
                    return (
                        <div key={`tone-${step}`}
                            onPointerDown={(e) => {
                                e.preventDefault();
                                const current = toneTrackRef.current[step];
                                const nextVel = current && current.vel > 0 ? 0 : 100;
                                // Default to root pitch (0) if none
                                const nextPitch = current ? current.pitch : 0;
                                
                                const newTrack = [...toneTrackRef.current];
                                newTrack[step] = nextVel > 0 ? { vel: nextVel, pitch: nextPitch } : null;
                                if (recordingRef.current && nextVel > 0) {
                                    setRecordedNotes(prev => { const next = new Set(prev); next.add(`tone-${step}`); return next; });
                                }
                                setSeqRef.current({ grid: patternRef.current, bpm: bpmRef.current, steps: stepsRef.current, toneTrack: newTrack, toneRoot: toneRootRef.current });
                                if (nextVel > 0 && window.oaTriggerTone) window.oaTriggerTone(toneRootRef.current, nextPitch, 1);
                            }}
                            title={isLit ? `Pitch: +${pitch} st · Vel: ${noteData.vel}` : 'Click to add/remove note'}
                            style={{
                                position: 'relative', overflow: 'hidden',
                                width: '18px', height: '20px',
                                backgroundColor: isCurrent ? '#fff' : (isBeat && !isLit ? 'var(--accent-s80)' : '#29140a'),
                                border: isLit ? (isNewlyRecorded ? '1px solid #ff5252' : '1px solid var(--accent)') : '1px solid #221100',
                                cursor: 'pointer', borderRadius: '2px', touchAction: 'none',
                                boxShadow: isLit ? (isNewlyRecorded ? `0 0 4px rgba(211,47,47,0.6)` : `0 0 4px rgba(var(--accent-rgb),0.6)`) : 'none',
                            }}>
                            {isLit && !isCurrent && (
                                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.max(14, noteData.vel)}%`, background: isNewlyRecorded ? `rgba(211,47,47,0.7)` : `rgba(var(--accent-rgb),0.7)`, pointerEvents: 'none' }} />
                            )}
                            {isLit && (
                                <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${Math.min(90, pitchPercent)}%`, height: '2px', background: '#fff', pointerEvents: 'none' }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
