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

// Extracted from index.html: the root component and its mount.
        function App() {
            const [activeTabs, setActiveTabs] = React.useState(['PADS']); // default
            const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 800);
            const [deferredPrompt, setDeferredPrompt] = React.useState(null);
            const [isDragging, setIsDragging] = React.useState(false);
            const dragCounterRef = React.useRef(0);
            
            React.useEffect(() => {
                const handleResize = () => setIsMobile(window.innerWidth <= 800);
                window.addEventListener('resize', handleResize);
                
                const handleBeforeInstall = (e) => {
                    e.preventDefault();
                    setDeferredPrompt(e);
                };
                window.addEventListener('beforeinstallprompt', handleBeforeInstall);

                const handleDragEnter = (e) => {
                    e.preventDefault();
                    dragCounterRef.current++;
                    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
                        setIsDragging(true);
                    }
                };

                const handleDragOver = (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                };

                const handleDragLeave = (e) => {
                    e.preventDefault();
                    dragCounterRef.current--;
                    if (dragCounterRef.current <= 0) {
                        dragCounterRef.current = 0;
                        setIsDragging(false);
                    }
                };

                const handleGlobalDrop = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragCounterRef.current = 0;
                    setIsDragging(false);

                    const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
                    const peakFiles = files.filter(f => /\.(peak|json)$/i.test(f.name));
                    const audioFiles = files.filter(f => window.oaIsDroppableAudio(f));

                    let peakData = null;
                    if (peakFiles.length > 0) {
                        try {
                            const text = await peakFiles[0].text();
                            peakData = JSON.parse(text);
                            console.log(`[+] Loaded .PEAK sidecar metadata: ${peakFiles[0].name}`, peakData);
                        } catch (err) {
                            console.error("Could not parse .PEAK sidecar:", err);
                        }
                    }

                    if (audioFiles.length > 0) {
                        const file = audioFiles[0];
                        console.log(`[+] Global drop received audio file: ${file.name}`);
                        
                        try {
                            const ctx = window.oaAudioCtx();
                            const arrayBuffer = await file.arrayBuffer();
                            const buffer = await (window.oaDecodeAudio ? window.oaDecodeAudio(ctx, arrayBuffer) : ctx.decodeAudioData(arrayBuffer));
                            
                            // 1. If no sidecar was dropped, automatically scanalyze the media file!
                            if (!peakData && window.oaDeepScanAudio) {
                                console.log(`[+] Auto-scanalyzing dropped media: ${file.name}`);
                                // NO PROGRESS CALLBACK HERE, and that is a
                                // decision rather than an omission. The scan
                                // takes an optional one (PLAN-801.03) and this
                                // handler has nowhere to draw it: a global drop
                                // owns no element, and logging forty-five times
                                // a scan would fill the one surface an operator
                                // debugs with. The panels that DO have a line —
                                // LensesView and MusicChartOverlay — are what
                                // the visitor is looking at while this runs.
                                peakData = await window.oaDeepScanAudio(buffer);
                            }

                            // 2. Slice across pads as sample bank
                            if (window.oaChopSongToPads) {
                                window.oaChopSongToPads(buffer, file.name, peakData);
                            }
                            
                            // 3. Load into Pad 0 for primary editor inspection
                            if (window.oaLoadSampleToPad) {
                                await window.oaLoadSampleToPad(0, file);
                                // `peakData` here is EITHER a dropped sidecar or the
                                // scan run above, and those spell their measurements
                                // differently — the normaliser owns the difference and
                                // its header names all three formats.
                                if (peakData && window.oaApplyPeakToPad) window.oaApplyPeakToPad(0, peakData);
                                window.dispatchEvent(new CustomEvent('oa-sample-changed', { detail: { idx: 0 } }));
                            }

                            // 3. Promote PADS & MIXER tabs to view pads and sampler editor
                            setActiveTabs(['PADS', 'MIXER']);
                        } catch (err) {
                            console.error("Global drop audio decode error:", err);
                        }
                    } else if (peakData && window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[0]) {
                        // Sidecar dropped alone: attach to active pad 0
                        if (window.oaApplyPeakToPad) window.oaApplyPeakToPad(0, peakData);
                        window.dispatchEvent(new CustomEvent('oa-sample-changed', { detail: { idx: 0 } }));
                        setActiveTabs(['PADS', 'MIXER']);
                    }
                };

                window.addEventListener('dragenter', handleDragEnter);
                window.addEventListener('dragover', handleDragOver);
                window.addEventListener('dragleave', handleDragLeave);
                window.addEventListener('drop', handleGlobalDrop);

                return () => {
                    window.removeEventListener('resize', handleResize);
                    window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
                    window.removeEventListener('dragenter', handleDragEnter);
                    window.removeEventListener('dragover', handleDragOver);
                    window.removeEventListener('dragleave', handleDragLeave);
                    window.removeEventListener('drop', handleGlobalDrop);
                };
            }, []);

            const installApp = () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then((choiceResult) => {
                        if (choiceResult.outcome === 'accepted') {
                            setDeferredPrompt(null);
                        }
                    });
                }
            };

            // activeTabs is ordered most-recently-pressed FIRST, and at most two
            // panels are open at once — pressing a third drops the older one.
            const MAX_TABS = 2;
            const toggleTab = (tab) => {
                setActiveTabs(prev => {
                    // Pressing an open tab promotes it to the top rather than closing it —
                    // a panel only ever leaves by being pushed out by a third tab.
                    if (prev[0] === tab) return prev;
                    return [tab, ...prev.filter(t => t !== tab)].slice(0, MAX_TABS);
                });
            };

            // Panels can request focus (e.g. loading a pattern opens the grid to edit it).
            React.useEffect(() => {
                const open = (e) => { const t = e.detail && e.detail.tab; if (t) toggleTab(t); };
                window.addEventListener('oa-open-tab', open);
                return () => window.removeEventListener('oa-open-tab', open);
            }, []);

            // Explicit dismissal (e.g. the Editor's ✕) — the tab bar itself never closes.
            const closeTab = (tab) => setActiveTabs(prev => prev.length > 1 ? prev.filter(t => t !== tab) : prev);

            // Panels stay mounted (audio + browser state survives a tab switch) and
            // are re-ordered with flex `order`; the newest one sticks under the header.
            const panelStyle = (...tabs) => {
                const idxs = tabs.map(t => activeTabs.indexOf(t)).filter(i => i >= 0);
                if (!idxs.length) return { display: 'none' };
                const order = Math.min(...idxs);
                return {
                    order,
                    flex: '0 0 auto',
                    width: '100%',
                    ...(order === 0 && activeTabs.length > 1 ? {
                        position: 'sticky',
                        top: 0,
                        zIndex: 5,
                        background: 'var(--bg)',
                        borderBottom: '1px solid #333',
                        paddingBottom: '10px'
                    } : {})
                };
            };

            return (
                <div id="app-container">
                    {window.Header ? <window.Header activeTabs={activeTabs} toggleTab={toggleTab} deferredPrompt={deferredPrompt} installApp={installApp} /> : <header>Loading HEADER...</header>}
                    
                    <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '10px 0' : '10px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ ...panelStyle('PADS'), display: activeTabs.includes('PADS') ? 'flex' : 'none', justifyContent: 'center' }}>
                            {window.Pads ? <window.Pads showSets={activeTabs.includes('PADS')} /> : <div>Loading PADS...</div>}
                        </div>

                        <div style={panelStyle('SEQ', 'SONG')}>
                            {window.Sequencer ? <window.Sequencer activeTabs={activeTabs} /> : <div>Loading SEQ/SONG...</div>}
                        </div>

                        <div style={{ ...panelStyle('EDITOR'), display: activeTabs.includes('EDITOR') ? 'flex' : 'none', justifyContent: 'center', alignItems: 'center' }}>
                            {window.SoundBrowser ? (
                                <window.SoundBrowser
                                    inline={true}
                                    onClose={() => closeTab('EDITOR')}
                                    /* The editor is not opened from a pad, so there is no pad to load
                                       into — Load handed the sound to nobody. Instead it arms the same
                                       "click a pad to assign" flow the browser already uses when you
                                       send a sound to a second pad, and brings the pads up to click. */
                                    onChoose={(file, meta) => {
                                        window.dispatchEvent(new CustomEvent('oa-assign-sample', { detail: { file, meta } }));
                                        toggleTab('PADS');
                                    }}
                                />
                            ) : <div>Loading EDITOR...</div>}
                        </div>

                        <div style={panelStyle('MIXER')}>
                            {window.Mixer ? <window.Mixer /> : <div>Loading MIXER...</div>}
                        </div>

                        <div style={{ ...panelStyle('LENSES', 'SCANALYZER'), display: (activeTabs.includes('LENSES') || activeTabs.includes('SCANALYZER')) ? 'flex' : 'none', justifyContent: 'center' }}>
                            {window.LensesView ? (
                                <div style={{ width: '100%', maxWidth: '1100px' }}>
                                    <window.LensesView padIdx={0} />
                                </div>
                            ) : <div>Loading LENSES...</div>}
                        </div>
                    </main>

                    {window.Footer ? <window.Footer /> : null}

                    {/* Global Drag & Drop Visual Dropzone Overlay */}
                    {isDragging && (
                        <div style={{
                            position: 'fixed', inset: 0, zIndex: 9999,
                            background: 'rgba(0, 0, 0, 0.88)', border: '4px dashed var(--accent)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--accent)', pointerEvents: 'none', backdropFilter: 'blur(4px)'
                        }}>
                            <span style={{ fontSize: '64px', marginBottom: '16px', filter: 'drop-shadow(0 0 12px var(--accent))' }}>📥</span>
                            <span style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                                Drop Audio File Anywhere to Load, Scan & Slice
                            </span>
                            <span style={{ fontSize: '14px', color: '#ccc', marginTop: '10px' }}>
                                Supports .wav, .mp3, .m4a, .flac, .aiff, .ogg — auto-chops to 16 pads!
                            </span>
                        </div>
                    )}

                    {/* One for the whole desk: whichever control is being dragged
                        puts its value up here, large enough to read past a hand. */}
                    {window.OaReadout ? <window.OaReadout /> : null}
                </div>
            );
        }

        // Everything above is already in this bundle, in order — nothing to wait
        // for. (This used to sleep 500ms for Babel to compile the .jsx files.)
        //
        // ONLY WHERE THERE IS A PAGE TO BE. This bundle has a second host:
        // APK:OS loads it into a Midi window and mounts the components it wants
        // itself — the Pads, the Sequencer — into a stage of its own. That
        // window has no #root, so `createRoot(null)` THREW on every open, and
        // because this is the last file in the bundle everything below the
        // throw was skipped with it: the bus below never connected there, and
        // the only sign was a minified React 299 in the console.
        const root = document.getElementById('root');
        if (root) ReactDOM.createRoot(root).render(<App />);

        // AFTER the first render, never before it. The bus is a second writer
        // into a store the widgets are already reading — it does not decide
        // what the app shows on load, and blocking the paint on a socket that
        // may not answer would make a bench-only feature everybody's problem.
        // On a non-local origin `oaConnectBus` returns without fetching a byte.
        if (window.oaConnectBus) window.oaConnectBus();

        // The worker is this page's own — it precaches `./sw.js`, `./index.html`
        // and the bundle, which are paths on the Sampler's origin. A host that
        // borrowed the components has its own shell to cache and must not have
        // this one registered underneath it.
        if (root && 'serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js').then(reg => {
                    console.log('ServiceWorker registration successful');
                }).catch(err => {
                    console.error('ServiceWorker registration failed: ', err);
                });
            });
        }
