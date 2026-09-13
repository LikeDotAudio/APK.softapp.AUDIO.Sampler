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

const MAX_FILES = 4000;
const NAME_MAX = 60000;

// TWO BROWSERS, ONE UI. `supportsFS` is the branch, and every consumer below
// depends on it: with the File System Access API (Chromium) this walks a real
// folder TREE from a directory handle; without it, showDirectoryPicker is
// absent and the whole thing degrades to a flat multi-file picker whose results
// are shown in the grid with no tree at all. Deep search and folder navigation
// only exist on the first path -- guard any new feature on `supportsFS` rather
// than assuming a handle. Harvested from the retired export's
// SamplerSoundBrowse.jsx, which stated the fallback and nothing here did
// (PLAN-126.01).

window.useSoundBrowseState = () => {
    const supportsFS = typeof window.showDirectoryPicker === 'function';
    const [rootHandle, setRootHandle] = React.useState(supportsFS ? (window.OA_SOUND_DIR || null) : null);
    const [selectedFolder, setSelectedFolder] = React.useState(null);
    const [selectedFolderPath, setSelectedFolderPath] = React.useState('');
    const [folderFiles, setFolderFiles] = React.useState([]);
    // WHAT THE BENCH HAS IS NOT WHAT THE SITE CARRIES, AND THIS LIST IS THE
    // WHOLE CONTENT OF THE BROWSER UNTIL A VISITOR PICKS A FOLDER OF THEIR OWN.
    //
    // `01 Track 01.wav` and `02 Track 02.wav` are 70 MB of SampleLibrary/'s
    // 79 MB, they are full-length demo songs rather than pad sounds, and
    // `APK:OS/system/published.set.json` drops both from the upload set
    // (PLAN-364.01). Nothing plays them: `Pads/useSamplerSets.js` names the
    // eight kits and neither track.
    //
    // The list named them FOUR times anyway, and twice under an `.m4a`
    // extension that no file in this tree — or any tree — has ever carried:
    // both `.m4a` rows pointed at the `.wav` beside them. So a visitor to
    // apk.audio got four of twelve rows that fetch a 404, and a bench got two
    // rows lying about their own format. `benchOnly` states the drop where the
    // row is written, and the filter below is what stops the site offering a
    // sound it does not have. PLAN-387.01.
    //
    // The other half of this is the `cost` field of the two matching
    // `drops` entries in published.set.json: it names, in prose, which rows
    // this costs. Add or lift a drop here and that field moves with it.
    //
    // A MISSING `oaIsLocalOrigin` FAILS TO HIDDEN. mqttBus.js is the second
    // entry in sources.json and this is the ninety-seventh, so in the shipped
    // bundle the helper is always there; if some future world loads this file
    // alone, listing nothing is the safe half of the guess, and the `res.ok`
    // branch in selectFileByIndex says so out loud either way.
    const localOrigin = typeof window.oaIsLocalOrigin === 'function' && window.oaIsLocalOrigin();
    const DEFAULT_SAMPLES = [
        { name: '01 Track 01.wav', url: './SampleLibrary/01 Track 01.wav', folder: 'Downloads', benchOnly: true },
        { name: '02 Track 02.wav', url: './SampleLibrary/02 Track 02.wav', folder: 'Downloads', benchOnly: true },
        { name: 'Bassdrum.wav', url: './SampleLibrary/APK 404/Bassdrum.wav', folder: 'SampleLibrary/APK 404' },
        { name: 'Snare (SD).wav', url: './SampleLibrary/APK 404/SD.wav', folder: 'SampleLibrary/APK 404' },
        { name: 'Clap.wav', url: './SampleLibrary/APK 404/Clap.wav', folder: 'SampleLibrary/APK 404' },
        { name: 'Closed Hat.wav', url: './SampleLibrary/APK 404/Closed Hat.wav', folder: 'SampleLibrary/APK 404' },
        { name: 'Open Hat.wav', url: './SampleLibrary/APK 404/Open Hat.wav', folder: 'SampleLibrary/APK 404' },
        { name: 'Tambourine.wav', url: './SampleLibrary/APK 404/Tambourin.wav', folder: 'SampleLibrary/APK 404' },
        { name: 'Tom High.wav', url: './SampleLibrary/APK 404/Tom H.wav', folder: 'SampleLibrary/APK 404' },
        { name: 'Tom Low.wav', url: './SampleLibrary/APK 404/Tom L.wav', folder: 'SampleLibrary/APK 404' }
    ].filter((s) => !s.benchOnly || localOrigin);

    const [flatEntries, setFlatEntries] = React.useState(DEFAULT_SAMPLES);
    const [selectedIndex, setSelectedIndex] = React.useState(-1);
    const [selected, setSelected] = React.useState(null);   // {name, file, folder}
    const [err, setErr] = React.useState('');
    const [chips, setChips] = React.useState([]);
    const [scanning, setScanning] = React.useState(false);
    const [deepResults, setDeepResults] = React.useState([]);
    const [deepSearching, setDeepSearching] = React.useState(false);

    // Favorites
    const loadFavs = () => { try { return JSON.parse(window.localStorage.getItem('oaSoundFavs')) || []; } catch (e) { return []; } };
    const [favState, setFavState] = window.useMqttState('APK.audio/Gui/SoundFavorites', { items: loadFavs() });
    const favorites = (favState && favState.items) || [];
    React.useEffect(() => { try { localStorage.setItem('oaSoundFavs', JSON.stringify(favorites)); } catch (e) {} }, [favState]);
    
    const [view, setView] = React.useState('files');
    const [favEntries, setFavEntries] = React.useState([]);
    const [cloudData, setCloudData] = React.useState(null);
    const [cloudErr, setCloudErr] = React.useState('');
    const [recEntries, setRecEntries] = React.useState([]);

    const isFav = (s) => !!s && favorites.some((f) => f.name === s.name && f.folder === (s.folder || ''));
    const toggleFav = () => {
        if (!selected) return;
        const entry = { name: selected.name, folder: selected.folder || '' };
        const exists = favorites.some((f) => f.name === entry.name && f.folder === entry.folder);
        setFavState({ items: exists ? favorites.filter((f) => !(f.name === entry.name && f.folder === entry.folder)) : [...favorites, entry] });
    };

    // Recordings are read out of IndexedDB as Files, which is the same shape the
    // grid, the thumbnails and Load-to-pad already take from a picked folder —
    // so a take behaves like any other sample from the moment it is saved.
    const reloadRecs = React.useCallback(async () => {
        if (!window.oaRecList) return;
        const recs = await window.oaRecList();
        setRecEntries(recs.map((r) => ({
            name: r.name,
            folder: window.OA_REC_FOLDER,
            file: new File([r.blob], r.name, { type: r.blob.type || 'audio/wav', lastModified: r.at || 0 }),
            rec: r,
        })));
    }, []);

    const showFiles = () => { setView('files'); setSelectedIndex(-1); };
    const showRecorder = () => { setView('recorder'); setSelectedIndex(-1); reloadRecs(); };

    // Deleting the selected take: the grid index it was sitting at now points at
    // a different sound, so the selection is dropped rather than silently moved.
    const deleteRecording = async (entry) => {
        if (!entry || !window.oaRecDelete) return;
        await window.oaRecDelete(entry.name);
        setSelected(null); setSelectedIndex(-1);
        await reloadRecs();
    };
    const showFavorites = async () => { setView('favorites'); setSelectedIndex(-1); if (window.oaEnsureRootPermission) await window.oaEnsureRootPermission(); };
    const showCloud = async () => { 
        setView('cloud'); setSelectedIndex(-1); setCloudErr('');
        if (!supportsFS || !rootHandle) {
            setCloudErr('Please choose a folder first to view the sample cloud.');
            return;
        }
        try {
            const fh = await rootHandle.getFileHandle('sample_cloud_data.PEAK');
            const file = await fh.getFile();
            const text = await file.text();
            setCloudData(JSON.parse(text));
        } catch (e) {
            setCloudErr('No sample_cloud_data.PEAK found. Run the analyzer on this folder: cargo run --manifest-path "APK:Softapps/SCAN/sample_analyzer_rs/Cargo.toml"');
            setCloudData(null);
        }
    };

    React.useEffect(() => {
        if (view !== 'favorites') return;
        let cancelled = false;
        (async () => {
            const es = await Promise.all(favorites.map(async (f) => {
                const file = window.oaResolveFile ? await window.oaResolveFile(f.folder, f.name) : null;
                return { name: f.name, folder: f.folder, file: file || undefined };
            }));
            if (!cancelled) setFavEntries(es);
        })();
        return () => { cancelled = true; };
    }, [view, favState]);

    const [filter, setFilter] = React.useState('');
    const files = (supportsFS && folderFiles.length > 0) ? folderFiles : flatEntries;
    const baseList = view === 'favorites' ? favEntries : (view === 'recorder' ? recEntries : files);
    
    const shown = filter.trim()
        ? ((view === 'files' && supportsFS) ? deepResults : baseList.filter((f) => f.name.toLowerCase().includes(filter.trim().toLowerCase())))
        : baseList;

    React.useEffect(() => {
        const term = filter.trim().toLowerCase();
        if (!term || !supportsFS || !selectedFolder) { setDeepResults([]); setDeepSearching(false); return; }
        let cancelled = false;
        setDeepSearching(true);
        const timer = setTimeout(async () => {
            const out = [];
            try { await window.gatherMatching(selectedFolder, '', out, term, 0); } catch (e) {}
            if (!cancelled) {
                out.sort((a, b) => (a.sub === b.sub ? a.name.localeCompare(b.name) : (a.sub || '').localeCompare(b.sub || '')));
                setDeepResults(out); setDeepSearching(false);
            }
        }, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [filter, selectedFolder]);

    const pickFolder = async () => {
        try {
            const h = await window.showDirectoryPicker();
            window.OA_SOUND_DIR = h; setRootHandle(h);
            if (window.oaIdbSet) window.oaIdbSet('oaRootDir', h).catch(() => {});
            selectFolder(h, h.name || 'root');
        } catch (e) { /* cancelled */ }
    };

    const selectFolder = async (handle, path) => {
        setFolderFiles([]); setDeepResults([]);
        setSelectedFolder(handle); setSelectedFolderPath(path || ''); setSelectedIndex(-1); setErr(''); setFilter(''); setScanning(true); setChips([]);
        const items = [], names = [], builder = window.makeChipBuilder();
        const onEmit = () => setChips(builder.top());
        try { await window.gatherAll(handle, '', items, names, builder, onEmit, 0); }
        catch (e) { setErr('Could not read folder.'); }
        items.sort((a, b) => (a.sub === b.sub ? a.name.localeCompare(b.name) : (a.sub || '').localeCompare(b.sub || '')));
        setFolderFiles(items);
        setChips(builder.top());
        setScanning(false);
        if (names.length > MAX_FILES) setErr(`Showing ${MAX_FILES} of ${names.length}${names.length >= NAME_MAX ? '+' : ''} files — filter to find the rest.`);
    };

    const onPlainFiles = (fileList) => {
        setFlatEntries(Array.from(fileList || []).filter((f) => window.oaIsFindableAudio(f.name)).map((f) => ({ name: f.name, file: f })));
        setSelectedIndex(-1);
    };

    const selectFileByIndex = async (idx, setBuffer, setPos) => {
        if (idx < 0 || idx >= shown.length) return;
        setSelectedIndex(idx);
        // A new click is a new attempt, so the previous complaint goes. Only
        // `selectFolder` used to clear this, which was harmless while nothing
        // reported a failed fetch and is not once something does: the ⚠️ line
        // would sit over the next sound that loaded perfectly well.
        setErr('');
        const entry = shown[idx];
        try {
            let file = entry.file || (entry.handle && await entry.handle.getFile());
            if (!file && entry.url) {
                const res = await fetch(entry.url);
                // A 404 HAS A BODY, AND `res.blob()` HANDS IT OVER WITHOUT
                // COMPLAINT. Nothing here read `res.ok`, so the host's error
                // page became a File, `setSelected` succeeded, decoding failed
                // into the empty catch below, and `err` stayed ''. The row drew
                // as selected with a blank waveform and the browser said
                // nothing at all about why — which is a worse failure than the
                // 404, because there is nothing on screen to act on.
                //
                // The shell's mount-web-app.js settled the wording for this:
                // non-publication is INFERRED, a status code is PROVEN, so the
                // status goes in the sentence and the drop only explains it.
                // PLAN-387.01.
                if (!res.ok) {
                    setErr(entry.benchOnly
                        ? `${entry.name} is in the repository and is not published to this site — the host answered ${res.status}.`
                        : `${entry.name} could not be fetched — the host answered ${res.status}.`);
                    return;
                }
                const blob = await res.blob();
                file = new File([blob], entry.name, { type: 'audio/wav' });
            }
            if (!file) { setErr('File unavailable — grant folder access or re-pick the folder.'); return; }
            const folder = entry.folder != null ? entry.folder : (supportsFS ? (selectedFolderPath + (entry.sub ? '/' + entry.sub : '')) : '');
            setSelected({ name: entry.name, file, folder });
            setPos(0);
            try { setBuffer(await window.oaDecodeAudio(window.oaAudioCtx(), await file.arrayBuffer())); } catch (e) { setBuffer(null); }
        } catch (e) { setErr('Could not open file.'); }
    };

    return {
        supportsFS, rootHandle, selectedFolder, selectedFolderPath, selectedIndex, setSelectedIndex,
        selected, setSelected, err, chips, scanning, deepSearching, filter, setFilter,
        view, cloudData, cloudErr, favorites, isFav, toggleFav, showFiles, showFavorites, showCloud,
        showRecorder, recEntries, reloadRecs, deleteRecording,
        shown, pickFolder, selectFolder, onPlainFiles, selectFileByIndex, files
    };
};
