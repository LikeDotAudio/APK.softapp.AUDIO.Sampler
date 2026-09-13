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
 * Header: oaSongFile.js
 * Purpose: Export/import a whole song — patterns, arrangement, kit, mixer, synth.
 * Description: One portable .json carrying every saved pattern, the current
 *   arrangement, which sample sits on each track (and how it is tuned/trimmed),
 *   every mixer level, and every synth voice's parameters. Sample AUDIO is not
 *   embedded — each track records the file's name and folder, and the audio is
 *   re-read from the chosen sound folder on import.
 */

window.OA_SONG_FILE_VERSION = 3;

/**
 * YYYYMMDDHHMM in LOCAL time — the stamp that goes on the front of anything
 * this app names for you: a saved pattern, a rendered take.
 *
 * Local rather than UTC on purpose: it has to agree with the clock on the wall
 * of the room the work was done in, which is the only thing anyone reads it
 * against. Minutes is the finest it goes; two saves inside one minute are the
 * same thought, and the name that follows separates them.
 *
 * Sorting is the whole point. A folder or a library list ordered by name is
 * then ordered by when things happened, which is the order anyone looks for
 * them in — "Pattern 4, Pattern 4 (2), Pattern 4 (3)" sorts by nothing.
 */
window.oaStamp = function () {
    const d = new Date();
    const p2 = (v) => String(v).padStart(2, '0');
    return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.${p2(d.getHours())}${p2(d.getMinutes())}`;
};

// The per-track sample fields worth carrying. Deliberately excludes `buffer` and
// `cachedBuffer` (decoded audio — not JSON) and `idx` (implied by position).
const SAMPLE_FIELDS = ['name', 'folder', 'pitch', 'sampleRoot', 'offset', 'end', 'loop', 'break', 'fade'];

// idx -> serializable sample meta, or null for a track running the synth.
// Walks the largest grid, not the current one: a pad parked outside a 4 x 4
// still has its sample, and a song is worth exporting whole.
window.oaSnapshotKit = function () {
    const src = window.OA_DRUM_SAMPLES || {};
    const kit = [];
    for (let i = 0; i < window.OA_PAD_MAX; i++) {
        const e = src[i];
        if (!e || !e.name) { kit.push(null); continue; }
        const out = {};
        SAMPLE_FIELDS.forEach((k) => { if (e[k] !== undefined) out[k] = e[k]; });
        kit.push(out);
    }
    return kit;
};

window.oaExportSong = function (library, song, name, mixer) {
    const doc = {
        format: 'sampler.like.audio/song',
        version: window.OA_SONG_FILE_VERSION,
        exported: new Date().toISOString(),
        patterns: library || [],
        song: song || [],
        kit: window.oaSnapshotKit(),
        // Levels live in React/MQTT state, so the caller hands them over.
        mixer: mixer || null,
        // The rest are plain globals — read them straight from the audio layer.
        padLayout: window.OA_PAD_LAYOUT,

        // EVERY effect, asked rather than listed. Each plugin declares its own
        // save() next to the state it owns, so a song carries the reverbs, the
        // tapes, the width inserts, the drum synth AND the per-channel
        // pedals and compressors — the last two of which were missing from
        // every export before this, because nothing here named them.
        //
        // An effect added later is in the file the moment it registers.
        effects: window.oaSavePlugins ? window.oaSavePlugins() : {},

        // The same three, where a v1/v2 importer still looks for them. Cheap
        // insurance: an older build opening a newer song gets the reverb, the
        // tapes and the synth back rather than nothing.
        synth: JSON.parse(JSON.stringify(window.OA_DRUM_SYNTH || {})),
        reverb: JSON.parse(JSON.stringify(window.OA_REVERB || {})),
        delay: JSON.parse(JSON.stringify(window.OA_DELAY || {})),
    };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'song').replace(/[^\w\- ]+/g, '')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Parse a file's text into { patterns, song }, or throw with a readable reason.
window.oaParseSongFile = function (text) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
    if (!doc || typeof doc !== 'object') throw new Error('That file is not a song export.');

    // Accept a bare array of patterns too — an older or hand-made export.
    const patterns = Array.isArray(doc) ? doc : (doc.patterns || []);
    const song = Array.isArray(doc) ? [] : (doc.song || []);
    if (!Array.isArray(patterns)) throw new Error('No patterns found in that file.');

    const clean = patterns.filter((p) => p && typeof p.name === 'string' && Array.isArray(p.data));
    // A song with no patterns is still worth importing if it carries a kit,
    // mixer or synth settings — only a file with nothing at all is an error.
    const hasState = doc.kit || doc.mixer || doc.synth || doc.reverb || doc.delay
        || doc.effects || doc.padLayout;
    if (!clean.length && !hasState) throw new Error('No usable patterns found in that file.');
    return {
        patterns: clean,
        song: song.filter((item) => typeof item === 'string' || (item && typeof item === 'object' && typeof item.name === 'string')),
        // Absent in a v1 file — every consumer treats these as optional.
        kit: Array.isArray(doc.kit) ? doc.kit : null,
        mixer: doc.mixer && typeof doc.mixer === 'object' ? doc.mixer : null,
        synth: doc.synth && typeof doc.synth === 'object' ? doc.synth : null,
        reverb: doc.reverb && typeof doc.reverb === 'object' ? doc.reverb : null,
        delay: doc.delay && typeof doc.delay === 'object' ? doc.delay : null,
        padLayout: typeof doc.padLayout === 'string' ? doc.padLayout : null,
        // v3: one object keyed by plugin id. Absent in older files, which is
        // what the three legacy keys above are still read for.
        effects: doc.effects && typeof doc.effects === 'object' ? doc.effects : null,
    };
};

// Restore everything that lives outside React: synth patches, reverb, and the
// samples themselves. Async because re-reading the audio hits the filesystem.
// Returns a short report so the caller can tell the user what actually landed.
window.oaApplySongState = async function (parsed) {
    const report = { synth: 0, reverb: false, delay: false, effects: [], pads: '', samples: 0, sampleNote: '' };

    // First: a song cut on a 5 x 5 has to land on a 5 x 5, or everything after
    // this only restores the first 16 voices.
    if (parsed.padLayout && parsed.padLayout !== window.OA_PAD_LAYOUT) {
        window.oaSetPadLayout(parsed.padLayout);
        report.pads = window.oaPadLayoutFor(window.OA_PAD_LAYOUT).label;
    }

    // Every effect, restored by the effect itself.
    //
    // How to put a reverb back — program first, then the edits on top, then the
    // sends — is the REVERB's business, and it used to live here, three hundred
    // lines from the reverb in a file about song files. Same for the tape's
    // grid locks. Now each plugin owns its own load() and this asks all of them.
    //
    // The tempo travels with the mixer levels and has to go in: a tape head
    // locked to a 1/8 is re-derived at the tempo of the song it lands in.
    const bpm = (parsed.mixer && parsed.mixer.bpm) || 120;

    if (parsed.effects) {
        const done = window.oaLoadPlugins(parsed.effects, { bpm: bpm });
        report.effects = done;
        report.synth = done.indexOf('drumsynth') >= 0 ? window.OA_PAD_MAX : 0;
        report.reverb = done.indexOf('reverb') >= 0;
        report.delay = done.indexOf('delay') >= 0;
    } else {
        // A v1 or v2 file: the same three effects under their own top-level
        // keys. Handed to the same load() the new path uses, so there is one
        // implementation of "put a reverb back" rather than two that drift.
        const legacy = {};
        if (parsed.synth) legacy.drumsynth = parsed.synth;
        if (parsed.reverb) legacy.reverb = parsed.reverb;
        if (parsed.delay) legacy.delay = parsed.delay;
        const done = window.oaLoadPlugins(legacy, { bpm: bpm });
        report.effects = done;
        report.synth = parsed.synth ? Object.keys(parsed.synth).length : 0;
        report.reverb = done.indexOf('reverb') >= 0;
        report.delay = done.indexOf('delay') >= 0;
    }

    if (parsed.kit && parsed.kit.some(Boolean)) {
        // oaRestoreKit re-reads the audio; the per-track tuning and trim it does
        // not know about get re-applied on top once the buffers are in.
        const meta = {};
        parsed.kit.forEach((e, i) => { if (e && e.name) meta[i] = { name: e.name, folder: e.folder || '' }; });
        let res = { ok: false, reason: 'unavailable' };
        try { res = await window.oaRestoreKit(meta); } catch (e) { res = { ok: false, reason: 'error' }; }
        if (res && res.ok) {
            report.samples = res.restored || 0;
            parsed.kit.forEach((e, i) => {
                if (!e || !window.OA_DRUM_SAMPLES[i]) return;
                const patch = {};
                ['pitch', 'sampleRoot', 'offset', 'end', 'loop', 'break', 'fade'].forEach((k) => {
                    if (e[k] !== undefined) patch[k] = e[k];
                });
                window.oaUpdateDrumSample(i, patch);
            });
        } else {
            report.sampleNote = (res && res.reason) === 'no-folder'
                ? 'Samples were skipped — no sound folder is connected. Pick your folder, then import again.'
                : 'Samples could not be re-read from your sound folder.';
        }
    }

    return report;
};

// Merge imported patterns into the library. Same-named patterns are kept side
// by side under a suffixed name rather than silently overwriting existing work.
window.oaMergePatterns = function (library, incoming) {
    const out = [...(library || [])];
    const renamed = {};
    incoming.forEach((p) => {
        let name = p.name;
        if (out.some((e) => e.name === name)) {
            let n = 2;
            while (out.some((e) => e.name === `${p.name} (${n})`)) n++;
            name = `${p.name} (${n})`;
            renamed[p.name] = name;
        }
        out.push(Object.assign({}, p, { name }));
    });
    return { library: out, renamed };
};
