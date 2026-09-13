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

// ---- Sample persistence (revert samples on reload) --------------------------
// A tiny IndexedDB kv-store to keep the last-picked directory handle (File
// System Access handles are structured-cloneable), so samples can be re-loaded
// next session from their MQTT-stored {name, folder}.
window.oaIdbSet = function (key, val) {
    return new Promise((resolve, reject) => {
        const r = indexedDB.open('oaSound', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
        r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); };
        r.onerror = () => reject(r.error);
    });
};
window.oaIdbGet = function (key) {
    return new Promise((resolve) => {
        const r = indexedDB.open('oaSound', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
        r.onsuccess = () => { const tx = r.result.transaction('kv', 'readonly'); const g = tx.objectStore('kv').get(key); g.onsuccess = () => resolve(g.result); g.onerror = () => resolve(null); };
        r.onerror = () => resolve(null);
    });
};

// ---------------------------------------------------------------------------
// THE KIT'S AUDIO, KEPT.
//
// Everything above this block restores a kit by going back to where the sounds
// CAME from: a directory handle, a permission prompt, a walk down a folder
// path, a decode per pad. That is the right answer when the files have moved
// or changed, and the wrong one for the ordinary case — the same machine, the
// same kit, ten seconds later — where it is a permission dialog and a second
// of decoding to arrive back at bytes the browser already had.
//
// So the decoded audio itself is kept, per pad, in IndexedDB. On the way back
// in there is no folder, no prompt, no decode and no network: the samples are
// channel data, and putting them back is a memcpy into an AudioBuffer.
//
// PCM rather than the original file bytes, deliberately. A .wav re-decode is
// fast but not free, and the point of this store is that the kit is resident
// before anything is played, not shortly after. It costs four bytes a sample —
// a two-second stereo 48k pad is 768KB — which is why there is a budget.
// ---------------------------------------------------------------------------
const OA_KIT_DB = 'oaKitAudio';
const OA_KIT_STORE = 'pads';

// Off by nothing: this is the whole point. Set false before load to opt out.
window.OA_KIT_KEEP = (window.OA_KIT_KEEP !== false);
// A whole 5 × 5 grid of two-second stereo pads is about 20MB; the ceiling is
// generous enough for long one-shots and low enough that a stray twenty-minute
// field recording cannot fill the origin's quota on its own.
window.OA_KIT_KEEP_MAX_PAD = window.OA_KIT_KEEP_MAX_PAD || 48 * 1024 * 1024;

const oaKitOpen = () => new Promise((resolve, reject) => {
    const r = indexedDB.open(OA_KIT_DB, 1);
    r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(OA_KIT_STORE)) {
            r.result.createObjectStore(OA_KIT_STORE, { keyPath: 'idx' });
        }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
});

const oaKitTx = async (mode, fn) => {
    const db = await oaKitOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OA_KIT_STORE, mode);
        const req = fn(tx.objectStore(OA_KIT_STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
};

const kitBytes = (buffer) => buffer.numberOfChannels * buffer.length * 4;

/**
 * Keep one pad's audio. Called from oaSetDrumSample, so every road that puts a
 * sound on a pad — the browser, the mixer, a drum set, a restore, a recording —
 * is covered without any of them knowing this exists.
 *
 * Never awaited by its caller and never throws: a full quota or a private
 * window means the kit is not kept, which costs a folder prompt next session
 * and nothing at all this one.
 */
const keepTimers = {};

const writeKeep = function (idx, entry) {
    if (!entry || !entry.buffer) return Promise.resolve(false);
    const buffer = entry.buffer;
    if (kitBytes(buffer) > window.OA_KIT_KEEP_MAX_PAD) return Promise.resolve(false);
    const channels = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        // A copy, not the view: getChannelData hands back live storage, and
        // IndexedDB is going to structured-clone whatever it is given later.
        channels.push(new Float32Array(buffer.getChannelData(c)));
    }
    return oaKitTx('readwrite', (s) => s.put({
        idx: Number(idx),
        name: entry.name || '',
        folder: entry.folder || '',
        rate: buffer.sampleRate,
        channels: channels,
        // The chop and the tuning travel with the audio; a rehydrated pad is
        // the pad as it was left, not the raw file it came from.
        pitch: entry.pitch || 1,
        offset: entry.offset || 0,
        end: (entry.end != null ? entry.end : null),
        fadeIn: entry.fadeIn || 0,
        fadeOut: entry.fadeOut || 0,
        fade: !!entry.fade,
        loop: !!entry.loop,
        at: Date.now(),
    })).then(() => true).catch(() => false);
};

window.oaKeepSample = function (idx, entry) {
    if (!window.OA_KIT_KEEP || !entry || !entry.buffer) return Promise.resolve(false);
    // Coalesced per pad. A pitch or chop edit arrives on every tick of a
    // slider, and each write copies the pad's whole channel data — writing on
    // all of them would spend longer in the store than in the mixer.
    if (keepTimers[idx]) clearTimeout(keepTimers[idx]);
    return new Promise((resolve) => {
        keepTimers[idx] = setTimeout(() => {
            keepTimers[idx] = null;
            resolve(writeKeep(idx, entry));
        }, 400);
    });
};

/** Forget one pad (or all of them, with no argument). */
window.oaForgetSample = function (idx) {
    return oaKitTx('readwrite', (s) => (idx == null ? s.clear() : s.delete(Number(idx)))).catch(() => {});
};

/**
 * Put the kept kit back into memory. Runs at startup, before anything is
 * played, and never overwrites a pad that already has audio — a song or a set
 * loaded in the meantime is the more recent answer about what belongs there.
 */
window.oaRehydrateKit = async function () {
    if (!window.OA_KIT_KEEP) return 0;
    let rows = [];
    try { rows = (await oaKitTx('readonly', (s) => s.getAll())) || []; } catch (e) { return 0; }
    if (!rows.length) return 0;

    const ctx = window.oaAudioCtx();
    let restored = 0;
    for (const row of rows) {
        try {
            if (row.idx >= window.OA_PAD_MAX) continue;
            const existing = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[row.idx];
            if (existing && existing.buffer) continue;
            const chans = row.channels || [];
            if (!chans.length || !chans[0] || !chans[0].length) continue;
            // Built at the rate it was recorded at, not the context's: a buffer
            // whose rate differs is resampled on playback and keeps its pitch,
            // whereas relabelling 44.1k data as 48k transposes the whole kit.
            const buffer = ctx.createBuffer(chans.length, chans[0].length, row.rate || ctx.sampleRate);
            for (let c = 0; c < chans.length; c++) buffer.copyToChannel(chans[c], c);
            window.oaSetDrumSample(row.idx, buffer, {
                name: row.name, folder: row.folder,
                pitch: row.pitch, offset: row.offset, end: row.end,
                fadeIn: row.fadeIn, fadeOut: row.fadeOut, fade: row.fade, loop: row.loop,
                // Straight back out of the store it came from would be a write
                // per pad for no change at all.
                fromStore: true,
            });
            restored++;
        } catch (e) { /* one unreadable row must not cost the other twenty-four */ }
    }
    if (restored) window.dispatchEvent(new CustomEvent('oa-kit-rehydrated', { detail: { restored: restored } }));
    return restored;
};

// Walk a persisted root directory handle to a file. folderPath's first segment
// is the root's own name (skipped); the rest are sub-folders.
async function oaNavigateToFile(root, folderPath, name) {
    const parts = (folderPath || '').split('/').filter(Boolean);
    let dir = root;
    for (let i = 1; i < parts.length; i++) dir = await dir.getDirectoryHandle(parts[i]);
    return await dir.getFileHandle(name);
}

// ---------------------------------------------------------------------------
// Kits that were renamed under someone's feet.
//
// The eight factory sample folders were renamed, and a song saved before that
// stores the OLD folder against every pad. Nothing about the restore path fails
// loudly when a folder is missing — it is a `catch` that skips the pad, because
// a sample the user moved or deleted has to be survivable — so without this the
// symptom is a song that opens with silent pads and no explanation at all.
//
// The saved name is tried FIRST and this is only the fallback: someone who kept
// their own folder under the old name, or who has both, keeps working, and the
// alias never overrides a folder that actually exists.
// ---------------------------------------------------------------------------
const OA_KIT_ALIASES = {
    'Akai Linndrum':         'APK 404',
    'Akai MPC-60':           'APK 414',
    'Alesis SR-16':          'APK 424',
    'Boss DR-550':           'APK 434',
    'Oberheim DMX':          'APK 454',
    'Roland CompuRhythm-78': 'APK 464',
    'Roland TR-808':         'APK 474',
    'Roland TR-909':         'APK 484',
};

/** The same path with a renamed kit folder swapped in, or null if none applies. */
window.oaAliasKitFolder = function (folderPath) {
    const parts = (folderPath || '').split('/');
    const last = parts[parts.length - 1];
    const alias = OA_KIT_ALIASES[last];
    if (!alias) return null;
    parts[parts.length - 1] = alias;
    return parts.join('/');
};

/**
 * Find a file, trying the folder as it was saved and then under its new name.
 * Throws only when neither is there, so the caller's skip-and-carry-on still
 * means what it meant.
 */
async function oaOpenSampleFile(root, folderPath, name) {
    try {
        return await oaNavigateToFile(root, folderPath, name);
    } catch (e) {
        const alias = window.oaAliasKitFolder(folderPath);
        if (!alias) throw e;
        return await oaNavigateToFile(root, alias, name);
    }
}

// A pad whose sample came from the recorder carries the synthetic folder name
// instead of a path on disk. Those come out of IndexedDB and need neither a
// picked folder nor a permission prompt.
const oaIsRecMeta = (m) => !!m && m.folder === window.OA_REC_FOLDER;

// Re-load samples from the persisted folder using per-pad {name, folder} meta.
// MUST be called from a user gesture — may prompt for folder read permission.
window.oaRestoreKit = async function (metaByIdx) {
    const metas = Object.keys(metaByIdx).map((i) => metaByIdx[i]).filter((m) => m && m.name);
    const wantsDisk = metas.some((m) => !oaIsRecMeta(m));
    const wantsRecs = metas.some(oaIsRecMeta);

    // The folder is only fetched, and only prompted for, if something actually
    // needs it — a kit built entirely from recordings must restore on a machine
    // that has never picked a folder at all.
    let root = wantsDisk ? await window.oaIdbGet('oaRootDir') : null;
    if (wantsDisk && !root && !wantsRecs) return { ok: false, reason: 'no-folder', restored: 0 };
    if (root && root.queryPermission) {
        let p = await root.queryPermission({ mode: 'read' });
        if (p !== 'granted' && root.requestPermission) p = await root.requestPermission({ mode: 'read' });
        // Refused, but there are still recordings to put back — restore those
        // rather than reporting total failure over the pads it cannot reach.
        if (p !== 'granted') {
            if (!wantsRecs) return { ok: false, reason: 'permission', restored: 0 };
            root = null;
        }
    }

    let restored = 0;
    for (const idx in metaByIdx) {
        const m = metaByIdx[idx]; if (!m || !m.name) continue;
        try {
            let file = null;
            if (oaIsRecMeta(m)) file = window.oaRecFile ? await window.oaRecFile(m.name) : null;
            else if (root) file = await (await oaOpenSampleFile(root, m.folder, m.name)).getFile();
            if (!file) continue;
            const buf = await window.oaDecodeAudio(window.oaAudioCtx(), await file.arrayBuffer());
            window.oaSetDrumSample(Number(idx), buf, { name: m.name, folder: m.folder || '' });
            restored++;
        } catch (e) { /* file moved/renamed/deleted — skip */ }
    }
    return { ok: true, restored };
};

// Ensure read permission on the persisted root folder (call from a user gesture).
window.oaEnsureRootPermission = async function () {
    const root = window.OA_SOUND_DIR || await window.oaIdbGet('oaRootDir');
    if (!root) return false;
    if (root.queryPermission) {
        let p = await root.queryPermission({ mode: 'read' });
        if (p !== 'granted' && root.requestPermission) p = await root.requestPermission({ mode: 'read' });
        if (p !== 'granted') return false;
    }
    window.OA_SOUND_DIR = root;
    return true;
};

// Resolve a File from {folder, name} using the persisted root (if permitted).
window.oaResolveFile = async function (folderPath, name) {
    // Recordings are not on disk — this is the one folder name that resolves
    // out of IndexedDB, which is what lets a take be favorited like any file.
    if (folderPath === window.OA_REC_FOLDER && window.oaRecFile) return await window.oaRecFile(name);
    const root = window.OA_SOUND_DIR || await window.oaIdbGet('oaRootDir');
    if (!root) return null;
    if (root.queryPermission) { const p = await root.queryPermission({ mode: 'read' }); if (p !== 'granted') return null; }
    try { const fh = await oaOpenSampleFile(root, folderPath, name); return await fh.getFile(); } catch (e) { return null; }
};
