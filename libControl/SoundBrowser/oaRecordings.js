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

// Recordings made on this device, and where they live.
//
// A recording has to survive a reload the same way a browsed file does, but it
// has no folder on disk to be re-read from — so it IS the storage. That rules
// out localStorage: it holds strings, caps out around 5MB, and a base64'd WAV
// is a third bigger than the audio it carries. IndexedDB stores the Blob itself
// with no re-encoding and no practical size ceiling, so that is where they go.
//
// To the rest of the app a recording is an ordinary sample from a folder called
// "Recordings". Pads persist {name, folder}, favorites persist {name, folder},
// and oaResolveFile in oaDrumkitStorage.js recognises this folder name and
// comes here instead of walking the picked directory. Nothing else has to know.

window.OA_REC_FOLDER = 'Recordings';
window.OA_REC_MAX_SECONDS = 120;

const OA_REC_DB = 'oaRecordings';
const OA_REC_STORE = 'recs';

// Keyed on the name rather than an id, because the name is the only handle the
// pad meta carries — a pad remembers "KICK ROOM.wav in Recordings" and has to
// find it again from that alone.
const oaRecOpen = () => new Promise((resolve, reject) => {
    const r = indexedDB.open(OA_REC_DB, 1);
    r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(OA_REC_STORE)) {
            r.result.createObjectStore(OA_REC_STORE, { keyPath: 'name' });
        }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
});

const oaRecTx = async (mode, fn) => {
    const db = await oaRecOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OA_REC_STORE, mode);
        const req = fn(tx.objectStore(OA_REC_STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
};

// Newest first: you almost always want the take you just made.
window.oaRecList = async () => {
    try {
        const all = await oaRecTx('readonly', (s) => s.getAll());
        return (all || []).sort((a, b) => (b.at || 0) - (a.at || 0));
    } catch (e) { return []; }
};

window.oaRecGet = async (name) => {
    try { return await oaRecTx('readonly', (s) => s.get(name)); } catch (e) { return null; }
};

window.oaRecDelete = (name) => oaRecTx('readwrite', (s) => s.delete(name));

// The name is the key, so a second take called "KICK.wav" would silently
// replace the first. Suffix instead, and hand back the name actually used.
window.oaRecSave = async (name, blob, meta) => {
    const taken = new Set((await window.oaRecList()).map((r) => r.name));
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '.wav';
    let final = stem + ext;
    for (let n = 2; taken.has(final); n++) final = `${stem} ${n}${ext}`;
    const entry = {
        name: final, blob, at: Date.now(),
        ms: (meta && meta.ms) || 0,
        rate: (meta && meta.rate) || 0,
        channels: (meta && meta.channels) || 1,
        size: blob.size,
    };
    await oaRecTx('readwrite', (s) => s.put(entry));
    return entry;
};

// A recording as a File, so it drops into every path that already takes one —
// decode for a waveform, hand to a pad, hand to a sequencer track.
window.oaRecFile = async (name) => {
    const rec = await window.oaRecGet(name);
    if (!rec || !rec.blob) return null;
    return new File([rec.blob], rec.name, { type: rec.blob.type || 'audio/wav', lastModified: rec.at || Date.now() });
};

// Hand a take back to the user as a file. A recording lives in this browser's
// IndexedDB and nowhere else, so without this it cannot leave the device.
window.oaDownloadRecording = (entry) => {
    const file = entry && entry.file;
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = entry.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
};

/**
 * Float channels to a 16-bit PCM WAV **Blob**.
 *
 * Named for its argument since PLAN-646.01: oaDrumkitAudio.js holds
 * oaEncodeWavFromBuffer, which takes a decoded AudioBuffer and returns an
 * ArrayBuffer. The two shared one global name, this one won on load order, and
 * the sequencer's callers were passing the other one's argument.
 *
 * The obvious alternative is MediaRecorder, which hands back WebM/Opus — a
 * lossy container that not every decoder in this app, and not every tool you
 * might drag the file into afterwards, will open. A sample is something you
 * chop and pitch, so it is worth the bytes to keep it uncompressed.
 */
window.oaEncodeWavFromChannels = (channels, sampleRate) => {
    const ch = channels.length;
    const frames = ch ? channels[0].length : 0;
    const dataBytes = frames * ch * 2;
    const dv = new DataView(new ArrayBuffer(44 + dataBytes));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };

    str(0, 'RIFF');  dv.setUint32(4, 36 + dataBytes, true);  str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true);             dv.setUint16(20, 1, true);
    dv.setUint16(22, ch, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, sampleRate * ch * 2, true);             // byte rate
    dv.setUint16(32, ch * 2, true);                          // block align
    dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, dataBytes, true);

    let o = 44;
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < ch; c++) {
            // Clamp before scaling: a sample that ran past ±1 would wrap to the
            // opposite rail and turn a loud transient into a burst of noise.
            const s = Math.max(-1, Math.min(1, channels[c][i]));
            dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            o += 2;
        }
    }
    return new Blob([dv.buffer], { type: 'audio/wav' });
};
