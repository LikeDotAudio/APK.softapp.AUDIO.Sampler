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

window.useSeqScheduler = (
    bpmRef, stepsRef, mutesRef, trackVolRef, trackPanRef, 
    recordingRef, clickVolRef, toneTrackRef, toneRootRef,
    patternRef, currentStepRef, setRecordedNotes, setSeqRef, getAudioCtx,
    solosRef, masterVolRef, swingRef
) => {
    const nextNoteTimeRef = React.useRef(0);
    const timerIDRef = React.useRef(null);
    const workerRef = React.useRef(null);
    // Cushion. Audio already booked keeps playing while the main thread is busy,
    // so this is exactly how long a hiccup can last before you hear a gap.
    // Traded against edit latency: a step you toggle is heard within this window.
    const scheduleAheadTime = 0.4; // s
    const TICK_MS = 25;

    // The clock runs on a Worker thread, NOT requestAnimationFrame.
    // rAF is starved by anything busy on the main thread — a big React render, a
    // GC pause, a repaint — and pauses outright when the tab is hidden. When it
    // stops, nothing books new notes and playback simply stops.
    const makeTicker = () => {
        const src = 'let id=null;onmessage=function(e){' +
            'if(e.data.cmd==="start"){clearInterval(id);id=setInterval(function(){postMessage(0)},e.data.ms)}' +
            'else{clearInterval(id);id=null}};';
        const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
        const w = new Worker(url);
        URL.revokeObjectURL(url);
        return w;
    };

    // Live recording needs to quantise a pad strike to the nearest playing step.
    // We maintain a history of recently scheduled step times to match against ctx.currentTime.
    window.OA_SEQ_TIMES = window.OA_SEQ_TIMES || [];
    window.OA_SEQ_SKIP = window.OA_SEQ_SKIP || new Set();

    const nextNote = (songRef, setSongPos, applySongEntry, songItemsRef, libraryRef, nextPatternRef) => {
        const secondsPerBeat = 60.0 / bpmRef.current;
        // Swing (50% = straight equal 16th notes).
        // For off-beat 16th notes (odd step index), step duration is proportional to swing / 50.
        // On even steps (downbeats), step duration is proportional to (100 - swing) / 50.
        const currentSwing = (swingRef && swingRef.current != null) ? swingRef.current : 50;
        const isOdd = (currentStepRef.current % 2) !== 0;
        const factor = isOdd ? (currentSwing / 50.0) : ((100.0 - currentSwing) / 50.0);
        nextNoteTimeRef.current += 0.25 * secondsPerBeat * factor; // 16th note with swing factor
        currentStepRef.current = (currentStepRef.current + 1) % stepsRef.current;
        if (currentStepRef.current === 0) {
            if (nextPatternRef && nextPatternRef.current) {
                const target = nextPatternRef.current;
                nextPatternRef.current = null;
                if (songRef.current) {
                    songRef.current = { idx: target.idx, repeated: 0 };
                    setSongPos(target.idx);
                }
                applySongEntry(target.entry);
            } else if (songRef.current) {
                advanceSong(songRef, setSongPos, applySongEntry, songItemsRef, libraryRef);
            }
        }
    };

    const advanceSong = (songRef, setSongPos, applySongEntry, songItemsRef, libraryRef) => {
        const items = songItemsRef.current || [];
        const libItems = libraryRef.current || [];
        if (!items.length) {
            songRef.current = null; setSongPos(null);
            return;
        }

        const currentIdx = songRef.current.idx;
        const currentItem = items[currentIdx];
        const currentRepeated = songRef.current.repeated || 0;
        const currentRepeatTarget = (currentItem && typeof currentItem === 'object') ? (currentItem.repeat || 0) : 0;

        if (currentRepeated < currentRepeatTarget) {
            // Repeat current pattern
            songRef.current = { idx: currentIdx, repeated: currentRepeated + 1 };
            const entry = libItems.find((p) => p.name === ((currentItem && typeof currentItem === 'object') ? currentItem.name : currentItem));
            if (entry) { applySongEntry(entry); return; }
        }

        for (let hop = 1; hop <= items.length; hop++) {
            const idx = (currentIdx + hop) % items.length;
            const item = items[idx];
            const name = (item && typeof item === 'object') ? item.name : item;
            const entry = libItems.find((p) => p.name === name);
            if (entry) {
                songRef.current = { idx, repeated: 0 };
                setSongPos(idx);
                applySongEntry(entry);
                return;
            }
        }
        songRef.current = null; setSongPos(null);   // nothing playable left
    };

    // Notes are scheduled up to `scheduleAheadTime` early and the hardware adds
    // its own output latency on top, so anything drawn the instant a note is
    // scheduled runs ahead of what you hear. Everything visual is delayed by
    // this instead, landing it on the sound.
    const visualDelay = (ctx, time) => {
        const latency = ctx.outputLatency || ctx.baseLatency || 0;
        return Math.max(0, (time - ctx.currentTime + latency) * 1000);
    };

    const scheduleNote = (stepNumber, time, setCurrentStep) => {
        window.OA_SEQ_TIMES.push({ time, step: stepNumber, stepDur: 0.25 * (60.0 / bpmRef.current) });
        if (window.OA_SEQ_TIMES.length > 32) window.OA_SEQ_TIMES.shift();

        const ctx = getAudioCtx();
        const TRACKS = window.OA_DRUM_KIT || [];

        // The playhead lands with the step it marks, not with its scheduling.
        setTimeout(() => requestAnimationFrame(() => setCurrentStep(stepNumber)), visualDelay(ctx, time));

        const anySolo = solosRef && solosRef.current && solosRef.current.some(s => s);
        
        patternRef.current.forEach((track, trkIdx) => {
            const vel = typeof track[stepNumber] === 'number' ? track[stepNumber] : (track[stepNumber] ? 100 : 0);
            const isMuted = mutesRef.current[trkIdx] || (anySolo && !solosRef.current[trkIdx]);
            
            // A note recorded live already sounded under the player's finger —
            // let its first scheduled pass glow but stay silent.
            const skipKey = `${trkIdx}-${stepNumber}`;
            const justRecorded = window.OA_SEQ_SKIP.delete(skipKey);

            if (vel > 0 && !isMuted && !justRecorded) {
                // Velocity and the MASTER fader. The channel fader is applied
                // by a node inside the voice's chain (oaVoiceOut), so that a
                // pre-fader send can be tapped ahead of it; multiplying it in
                // here too would apply it twice.
                const vol = (vel / 100) * (masterVolRef && masterVolRef.current != null ? masterVolRef.current : 1);
                const pan = trackPanRef.current[trkIdx] || 0;
                setTimeout(() => window.dispatchEvent(new CustomEvent('oa-drum-play', { detail: { idx: trkIdx, velocity: vel } })), visualDelay(ctx, time));

                const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[trkIdx];
                if (entry && entry.buffer && window.oaPlayDrumSample) {
                    window.oaPlayDrumSample(ctx, Object.assign({}, entry, { loop: false }), time, vol, pan);
                } else if (window.oaPlayDrumVoice) {
                    window.oaPlayDrumVoice(ctx, { idx: trkIdx }, time, vol, pan);
                } else {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.frequency.value = TRACKS[trkIdx] ? TRACKS[trkIdx].freq : 440;
                    osc.type = TRACKS[trkIdx] ? TRACKS[trkIdx].type : 'sine';
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    gain.gain.setValueAtTime(vol, time);
                    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
                    osc.start(time);
                    osc.stop(time + 0.1);
                }
            }
        });

        if (recordingRef.current && clickVolRef.current > 0 && stepNumber % 4 === 0) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = stepNumber === 0 ? 1568 : 1046;
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.5 * clickVolRef.current, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
            osc.start(time);
            osc.stop(time + 0.06);
            // Let the Mixer's CLICK meter flash in time with the audible click.
            const clickLevel = clickVolRef.current;
            setTimeout(() => window.dispatchEvent(new CustomEvent('oa-click', { detail: { velocity: clickLevel * 100 } })), visualDelay(ctx, time));
        }

        const tTrack = toneTrackRef.current;
        const tRoot = toneRootRef.current;
        if (tTrack && tRoot !== null && tTrack[stepNumber]) {
            const { vel, pitch } = tTrack[stepNumber];
            if (vel > 0 && window.oaTriggerTone) {
                const vol = (vel / 100) * (trackVolRef.current[tRoot] == null ? 1 : trackVolRef.current[tRoot]);
                window.oaTriggerTone(tRoot, pitch, vol, time);
                setTimeout(() => window.dispatchEvent(new CustomEvent('oa-drum-play', { detail: { idx: tRoot, velocity: vel } })), visualDelay(ctx, time));
            }
        }
    };

    // One scheduling pass: book every note that falls inside the lookahead.
    const pass = (setCurrentStep, songRef, setSongPos, applySongEntry, songItemsRef, libraryRef, nextPatternRef) => {
        const ctx = getAudioCtx();

        // The context can be suspended out from under us (tab backgrounded, OS
        // audio change). Without this, currentTime freezes and nothing advances.
        if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }

        // Only resync after a genuinely long freeze. A short overrun should be
        // caught up note-by-note, not discarded — dropping notes to "catch up"
        // is itself audible.
        if (nextNoteTimeRef.current < ctx.currentTime - 1.0) {
            nextNoteTimeRef.current = ctx.currentTime + 0.02;
        }

        let guard = 0;
        while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime && guard++ < 128) {
            scheduleNote(currentStepRef.current, nextNoteTimeRef.current, setCurrentStep);
            nextNote(songRef, setSongPos, applySongEntry, songItemsRef, libraryRef, nextPatternRef);
        }
    };

    const scheduler = (setCurrentStep, songRef, setSongPos, applySongEntry, songItemsRef, libraryRef, nextPatternRef) => {
        const tick = () => pass(setCurrentStep, songRef, setSongPos, applySongEntry, songItemsRef, libraryRef, nextPatternRef);
        tick();   // book the first notes immediately

        if (typeof Worker !== 'undefined') {
            if (!workerRef.current) workerRef.current = makeTicker();
            workerRef.current.onmessage = tick;
            workerRef.current.postMessage({ cmd: 'start', ms: TICK_MS });
        } else {
            // No Worker (very old browser): fall back to a main-thread timer,
            // still better than rAF because it is not tied to painting.
            const loop = () => { tick(); timerIDRef.current = setTimeout(loop, TICK_MS); };
            timerIDRef.current = setTimeout(loop, TICK_MS);
        }
    };

    const stopScheduler = () => {
        if (workerRef.current) {
            workerRef.current.postMessage({ cmd: 'stop' });
            workerRef.current.onmessage = null;
        }
        if (timerIDRef.current != null) {
            clearTimeout(timerIDRef.current);
            cancelAnimationFrame(timerIDRef.current);   // harmless if it was a timeout
            timerIDRef.current = null;
        }
    };

    // STOP is not the same as GO AWAY. stopScheduler() parks the clock between
    // transport presses and the Worker is reused on the next play, which is what
    // you want — spinning a thread up costs milliseconds and the first note is
    // due immediately. But a Worker outlives the component that made it unless
    // it is told not to, so unmounting the Sequencer without this leaves a live
    // thread and its Blob URL behind, and mounting it again makes another.
    const disposeScheduler = () => {
        stopScheduler();
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
    };

    React.useEffect(() => disposeScheduler, []);

    return { timerIDRef, nextNoteTimeRef, scheduler, stopScheduler, disposeScheduler };
};
