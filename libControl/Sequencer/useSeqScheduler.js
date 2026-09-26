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

// THE CLOCK TICKS FROM THE AUDIO THREAD. PLAN-3315.01 step 9.
//
// A processor with no inputs that posts one message every ~TICK_MS of
// rendered audio. Its ticks are counted in the context's own frames, so they
// come exactly as fast as the context plays — never clamped the way a timer
// is, and silent while the context is not running, when there is nothing to
// book against anyway. The BOOKING stays on the page: an AudioNode can only be
// made on the main thread, so what moved is the thing that says "book now",
// not the booking. The Worker ticker below stays as the watchdog at a slow
// rate, because a suspended context renders nothing, and `pass()` is what
// resumes it.
const OA_SEQ_CLOCK_SRC = `
class OaSeqClock extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const ms = (options && options.processorOptions && options.processorOptions.ms) || 25;
    this.every = Math.max(1, Math.round((ms / 1000) * sampleRate / 128));
    this.n = 0;
    this.run = false;
    this.port.onmessage = (e) => { this.run = !!(e.data && e.data.run); this.n = 0; };
  }
  process() {
    try {
      if (this.run && ++this.n >= this.every) { this.n = 0; this.port.postMessage(0); }
    } catch (e) { /* a tick missed is the watchdog's to cover */ }
    return true;
  }
}
registerProcessor('oa-seq-clock', OaSeqClock);
`;

// The module is registered once per context; each sequencer builds its own
// clock node on its first play. Resolves to the node, or to null where there
// is no AudioWorklet — the Worker ticker then carries the clock alone, at full
// rate, as it always did.
const oaSeqClockNode = async (ctx, ms) => {
    if (!ctx.audioWorklet || !window.AudioWorkletNode || !window.Blob || !window.URL) return null;
    try {
        if (!ctx.__oaSeqClockModule) {
            const url = URL.createObjectURL(new Blob([OA_SEQ_CLOCK_SRC], { type: 'application/javascript' }));
            ctx.__oaSeqClockModule = ctx.audioWorklet.addModule(url)
                .catch((e) => { ctx.__oaSeqClockModule = null; throw e; });
        }
        await ctx.__oaSeqClockModule;
        const node = new AudioWorkletNode(ctx, 'oa-seq-clock', {
            numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
            processorOptions: { ms },
        });
        // Pulled by the destination through a silent gain, so the graph keeps
        // rendering it.
        const sink = ctx.createGain();
        sink.gain.value = 0;
        node.connect(sink);
        sink.connect(ctx.destination);
        node.__oaSink = sink;
        return node;
    } catch (e) {
        console.warn('⚠️ [SEQ] audio-thread clock unavailable, the Worker ticker carries it:', e && e.message);
        return null;
    }
};

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
    // The Worker's rate once the audio-thread clock is ticking: often enough
    // to resume a suspended context and book the notes it had missed within
    // the cushion above, rarely enough to be no second clock.
    const WATCHDOG_MS = 200;
    const clockRef = React.useRef(null);
    const runningRef = React.useRef(false);

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
        runningRef.current = true;

        // The audio-thread clock, when this context can have one. Until it is
        // ticking, and wherever it cannot, the Worker below is the clock.
        const ctx = getAudioCtx();
        const clock = (clockRef.current && clockRef.current.context === ctx)
            ? Promise.resolve(clockRef.current)
            : oaSeqClockNode(ctx, TICK_MS);
        clock.then((node) => {
            if (!node) return;
            if (clockRef.current !== node) { dropClock(); clockRef.current = node; }
            if (!runningRef.current) return;   // stopped while it was being built
            node.port.onmessage = tick;
            node.port.postMessage({ run: true });
            // A processor that dies hands the clock back to the Worker, at full rate.
            node.onprocessorerror = () => {
                if (clockRef.current === node) dropClock();
                if (runningRef.current && workerRef.current) workerRef.current.postMessage({ cmd: 'start', ms: TICK_MS });
            };
            if (workerRef.current) workerRef.current.postMessage({ cmd: 'start', ms: WATCHDOG_MS });
        });

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

    // The clock node is PARKED between plays like the Worker, and only let go
    // on unmount — or when the context it was built on is not this one.
    const dropClock = () => {
        const node = clockRef.current;
        clockRef.current = null;
        if (!node) return;
        node.port.onmessage = null;
        try { node.disconnect(); if (node.__oaSink) node.__oaSink.disconnect(); } catch (e) { /* already off */ }
    };

    const stopScheduler = () => {
        runningRef.current = false;
        if (clockRef.current) {
            clockRef.current.port.postMessage({ run: false });
            clockRef.current.port.onmessage = null;
        }
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
        dropClock();
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
    };

    React.useEffect(() => disposeScheduler, []);

    return { timerIDRef, nextNoteTimeRef, scheduler, stopScheduler, disposeScheduler };
};
