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

// The drum kit is shared with the Sampler (DrumKit.js) so a Sampler pad and the
// matching Sequencer track are the SAME voice — including any sample loaded onto
// that pad. Held by reference: changing the pad grid resizes this same array, so
// the track list follows without this module reloading.
const TRACKS = window.OA_DRUM_KIT || [];
const DEFAULT_STEPS = 16;   // lengths to choose from: window.OA_STEP_OPTIONS
const LIBRARY_KEY = 'oaSequencerLibrary';
const NOTATION_KEY = 'oaSequencerNotation';

// A step cell holds a VELOCITY: 0 = off, 1-100 = on at that intensity.
// velOf tolerates legacy boolean grids (true -> 100).
const emptyPattern = (steps) => Array(TRACKS.length).fill().map(() => Array(steps).fill(0));
const velOf = (c) => (typeof c === 'number' ? c : (c ? 100 : 0));
const clonePattern = (p) => p.map((row) => [...row]);

const loadLibrary = () => {
    try {
        return JSON.parse(window.localStorage.getItem(LIBRARY_KEY)) || [];
    } catch (e) {
        return [];
    }
};

const SeqKnob = window.SeqKnob;
const SeqButton = window.SeqButton;
const TrackSampleMenu = window.TrackSampleMenu;

const Sequencer = ({ activeTabs = ['SEQ'], label = "Pattern Sequencer" }) => {
    // One row per pad. TRACKS is the kit array itself, so it has already
    // resized — this is what tells React to draw the difference.
    window.useOaPadGrid();
    const {
        safeLabel, isPlaying, setIsPlaying, currentStep, setCurrentStep,
        seq, setSeq, steps, pattern, bpm, swing, toneTrack, toneRoot,
        stepsRef, patternRef, bpmRef, swingRef, toneTrackRef, toneRootRef,
        setPattern, setBpm, setSwing, tapping, tapTempo, setSteps, doubleTo,
        clickVol, setClickVol, clickVolRef,
        mutes, mutesRef, toggleMute, setMutes,
        solos, solosRef, toggleSolo, clearSolos, setSolos,
        trackVol, setTrackVol, trackVolRef, trackPan, setTrackPan, trackPanRef,
        masterVol, setMasterVol, masterVolRef,
        recording, toggleRecording, recordingRef,
        recordedNotes, setRecordedNotes,
        writeStepVel, previewVoice, getAudioCtx, currentStepRef,
        setSeqRef,
        library, setLibraryItems, song, setSongItems, songItemsRef, libraryRef, songRef, nextPatternRef, songPos, setSongPos
    } = window.useSeqState(label, DEFAULT_STEPS, TRACKS);

    const { trackMenu, setTrackMenu, browseTrack, setBrowseTrack, trackVer, setTrackVer, loadTrackSample } = window.useSeqMenus();

    const { timerIDRef, nextNoteTimeRef, scheduler, stopScheduler } = window.useSeqScheduler(
        bpmRef, stepsRef, mutesRef, trackVolRef, trackPanRef, 
        recordingRef, clickVolRef, toneTrackRef, toneRootRef,
        patternRef, currentStepRef, setRecordedNotes, setSeqRef, getAudioCtx,
        solosRef, masterVolRef, swingRef
    );

    const [activeFader, setActiveFader] = React.useState(null);

    // The staff under the grid, and whether it is showing. On unless it has
    // been turned off — a read-out nobody knows is there is a read-out nobody
    // reads. Persisted per browser rather than in the pattern: it is how this
    // person reads, not part of the music, so loading somebody else's pattern
    // must not change it.
    const [notation, setNotation] = React.useState(() => {
        try { return window.localStorage.getItem(NOTATION_KEY) !== '0'; } catch (e) { return true; }
    });
    const toggleNotation = () => setNotation((on) => {
        try { window.localStorage.setItem(NOTATION_KEY, on ? '0' : '1'); } catch (e) {}
        return !on;
    });

    const { savePattern, loadPattern, deletePattern, playSong, applySongEntry } = window.useSeqLibrary(
        library, setLibraryItems, pattern, bpm, steps, toneTrack, toneRoot, 
        setSeq, DEFAULT_STEPS, getAudioCtx, isPlaying, timerIDRef, songRef, setSongPos,
        currentStepRef, nextNoteTimeRef, scheduler, stopScheduler, songItemsRef, libraryRef,
        setCurrentStep, setIsPlaying,
        patternRef, stepsRef, bpmRef, toneTrackRef, toneRootRef, setSeqRef, nextPatternRef
    );

    const { onStepPointerDown } = window.useSeqPointer(patternRef, writeStepVel, recordingRef, setRecordedNotes, previewVoice, setActiveFader);

    const togglePlayback = () => {
        const ctx = getAudioCtx();
        if (isPlaying) {
            stopScheduler();
            setIsPlaying(false);
            setCurrentStep(0);
            songRef.current = null;
            setSongPos(null);
        } else {
            if (ctx.state === 'suspended') ctx.resume();
            songRef.current = null;
            setSongPos(null);
            setIsPlaying(true);
            currentStepRef.current = 0;
            nextNoteTimeRef.current = ctx.currentTime + 0.05;
            scheduler(setCurrentStep, songRef, setSongPos, applySongEntry, songItemsRef, libraryRef, nextPatternRef);
        }
    };

    const clearPattern = () => setSeq({ grid: emptyPattern(steps), bpm, steps, toneTrack: Array(steps).fill(null), toneRoot: null });

    // Space / Ctrl+Space drive the transport from anywhere in the app. Declared
    // after togglePlayback so it is not read before it exists.
    window.useSeqTransportKeys(isPlaying, togglePlayback, recording, toggleRecording);

    const { rendering, renderLoop, renderStems } = window.useSeqRenderer(pattern, steps, mutes, bpm, safeLabel);

    const [configOpen, setConfigOpen] = React.useState(false);
    const configRef = React.useRef(null);
    // Sections portalled into the drop-up (e.g. Pads' Sets) close it this way.
    React.useEffect(() => {
        const close = () => setConfigOpen(false);
        window.addEventListener('oa-close-config', close);
        return () => window.removeEventListener('oa-close-config', close);
    }, []);

    // Anything outside the panel — a tab, a pad, the page — dismisses it, as a
    // drop-up should. The ⚙ button is excluded so it still toggles.
    React.useEffect(() => {
        if (!configOpen) return;
        const onDown = (e) => {
            if (configRef.current && configRef.current.contains(e.target)) return;
            const btn = document.getElementById('config-footer-slot');
            if (btn && btn.contains(e.target)) return;
            setConfigOpen(false);
        };
        const onEsc = (e) => { if (e.key === 'Escape') setConfigOpen(false); };
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('keydown', onEsc);
        };
    }, [configOpen]);

    const configStyle = {
        display: configOpen ? 'flex' : 'none',
        flexDirection: 'column',
        position: 'fixed',
        bottom: '46px',
        right: '12px',
        background: 'var(--panel)',
        padding: '16px',
        border: '1px solid #444',
        borderRadius: '8px',
        zIndex: 1000,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.6)',
        maxHeight: '75vh',
        overflowY: 'auto',
        gap: '12px',
        // Sized by its contents on a desktop, but never wider than the screen —
        // on a phone it shrinks to the viewport and the rows inside wrap.
        width: 'max-content',
        maxWidth: 'calc(100vw - 24px)',
        boxSizing: 'border-box'
    };

    const showSeq = activeTabs.includes('SEQ');
    const showSong = activeTabs.includes('SONG');
    // SEQ and SONG share ONE panel slot in App (they are both this component), so
    // App's "most-recently-pressed sits on top" re-ordering cannot separate them —
    // it only ever sees the pair. Their stacking is decided here instead, by the
    // same rule: lower index in activeTabs = pressed more recently = on top.
    const seqOrder = activeTabs.indexOf('SEQ');
    const songOrder = activeTabs.indexOf('SONG');
    const songOnTop = showSong && (!showSeq || songOrder < seqOrder);
    // The rule between the two, drawn at the top of whichever one is underneath.
    const divider = <hr style={{ borderColor: '#444', margin: '20px 0' }} />;

    return (
        <div style={{ padding: '0', backgroundColor: 'transparent', borderRadius: '0', color: '#fff', border: 'none', width: '100%', boxSizing: 'border-box', marginTop: '10px' }}>
                {/* Portalled to <body>: the drop-up must show even when this panel's
                    tab is closed, since its footer controls are always live. */}
                {ReactDOM.createPortal(
                <div ref={configRef} style={configStyle}>
                    <window.SeqControls
                        recording={recording}
                        toggleRecording={toggleRecording}
                        clickVol={clickVol}
                        setClickVol={setClickVol}
                        isPlaying={isPlaying}
                        togglePlayback={togglePlayback}
                        bpm={bpm}
                        setBpm={setBpm}
                        swing={swing}
                        setSwing={setSwing}
                        tapping={tapping}
                        tapTempo={tapTempo}
                        steps={steps}
                        setSteps={setSteps}
                        doubleTo={doubleTo}
                        rendering={rendering}
                        renderLoop={renderLoop}
                        savePattern={savePattern}
                        clearPattern={clearPattern}
                        configOpen={configOpen}
                        setConfigOpen={setConfigOpen}
                    />
                    {/* Pads portals its drum-kit Sets section in here when the PADS tab is open. */}
                    <div id="config-dropup-slot" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}></div>
                </div>, document.body)}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
            {showSong && (
                <div style={{ order: songOrder }}>
                {showSeq && !songOnTop && divider}
                <window.SeqSong
                    library={library}
                    setLibraryItems={setLibraryItems}
                    songPos={songPos}
                    song={song} 
                    togglePlayback={togglePlayback} 
                    playSong={playSong} 
                    setSongItems={setSongItems}
                    setSongPos={setSongPos}
                    mixer={{ trackVol, trackPan, mutes, solos, masterVol, clickVol, bpm, steps }}
                    setMixer={{ setTrackVol, setTrackPan, setMutes, setSolos, setMasterVol, setClickVol, setBpm, setSteps }}
                    nextPatternRef={nextPatternRef}
                    loadPattern={loadPattern}
                    isPlaying={isPlaying}
                />

                <window.SeqLibrary
                    library={library}
                    loadPattern={loadPattern}
                    deletePattern={deletePattern}
                    setSongItems={setSongItems}
                    song={song}
                    rendering={rendering}
                    renderLoop={renderLoop}
                    renderStems={renderStems}
                    clearPattern={clearPattern}
                />
                </div>
            )}

            {showSeq && (
            <div style={{ order: seqOrder }}>
            {showSong && songOnTop && divider}
            <div className="chunky-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowX: 'auto', alignItems: 'safe center', paddingBottom: '6px' }}>
                {TRACKS.map(({ name: trackName }, trkIdx) => {
                  const muted = mutes[trkIdx];
                  const tvol = trackVol[trkIdx] == null ? 1 : trackVol[trkIdx];
                  const openMenu = (e) => { e.stopPropagation(); setTrackMenu({ trkIdx, x: e.clientX, y: e.clientY }); };
                  return (
                    <window.SeqTrack 
                        key={trkIdx}
                        trackName={trackName}
                        trkIdx={trkIdx}
                        muted={muted}
                        tvol={tvol}
                        toggleMute={toggleMute}
                        openMenu={openMenu}
                        steps={steps}
                        pattern={pattern}
                        isPlaying={isPlaying}
                        currentStep={currentStep}
                        activeFader={activeFader}
                        recordedNotes={recordedNotes}
                        onStepPointerDown={onStepPointerDown}
                    />
                  );
                })}
            </div>

            {/* The same pattern, read as music. Under the grid because the
                grid is the instrument and this is what it says — a staff you
                could hand to a drummer without explaining the machine. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <SeqButton
                    label={'\u266b Notation'}
                    active={notation}
                    onClick={toggleNotation}
                    title={notation ? 'Hide the drum staff' : 'Show this pattern in drum notation'}
                />
                {/* WHERE THE TRANSPORT GOES WHEN THERE IS NO FOOTER TO GO IN.

                    On the Sampler's own page, Play / Rec / Tap / Save and the ⚙
                    are portalled into the footer, and this bar stays empty and
                    therefore invisible. A host that mounts <Sequencer> alone has
                    no footer — APK:OS's Midi window is one — and SeqControls
                    found nothing to portal into, so the ⚙ was drawn nowhere and
                    the drop-up it is the only opener for could not be opened:
                    no transport, no tempo, no pattern length, in a panel whose
                    grid was perfectly editable. It falls back to this id. */}
                <div id="seq-standalone-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}></div>
            </div>
            {notation && window.SeqNotation && (
                <window.SeqNotation
                    tracks={TRACKS}
                    pattern={pattern}
                    steps={steps}
                    mutes={mutes}
                    solos={solos}
                    isPlaying={isPlaying}
                    currentStep={currentStep}
                />
            )}

            {toneRoot !== null && (
                <window.SeqToneTrack
                    toneRoot={toneRoot}
                    steps={steps}
                    toneTrack={toneTrack}
                    toneTrackRef={toneTrackRef}
                    toneRootRef={toneRootRef}
                    isPlaying={isPlaying}
                    currentStep={currentStep}
                    recordedNotes={recordedNotes}
                    setSeqRef={setSeqRef}
                    patternRef={patternRef}
                    bpmRef={bpmRef}
                    stepsRef={stepsRef}
                    recordingRef={recordingRef}
                    setRecordedNotes={setRecordedNotes}
                    trackVolRef={trackVolRef}
                />
            )}
            </div>
            )}
            </div>

            <window.SeqFader activeFader={activeFader} />

            {trackMenu && (
                <TrackSampleMenu
                    trkIdx={trackMenu.trkIdx}
                    trackName={(TRACKS[trackMenu.trkIdx] && TRACKS[trackMenu.trkIdx].name) || ''}
                    anchor={{ x: trackMenu.x, y: trackMenu.y }}
                    version={trackVer}
                    onChange={() => setTrackVer((v) => v + 1)}
                    onBrowse={() => setBrowseTrack(trackMenu.trkIdx)}
                    onClose={() => setTrackMenu(null)}
                />
            )}
            {browseTrack != null && window.SoundBrowser && (
                <window.SoundBrowser
                    targetLabel={(TRACKS[browseTrack] && TRACKS[browseTrack].name) || ''}
                    onClose={() => setBrowseTrack(null)}
                    onChoose={(file, meta) => { loadTrackSample(browseTrack, file, meta); setBrowseTrack(null); }}
                />
            )}
        </div>
    );
};
window.Sequencer = Sequencer;
