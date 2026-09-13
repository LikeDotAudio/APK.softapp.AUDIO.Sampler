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

/**
 * SoundBrowser.jsx — custom "Sound Browse" window.
 * Two panes: a folder TREE on the left, and a grid of RENDERED WAVEFORM
 * thumbnails for the selected folder on the right. Click (or arrow-key) a
 * waveform to select + auto-play it; scrub / rewind / loop below; Load to pad.
 *
 * Playback is Web Audio (BufferSource) off the decoded buffer, so every format
 * we can decode — including AIFF via oaDecodeAudio — previews correctly.
 * Folder tree uses the File System Access API (Chromium); elsewhere it falls
 * back to a flat multi-file picker shown in the grid.
 */
const COLS = 4;   // grid columns (drives arrow up/down)

const WaveThumb = window.WaveThumb;
const SoundCloudView = window.SoundCloudView;
const gatherAll = window.gatherAll;
const gatherMatching = window.gatherMatching;
const makeChipBuilder = window.makeChipBuilder;
const SoundFolderNode = window.SoundFolderNode;

const MAX_FILES = 4000;    // cap on rendered thumbnails
const NAME_MAX = 60000;    // cap on the name-only scan
const DEEP_MAX = 20000;

window.SoundBrowser = ({ onClose, onChoose, onChooseOther, targetLabel, inline }) => {
    const [buffer, setBuffer] = React.useState(null);
    const [autoPreview, setAutoPreview] = React.useState(true);
    const gridScrollRef = React.useRef(null);
    const selectedThumbRef = React.useRef(null);
    
    const { 
        supportsFS, rootHandle, selectedFolder, selectedFolderPath, selectedIndex, setSelectedIndex,
        selected, setSelected, err, chips, scanning, deepSearching, filter, setFilter,
        view, cloudData, cloudErr, favorites, isFav, toggleFav, showFiles, showFavorites, showCloud,
        showRecorder, recEntries, reloadRecs, deleteRecording,
        shown, pickFolder, selectFolder, onPlainFiles, selectFileByIndex, files
    } = window.useSoundBrowseState();

    const {
        playing, loop, setLoop, pos, setPos, duration, togglePlay, rewind, scrub,
        trim, trimmed, setTrimPoint, resetTrim,
    } = window.useSoundBrowseAudio(buffer, autoPreview);

    // Read the takes once on open, so the RECORDER tab carries its count before
    // anyone clicks it — otherwise a device full of recordings looks empty.
    React.useEffect(() => { reloadRecs(); }, [reloadRecs]);

    // The chop rides along with the sound: whatever was set on the waveform is
    // what the pad gets, so a take is trimmed once, here, and not again.
    const chopMeta = () => ({
        name: selected.name,
        folder: selected.folder || '',
        offset: trim.in,
        end: trim.out,
        fadeIn: trim.fadeIn,
        fadeOut: trim.fadeOut,
    });
    const chooseIt = () => { if (selected && onChoose) onChoose(selected.file, chopMeta()); };
    const chooseOther = () => { if (selected && onChooseOther) onChooseOther(selected.file, chopMeta()); };

    window.useSoundBrowseKeys(
        shown, selectedIndex, (idx) => selectFileByIndex(idx, setBuffer, setPos), chooseIt, onClose,
        gridScrollRef, selectedThumbRef,
        { setTrimPoint, resetTrim, at: pos * duration, duration },
    );

    const tbtn = (extra) => ({ background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '3px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', ...extra });

    return (
        <div onClick={inline ? undefined : onClose} style={inline ? { display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', width: '100%', height: '100%' } : { position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', padding: '2vw', boxSizing: 'border-box' }}>
            <style>{`
                /* On a phone the folder tree would eat most of the dialog, so it
                   becomes a short scrollable strip above the waveforms. */
                @media (max-width: 800px) {
                    .oa-browse-body { flex-direction: column !important; }
                    .oa-browse-tree {
                        width: 100% !important;
                        max-height: 28% !important;
                        border-right: none !important;
                        border-bottom: 1px solid #333;
                    }
                    .oa-browse-bar { flex-wrap: wrap !important; row-gap: 6px; }
                }
            `}</style>
            {/* minWidth must yield to the viewport — a hard 760px pushed the
                whole dialog off the side of a phone. */}
            <div className="oa-browse" onClick={(e) => inline ? undefined : e.stopPropagation()} style={{ width: inline ? '100%' : 'min(66vw, 95vw)', minWidth: 'min(760px, 96vw)', maxWidth: '96vw', height: inline ? '100%' : 'min(80vh, 92dvh)', display: 'flex', flexDirection: 'column', background: '#1c1c1c', border: '1px solid var(--accent)', borderRadius: '6px', color: '#eee', boxShadow: inline ? 'none' : '0 10px 40px rgba(0,0,0,0.6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #333' }}>
                    <h3 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '15px' }}>
                        Sound Browse{targetLabel ? ` → ${targetLabel}` : ''}
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>×</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderBottom: '1px solid #2a2a2a', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', border: '1px solid #444', borderRadius: '4px', overflow: 'hidden' }}>
                        <button onClick={showFiles} style={{ background: view === 'files' ? 'var(--accent)' : '#222', color: view === 'files' ? '#111' : '#ccc', border: 'none', padding: '5px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>FILES</button>
                        <button onClick={showFavorites} style={{ background: view === 'favorites' ? 'var(--accent)' : '#222', color: view === 'favorites' ? '#111' : '#ccc', border: 'none', padding: '5px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>★ Favorites{favorites.length ? ` (${favorites.length})` : ''}</button>
                        <button onClick={showCloud} style={{ background: view === 'cloud' ? 'var(--accent)' : '#222', color: view === 'cloud' ? '#111' : '#ccc', border: 'none', padding: '5px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>☁ THE CLOUD</button>
                        <button onClick={showRecorder} title="Record a new sample from this device's input"
                            style={{ background: view === 'recorder' ? 'var(--accent)' : '#222', color: view === 'recorder' ? '#111' : '#ccc', border: 'none', padding: '5px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>● RECORDER{recEntries.length ? ` (${recEntries.length})` : ''}</button>
                    </div>
                    {supportsFS ? (
                        <button onClick={pickFolder} style={tbtn({ background: 'var(--accent)', color: '#111', border: 'none', fontWeight: 'bold' })}>📁 Choose folder…</button>
                    ) : (
                        <label style={tbtn({ background: 'var(--accent)', color: '#111', border: 'none', fontWeight: 'bold' })}>
                            📁 Choose files…
                            <input type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={(e) => onPlainFiles(e.target.files)} />
                        </label>
                    )}
                    <label style={{ fontSize: '12px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input type="checkbox" checked={autoPreview} onChange={(e) => setAutoPreview(e.target.checked)} /> Auto-preview 5s
                    </label>
                    <input type="text" value={filter} onChange={(e) => { setFilter(e.target.value); setSelectedIndex(-1); }} placeholder="Filter (e.g. HH)"
                        style={{ background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '3px', padding: '4px 8px', fontSize: '12px', width: '130px' }} />
                    {filter.trim() && <span style={{ fontSize: '11px', color: 'var(--accent-t15)' }}>{deepSearching ? 'searching…' : `${shown.length} match${shown.length === 1 ? '' : 'es'}`}</span>}
                    <span style={{ fontSize: '11px', color: '#666' }}>↑ ↓ ← → browse · Enter load · I / O chop (⇧ for fades)</span>
                </div>

                {err && <div style={{ padding: '6px 16px', color: '#f88', fontSize: '12px' }}>⚠️ {err}</div>}

                <div className="oa-browse-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                    <div className="oa-browse-tree" style={{ width: '210px', flexShrink: 0, borderRight: '1px solid #333', overflowY: 'auto', padding: '6px 4px' }}>
                        {rootHandle ? (
                            <SoundFolderNode name={rootHandle.name || 'root'} handle={rootHandle} depth={0} defaultOpen onSelectFolder={selectFolder} selectedFolder={selectedFolder} pathPrefix={rootHandle.name || 'root'} />
                        ) : (
                            <div style={{ color: '#666', fontSize: '11px', padding: '12px' }}>
                                {supportsFS ? 'Choose a folder to see its tree.' : 'Choose files to browse.'}
                            </div>
                        )}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        {view === 'recorder' && window.SoundRecorder && (
                            <window.SoundRecorder onSaved={() => reloadRecs()} />
                        )}
                        {view === 'files' && (chips.length > 0 || scanning) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '6px 10px', borderBottom: '1px solid #2a2a2a', alignItems: 'center' }}>
                                {scanning && <span style={{ fontSize: '11px', color: '#888' }}>scanning…</span>}
                                {chips.map((c, i) => {
                                    const active = filter.toLowerCase() === c.display.toLowerCase();
                                    return (
                                        <button key={i} onClick={() => { setFilter(active ? '' : c.display); setSelectedIndex(-1); }}
                                            title={`${c.count} files · ${c.folders.size} folders`}
                                            style={{ background: active ? 'var(--accent)' : '#2a2a2a', color: active ? '#111' : '#cde', border: '1px solid #444', borderRadius: '12px', padding: '2px 9px', fontSize: '11px', cursor: 'pointer' }}>
                                            {c.display}
                                        </button>
                                    );
                                })}
                                {filter && <button onClick={() => setFilter('')} style={{ background: 'none', border: 'none', color: '#888', fontSize: '11px', cursor: 'pointer' }}>clear</button>}
                            </div>
                        )}
                        <div ref={gridScrollRef}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = 'copy';
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
                                if (files.length > 0 && onPlainFiles) {
                                    onPlainFiles(files);
                                }
                            }}
                            style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                            {shown.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: '8px' }}>
                                    {shown.map((entry, i) => (
                                        <div key={i} ref={i === selectedIndex ? selectedThumbRef : undefined} style={{ minWidth: 0 }}>
                                            {/* setBuffer/setPos have to come along: without them the
                                                click selects the file, throws on the missing setter and
                                                lands on "Could not open file" — so the big waveform, the
                                                transport and the auto-preview all stayed dead unless you
                                                had arrived by arrow key. */}
                                            <WaveThumb entry={entry} selected={i === selectedIndex} onSelect={() => selectFileByIndex(i, setBuffer, setPos)} scrollRootRef={gridScrollRef} />
                                        </div>
                                    ))}
                                </div>
                            ) : view === 'cloud' ? (
                                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                    {cloudErr ? (
                                        <div style={{ color: '#ccc', fontSize: '13px', padding: '30px', textAlign: 'center', lineHeight: '1.6' }}>
                                            <div style={{ fontSize: '24px', marginBottom: '10px' }}>☁️</div>
                                            {cloudErr}
                                        </div>
                                    ) : cloudData ? (
                                        <SoundCloudView data={cloudData} rootHandle={rootHandle} onSelectFile={(entry) => {
                                            setSelected(entry);
                                            // Auto-play when selected in cloud
                                            const playIt = async () => {
                                                setPos(0);
                                                try {
                                                    const buf = await window.oaDecodeAudio(window.oaAudioCtx(), await entry.file.arrayBuffer());
                                                    setBuffer(buf);
                                                } catch(e) {}
                                            };
                                            playIt();
                                        }} />
                                    ) : (
                                        <div style={{ color: '#888', fontSize: '12px', padding: '30px', textAlign: 'center' }}>Loading cloud...</div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ color: '#666', fontSize: '12px', padding: '30px', textAlign: 'center' }}>
                                    {view === 'favorites'
                                        ? (favorites.length ? 'No matching favorites.' : 'No favorites yet — open Files, pick a sound, and ☆ Favorite it.')
                                        : view === 'recorder'
                                        ? (recEntries.length ? 'No takes match that filter.' : 'No recordings yet — open the input above and hit Record.')
                                        : (deepSearching ? 'Searching all folders…' : (scanning ? 'Scanning folders…' : (files.length ? 'No matches.' : (supportsFS ? 'Select a folder on the left to see its waveforms.' : 'No files chosen yet.'))))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #333', padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selected ? selected.name : 'No file selected'}
                        </span>
                        <div style={{ flexGrow: 1 }} />
                        {selected && duration > 0 && (
                            <span style={{ fontSize: '11px', color: trimmed ? 'var(--accent)' : '#666', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                                title="IN → OUT, and the fade at each end. Drag the handles, or press I / O (⇧I / ⇧O for the fades) at the playhead.">
                                ✂ {trim.in.toFixed(3)} → {trim.out.toFixed(3)}s ({(trim.out - trim.in).toFixed(3)}s)
                                {(trim.fadeIn > 0 || trim.fadeOut > 0) ? ` · fade ${trim.fadeIn.toFixed(2)}/${trim.fadeOut.toFixed(2)}` : ''}
                            </span>
                        )}
                        {selected && trimmed && (
                            <button onClick={resetTrim} title="Drop the chop — back to the whole file"
                                style={{ background: '#333', color: '#ccc', border: '1px solid #444', borderRadius: '3px', padding: '2px 7px', fontSize: '11px', cursor: 'pointer' }}>⟲ whole</button>
                        )}
                    </div>
                    {/* The chop lives on the waveform: IN, OUT and a fade at
                        each end, dragged or set with I / O at the playhead. It
                        applies to whatever is selected — a file from a folder,
                        a favourite, or a take off the recorder — and travels to
                        the pad with the sound. */}
                    <window.WaveTrim buffer={buffer} trim={trim} setTrimPoint={setTrimPoint} pos={pos} onScrub={scrub} active={!!selected} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                        <button onClick={rewind} disabled={!selected} style={tbtn()}>⏮ Rewind</button>
                        <button onClick={togglePlay} disabled={!selected} style={tbtn({ background: playing ? '#c00' : '#388e3c', border: 'none', fontWeight: 'bold' })}>{playing ? '⏸ Pause' : '► Play'}</button>
                        <label style={{ fontSize: '12px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop
                        </label>
                        {/* Housekeeping for takes. Only in the recorder view —
                            these two are the only sounds in the app the browser
                            owns outright and can therefore destroy or hand back. */}
                        {view === 'recorder' && (
                            <>
                                <button onClick={() => { if (selected) window.oaDownloadRecording(selected); }} disabled={!selected}
                                    title="Save this take out as a .wav file"
                                    style={tbtn({ padding: '6px 10px' })}>⭳ .wav</button>
                                <button
                                    onClick={() => {
                                        const entry = shown[selectedIndex];
                                        if (entry && window.confirm(`Delete "${entry.name}"? Pads using it will lose their sound.`)) deleteRecording(entry);
                                    }}
                                    disabled={selectedIndex < 0}
                                    title="Delete this recording from this device"
                                    style={tbtn({ padding: '6px 10px', color: '#f88' })}>🗑</button>
                            </>
                        )}
                        <button onClick={toggleFav} disabled={!selected} title="Add/remove this file from favorites"
                            style={tbtn({ background: isFav(selected) ? 'var(--accent)' : '#333', color: isFav(selected) ? '#111' : '#fff', border: 'none', fontWeight: 'bold' })}>
                            {isFav(selected) ? '★ Favorited' : '☆ Favorite'}
                        </button>
                        <div style={{ flexGrow: 1 }} />
                        <button onClick={chooseIt} disabled={!selected} style={tbtn({ background: selected ? 'var(--accent)' : '#553', color: '#111', border: 'none', fontWeight: 'bold', padding: '8px 14px', cursor: selected ? 'pointer' : 'not-allowed' })}>
                            ⭳ Load to {targetLabel || 'pad'}
                        </button>
                        {onChooseOther && (
                            <button onClick={chooseOther} disabled={!selected} style={tbtn({ background: selected ? 'var(--accent-t15)' : '#345', color: '#111', border: 'none', fontWeight: 'bold', padding: '8px 14px', cursor: selected ? 'pointer' : 'not-allowed' })}>
                                ⭳ Load to other pad
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
