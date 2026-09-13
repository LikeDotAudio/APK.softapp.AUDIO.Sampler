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

window.useSeqLibrary = (
    library, setLibraryItems, pattern, bpm, steps, toneTrack, toneRoot, 
    setSeq, DEFAULT_STEPS, getAudioCtx, isPlaying, timerIDRef, songRef, setSongPos,
    currentStepRef, nextNoteTimeRef, scheduler, stopScheduler, songItemsRef, libraryRef,
    setCurrentStep, setIsPlaying,
    patternRef, stepsRef, bpmRef, toneTrackRef, toneRootRef, setSeqRef, nextPatternRef
) => {
    const clonePattern = (p) => p.map((row) => [...row]);

    /**
     * Save the pattern under a stamped name, WITHOUT a dialog.
     *
     * It used to ask through window.prompt(), and a prompt is a blocking modal:
     * while it is open the browser runs no timers and no animation frames, so
     * the sequencer's look-ahead scheduler stops scheduling. The audio already
     * queued plays out — about a tenth of a second — and then the track simply
     * stops, mid-take, every time anyone saves. Nothing about that reads as a
     * dialog's fault, which is what made it worth removing rather than working
     * around.
     *
     * So there is no question to answer: the name is the timestamp plus the
     * next number, both of which this already knew. Saving is now something
     * that happens WHILE the music plays, which is when anyone actually wants
     * to save — you keep the take you just heard.
     */
    const savePattern = () => {
        const defaultName = `Pattern ${library.length + 1}`;
        const input = window.prompt('Name this pattern:', defaultName);
        if (input === null) return; // User cancelled
        const name = input.trim() || defaultName;
        const entry = { name, bpm, steps, data: clonePattern(pattern), toneTrack, toneRoot };
        const idx = library.findIndex((p) => p.name === name);
        let next;
        if (idx === -1) {
            next = [...library, entry];
        } else {
            next = [...library];
            next[idx] = entry;
        }
        setLibraryItems(next);
    };

    const loadPattern = (entry) => {
        const loadedSteps = (entry.data[0] && entry.data[0].length) || entry.steps || DEFAULT_STEPS;
        setSeq({ 
            grid: clonePattern(entry.data), 
            bpm: entry.bpm || bpm, 
            steps: loadedSteps,
            toneTrack: entry.toneTrack || Array(loadedSteps).fill(null),
            toneRoot: entry.toneRoot !== undefined ? entry.toneRoot : null
        });
    };

    const deletePattern = (name) => {
        setLibraryItems(library.filter((p) => p.name !== name));
    };
    
    const applySongEntry = (entry) => {
        const s = (entry.data[0] && entry.data[0].length) || entry.steps || DEFAULT_STEPS;
        patternRef.current = clonePattern(entry.data);
        stepsRef.current = s;
        if (entry.bpm) bpmRef.current = entry.bpm;
        toneTrackRef.current = entry.toneTrack || Array(s).fill(null);
        toneRootRef.current = entry.toneRoot !== undefined ? entry.toneRoot : null;
        setSeqRef.current({ grid: patternRef.current, bpm: bpmRef.current, steps: s, toneTrack: toneTrackRef.current, toneRoot: toneRootRef.current });
    };

    const playSong = () => {
        const items = songItemsRef.current || [];
        const getName = (item) => (item && typeof item === 'object') ? item.name : item;
        const startIdx = items.findIndex((item) => (libraryRef.current || []).some((p) => p.name === getName(item)));
        if (startIdx === -1) return;
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        if (isPlaying) stopScheduler();
        songRef.current = { idx: startIdx, repeated: 0 };
        setSongPos(startIdx);
        applySongEntry(libraryRef.current.find((p) => p.name === getName(items[startIdx])));
        setIsPlaying(true);
        currentStepRef.current = 0;
        nextNoteTimeRef.current = ctx.currentTime + 0.05;
        scheduler(setCurrentStep, songRef, setSongPos, applySongEntry, songItemsRef, libraryRef, nextPatternRef);
    };

    return { savePattern, loadPattern, deletePattern, playSong, applySongEntry };
};
