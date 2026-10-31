// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

// EVERY BUS TOPIC THIS APP SPEAKS, AND THE SHAPE OF WHAT IT SAYS ON IT.
//
// WHAT THIS OWNS: the topic strings (as builders) and the payload shapes (as
// checks). `mqttBus.js` owns the wire; this owns the vocabulary on it. A rename
// is one edit here, and `test/payloads.test.mjs` holds every producer in the
// app to the shapes below, so a consumer outside this repo -- the OS desk's
// console strips read `DrumKit/+/eq/+`, the shell's bus reader files
// `DrumKit/<pad>/sample` as a measurement -- has a contract to code against.
//
// WHAT IT MUST NOT DO: talk to the bus. No publish, no subscribe, no state.
// Nothing here runs on a message; the checks are for tests and for a consumer
// that wants to validate what it reads.
//
// The grammar is deliberate and older than this file -- see the header of
// `libControl/Pads/useSamplerState.js` for why the pads are on
// `APK.audio/Gui/DrumKit/...` and not on the window's `Gui/Display/...`.
//
// A SHAPE CHANGE IS AN API CHANGE. Bump `version` in package.json and
// exports.json when a payload below changes incompatibly (a field removed or
// retyped); adding an optional field is not one.

(function () {
    const ROOT = 'APK.audio/Gui';

    /** The three named EQ bands a console strip can reach, by topic segment. */
    const EQ_BANDS = Object.freeze(['hiGain', 'midGain', 'loGain']);

    /** The per-sequencer topics, by their last segment. */
    const SEQ_KEYS = Object.freeze(['pattern', 'clickVol', 'mutes', 'trackVol',
        'trackPan', 'solos', 'masterVol', 'library', 'song']);

    /** A sequencer's label as it appears in a topic: one safe segment. */
    const seqSegment = (label) => String(label).replace(/[^A-Za-z0-9]+/g, '_');

    window.oaTopics = Object.freeze({
        ROOT,
        EQ_BANDS,
        SEQ_KEYS,

        /** `APK.audio/Gui/DrumKit/<pad>/sample` — which file a pad holds. */
        drumKitSample: (pad) => `${ROOT}/DrumKit/${pad}/sample`,
        /** `APK.audio/Gui/DrumKit/<pad>/eq/<band>` — one strip's EQ trim, in dB. */
        drumKitEq: (pad, band) => `${ROOT}/DrumKit/${pad}/eq/${band}`,
        /** The filter the EQ bridge listens on. */
        DRUM_KIT_EQ_ALL: `${ROOT}/DrumKit/+/eq/+`,
        /** `APK.audio/Gui/DrumSets` — the saved kits. */
        DRUM_SETS: `${ROOT}/DrumSets`,
        /** `APK.audio/Gui/SoundFavorites` — the sound browser's starred files. */
        SOUND_FAVORITES: `${ROOT}/SoundFavorites`,

        seqSegment,
        /** `APK.audio/Gui/Sequencer/<label>/<key>`; an unknown key throws. */
        seq(label, key) {
            if (!SEQ_KEYS.includes(key)) throw new Error(`oaTopics.seq: no sequencer topic "${key}"`);
            return `${ROOT}/Sequencer/${seqSegment(label)}/${key}`;
        },

        /**
         * `APK.audio/Gui/DrumKit/<pad>/eq/<band>` → `{ pad, band }`, or null.
         * Only the grammar: whether the pad exists on this kit is the caller's
         * question (the bridge asks it against OA_PAD_MAX).
         */
        parseDrumKitEq(topic) {
            const parts = String(topic || '').split('/');
            if (parts.length !== 6 || `${parts[0]}/${parts[1]}` !== ROOT
                || parts[2] !== 'DrumKit' || parts[4] !== 'eq') return null;
            if (!/^\d+$/.test(parts[3]) || !EQ_BANDS.includes(parts[5])) return null;
            return { pad: Number(parts[3]), band: parts[5] };
        },
    });

    // ---------------------------------------------------------------------
    // The payload shapes. Each check returns null for a good payload and a
    // sentence for a bad one, so a failing test says what was wrong.
    // ---------------------------------------------------------------------
    const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const num = (v) => typeof v === 'number' && isFinite(v);
    const listOf = (v, ok, what) => (!Array.isArray(v) ? `${what} is not an array`
        : (v.findIndex((x) => !ok(x)) >= 0 ? `${what}[${v.findIndex((x) => !ok(x))}] is the wrong type` : null));
    const items = (ok, what) => (p) => (!isObj(p) ? 'not an object' : listOf(p.items, ok, `${what}.items`));
    const value = (p) => (!isObj(p) ? 'not an object' : (num(p.value) ? null : 'value is not a finite number'));
    const fileRef = (p) => {
        if (!isObj(p)) return 'not an object';
        if (typeof p.name !== 'string' || !p.name) return 'name is not a non-empty string';
        if (p.folder !== undefined && typeof p.folder !== 'string') return 'folder is not a string';
        return null;
    };

    /**
     * Topic filter → `{ describe, check }`. `describe` is the human contract,
     * repeated in Documentation/🧩Manual and Artifacts/ARCHITECTURE.md.
     */
    window.OA_BUS_PAYLOADS = Object.freeze({
        [`${ROOT}/DrumKit/+/sample`]: {
            describe: '{ name: string, folder: string } — retained, published by this app',
            check: (p) => fileRef(p) || (typeof p.folder === 'string' ? null : 'folder is missing'),
        },
        [`${ROOT}/DrumKit/+/eq/+`]: {
            describe: '{ value: number } in dB (a bare number is accepted) — inbound only, from the console bridge',
            check: (p) => (num(p) ? null : value(p)),
        },
        [`${ROOT}/DrumSets`]: {
            describe: '{ items: { <set name>: Array<null | { name, folder?, pitch?, loop?, fade?, offset?, url? }> } }',
            check: (p) => {
                if (!isObj(p) || !isObj(p.items)) return 'items is not an object';
                for (const [name, pads] of Object.entries(p.items)) {
                    const bad = listOf(pads, (e) => e === null || fileRef(e) === null, `items["${name}"]`);
                    if (bad) return bad;
                }
                return null;
            },
        },
        [`${ROOT}/SoundFavorites`]: {
            describe: '{ items: Array<{ name: string, folder: string }> }',
            check: items((e) => fileRef(e) === null, 'favorites'),
        },
        [`${ROOT}/Sequencer/+/pattern`]: {
            describe: '{ grid: number[][], bpm: number, steps: number, swing?: number, toneTrack?: array, toneRoot?: number|null }',
            check: (p) => {
                if (!isObj(p)) return 'not an object';
                if (!Array.isArray(p.grid) || p.grid.some((row) => listOf(row, num, 'row'))) return 'grid is not number[][]';
                if (!num(p.bpm)) return 'bpm is not a number';
                if (!num(p.steps)) return 'steps is not a number';
                if (p.swing !== undefined && !num(p.swing)) return 'swing is not a number';
                if (p.toneTrack !== undefined && !Array.isArray(p.toneTrack)) return 'toneTrack is not an array';
                if (p.toneRoot !== undefined && p.toneRoot !== null && !num(p.toneRoot)) return 'toneRoot is not a number or null';
                return null;
            },
        },
        [`${ROOT}/Sequencer/+/clickVol`]: { describe: '{ value: number } 0..1', check: value },
        [`${ROOT}/Sequencer/+/masterVol`]: { describe: '{ value: number } 0..1', check: value },
        [`${ROOT}/Sequencer/+/mutes`]: { describe: '{ items: boolean[] } one per track', check: items((x) => typeof x === 'boolean', 'mutes') },
        [`${ROOT}/Sequencer/+/solos`]: { describe: '{ items: boolean[] } one per track', check: items((x) => typeof x === 'boolean', 'solos') },
        [`${ROOT}/Sequencer/+/trackVol`]: { describe: '{ items: number[] } one per track', check: items(num, 'trackVol') },
        [`${ROOT}/Sequencer/+/trackPan`]: { describe: '{ items: number[] } one per track, -1..1', check: items(num, 'trackPan') },
        [`${ROOT}/Sequencer/+/library`]: { describe: '{ items: array } saved patterns', check: items(() => true, 'library') },
        [`${ROOT}/Sequencer/+/song`]: { describe: '{ items: array } the song order', check: items(() => true, 'song') },
    });

    /** Does an MQTT filter (`+` and `#` only) match a topic? */
    const matches = (filter, topic) => {
        const f = filter.split('/'), t = String(topic).split('/');
        for (let i = 0; i < f.length; i++) {
            if (f[i] === '#') return true;
            if (f[i] === '+') { if (t[i] === undefined) return false; continue; }
            if (f[i] !== t[i]) return false;
        }
        return f.length === t.length;
    };

    /**
     * What is wrong with `payload` on `topic`: null when it is the declared
     * shape, a sentence when it is not, and 'no declared shape' for a topic
     * this app does not speak.
     */
    window.oaBusPayloadProblem = function (topic, payload) {
        const filter = Object.keys(window.OA_BUS_PAYLOADS).find((f) => matches(f, topic));
        if (!filter) return 'no declared shape';
        return window.OA_BUS_PAYLOADS[filter].check(payload);
    };
})();
