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

window.useSeqPointer = (patternRef, writeStepVel, recordingRef, setRecordedNotes, previewVoice, setActiveFader) => {
    const velOf = (c) => (typeof c === 'number' ? c : (c ? 100 : 0));

    const onStepPointerDown = (e, trkIdx, step) => {
        e.preventDefault();
        if (!e.altKey) {
            const startX = e.clientX;
            const startY = e.clientY;
            const startVel = velOf(patternRef.current[trkIdx][step]);
            const paintVel = startVel > 0 ? 0 : 100;
            
            writeStepVel(trkIdx, step, paintVel);
            if (recordingRef.current && paintVel > 0) {
                setRecordedNotes(prev => { const next = new Set(prev); next.add(`${trkIdx}-${step}`); return next; });
            }
            if (paintVel > 0) previewVoice(trkIdx, paintVel);
            
            const painted = new Set([step]);
            let mode = null;
            let currentFaderVel = paintVel;
            
            const move = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                if (!mode) {
                    if (Math.abs(dy) > 5 && Math.abs(dy) > Math.abs(dx)) {
                        mode = 'fader';
                        if (paintVel === 0) {
                            currentFaderVel = Math.max(1, startVel);
                        }
                        setActiveFader({ trkIdx, step, vel: currentFaderVel, x: startX, y: startY });
                    } else if (Math.abs(dx) > 5 && Math.abs(dx) > Math.abs(dy)) {
                        mode = 'paint';
                    }
                }

                if (mode === 'paint') {
                    const el = document.elementFromPoint(ev.clientX, ev.clientY);
                    if (el && el.dataset && el.dataset.oaTrk !== undefined && Number(el.dataset.oaTrk) === trkIdx) {
                        const s = Number(el.dataset.oaStep);
                        if (!painted.has(s)) { 
                            painted.add(s); 
                            writeStepVel(trkIdx, s, paintVel); 
                            if (recordingRef.current && paintVel > 0) {
                                setRecordedNotes(prev => { const next = new Set(prev); next.add(`${trkIdx}-${s}`); return next; });
                            }
                            if (paintVel > 0) previewVoice(trkIdx, paintVel); 
                        }
                    }
                } else if (mode === 'fader') {
                    const vel = Math.max(0, Math.min(100, currentFaderVel + (startY - ev.clientY) * 0.8));
                    writeStepVel(trkIdx, step, vel);
                    setActiveFader((f) => (f ? { ...f, vel: Math.round(vel) } : f));
                }
            };

            const up = () => { 
                window.removeEventListener('pointermove', move); 
                window.removeEventListener('pointerup', up); 
                if (mode === 'fader') setActiveFader(null);
            };
            
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            return;
        }
        const startY = e.clientY;
        const startVel = velOf(patternRef.current[trkIdx][step]) || 100;
        writeStepVel(trkIdx, step, startVel);
        if (recordingRef.current) {
            setRecordedNotes(prev => { const next = new Set(prev); next.add(`${trkIdx}-${step}`); return next; });
        }
        setActiveFader({ trkIdx, step, vel: Math.round(startVel), x: e.clientX, y: e.clientY });
        const move = (ev) => {
            const vel = Math.max(1, Math.min(100, startVel + (startY - ev.clientY) * 0.5));
            writeStepVel(trkIdx, step, vel);
            setActiveFader((f) => (f ? { ...f, vel: Math.round(vel) } : f));
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            setActiveFader(null);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    return { onStepPointerDown };
};
