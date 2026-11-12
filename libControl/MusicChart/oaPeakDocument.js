// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: oaPeakDocument.js
 * Purpose: The PEAK lens sidecar as a document: its two key tables, both
 *   directions of the spelling, the refusal-over-fabrication readers and the
 *   check that names a file before LensesView reads it.
 * Description: Kept out of LensesView.jsx, which reads these off
 *   `window.oaPeakDocument` at render time (never aliased at load), so the
 *   load order can move without them going undefined.
 */

// The container, and only the container — and the list lives in ONE place.
//
// Every name this view writes to disk is `<name minus container> + <its own
// suffix>`. The list and the reasoning are in
// `libControl/MusicChart/oaWithoutContainer.js`, which `sources.json` loads
// before this file; this is a call into it, not a second copy. A second copy is
// how `oaDeepScanner.js` kept the old `/\.[^/.]+$/` for a day after this file
// stopped using it, labelling `Kick 90.5 Loop` as `Kick 90` on sixteen pads
// (PLAN-602.01).
//
// Called through `window` at call time rather than aliased at load time, so
// load order can move without this going undefined. Tier three of the fallback
// below is bare `sample`, so nothing here has to strip an extension the code
// invented (PLAN-491.01).
const withoutContainer = (name) => window.oaWithoutContainer(name);

// REFUSAL OVER FABRICATION, on the screen and in the two files this view
// writes. `oaDeepScanAudio` returns `null` for anything it could not measure —
// silence has no key, a 200 ms buffer has no 400 ms loudness block — and the
// contract is in `oaDeepScanner.js`'s header. Every scalar the six lenses draw
// goes through here, so an absence is drawn as an absence.
//
// THIS REPLACED TWENTY-ODD BARE READS OF KEYS THE SCANNER HAS NEVER RETURNED.
// `scanData.musicality.key`, `scanData.loudness.integratedLUFS` and
// `scanData.chunks.length` each threw the moment their tab was opened, because
// `musicality`, `loudness` and `chunks` were undefined on the value the scan
// actually handed back — two of six lens tabs were a white screen, one of three
// exports an uncaught exception, and the third a button that did nothing
// (PLAN-601.01). The adapter is the scan; this is the reader of it.
const NOT_MEASURED = '—';
const measured = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, digits) => (measured(v)
    ? (digits == null ? String(v) : v.toFixed(digits))
    : NOT_MEASURED);

// ONE TABLE PER GROUP, READ IN BOTH DIRECTIONS — the disk spelling on the left,
// the spelling `oaScanMeasure.js` hands back in memory on the right.
//
// camelCase is correct for a JavaScript object and wrong for a document whose
// other twenty keys are snake_case, and for two releases this file resolved that
// contradiction by writing the memory spelling to disk: `musicality` and
// `loudness_ebu_r128` were handed through VERBATIM, so a `.PEAK` and the
// `.PERF.json` written by the button beside it spelled eight of the same nine
// measurements two different ways in two files a visitor downloads together
// (PLAN-1067.01). `exportPERFData` below already writes the snake_case set, and
// `lensPerfExportSchema.json` has pinned it since PLAN-802.01 — so the sidecar
// was the outlier, not the vocabulary.
//
// THE ANALYZER'S NAMES WERE NOT ADOPTED, and that was the open decision. Its
// `musicality` is `{pitch_hz, root_note_name, root_frequency_hz,
// root_cents_offset, beats_per_minute, root_midi_note, chromagram}` — the same
// measurements under a different set of words, plus four this scan does not
// take and minus the `keyConfidence` it does. Taking them would have made this
// app write one measurement as `root_note_name` in a `.PEAK` and as `key` in the
// `.PERF.json` beside it. The two formats now share exactly ONE field name,
// `pitch_hz`, and it means the same thing in both;
// `.apk.scripts/check_peak_formats.py` holds that at exactly one.
//
// `'text'` in the third column marks the one value that is a string. A key name
// has no `Number.isFinite`.
const PEAK_MUSICALITY_KEYS = [
    ['key', 'key', 'text'],
    ['key_confidence', 'keyConfidence'],
    ['pitch_hz', 'pitchHz'],
    ['cents_offset', 'centsOffset'],
    ['bpm', 'bpm'],
];
const PEAK_LOUDNESS_KEYS = [
    ['integrated_lufs', 'integratedLUFS'],
    ['max_true_peak_dbtp', 'maxTruePeakdBTP'],
    ['lra_lu', 'lraLU'],
    ['gating_threshold_lufs', 'gatingThresholdLUFS'],
];

// Memory -> disk. Every key in the table gets a slot and an unmeasurable one
// gets an explicit `null`, never a gap: `JSON.stringify` DROPS an `undefined`,
// and that is exactly how a sidecar missing its three valuable sections came to
// look like a complete one (PLAN-601.01). `null` for the whole group only when
// the scan carried no group at all, which is what the schema's
// `["object", "null"]` describes.
const toSidecarGroup = (table, source) => {
    if (!source || typeof source !== 'object') return null;
    const out = {};
    table.forEach(([disk, memory, kind]) => {
        const value = source[memory];
        out[disk] = kind === 'text' ? (value || null) : (measured(value) ? value : null);
    });
    return out;
};

// Disk -> memory, AND IT READS BOTH SPELLINGS. A `.PEAK` already on somebody's
// disk is version 1.0.0 and carries the camelCase, because 1.0.0 is what wrote
// it; the bump to 1.1.0 is only honest if the file written before it still
// imports. A version bump with no migration is the omission `peakSchema.ts` is
// 115 lines of aftermath from, and this is the migration.
//
// The source is SPREAD first so nothing unknown is dropped. An analyzer `.PEAK`
// dropped on this view keeps its `note_root_key_beat_marker_map` and its
// `root_note_name` in memory exactly as it did before, and now also lands its
// `pitch_hz` on the pitch lens — the one field the two vocabularies share.
const fromSidecarGroup = (table, source) => {
    if (!source || typeof source !== 'object') return null;
    const out = { ...source };
    table.forEach(([disk, memory]) => {
        if (source[disk] !== undefined) out[memory] = source[disk];
        else if (source[memory] === undefined) out[memory] = null;
    });
    return out;
};

// ── Which document is this? ─────────────────────────────────────────────────
// `lensPeakSidecarSchema.json` types what the export WRITES. Until PLAN-1067.02
// nothing typed what the import READS: the whole gate was
// `if (parsed.musicality || parsed.beat_markers)`, and three things followed
// from that.
//
// THE EXTENSION `.PEAK` NAMES FOUR DOCUMENTS IN THIS REPOSITORY and the
// analyzer's per-file sidecar has a `musicality` too — so it passed that guard,
// landed in `scanData`, drew em dashes off `root_note_name` and
// `beats_per_minute` (names no lens here reads) and reported "Imported metadata
// sidecar successfully". PLAN-907.01's argument is that a reader must not branch
// on a group NAME, and that guard was doing exactly that. `format` and
// `metadata.analyzer_version` are the only two things anything may branch on.
//
// `schema_version` WAS WRITTEN AND NEVER READ. PLAN-1067.01 bumped it to 1.1.0
// and taught the importer both spellings of nine keys — by trying both names,
// not by reading the version — so the field the migration exists for was inert
// on the only path that could have used it.
//
// AN UNKNOWN MAJOR REFUSES; AN UNKNOWN MINOR IMPORTS. That is the decision, and
// this is where it is written down. A minor is additive by construction, and
// 1.0.0 → 1.1.0 is the proof it is worth importing anyway: a file on a visitor's
// disk must not be orphaned by a rename. A MAJOR is the announcement that it
// would be, and reading one as though the keys still mean what they meant is how
// `peakSchema.ts` came to be 115 lines of migration for a format that changed
// shape and broke its reader in silence. A version-less file predates 1.0.0,
// cannot say which it is, and is still read on its keys — that is what it was
// always read on, and refusing it now would orphan the oldest files rather than
// the newest.
const SIDECAR_FORMAT = 'peak-lens-sidecar';
const SIDECAR_MAJOR = 1;

/**
 * Names the document, and says whether this view may read it.
 * Returns `{ read: boolean, message: string }` — `message` is what the operator
 * is told either way, so a refusal names what was dropped rather than failing
 * silently or, worse, succeeding.
 */
const identifyPeakDocument = (parsed, name) => {
    if (Array.isArray(parsed)) {
        return { read: false, message: `${name} is the analyzer's AGGREGATE .PEAK — an array of `
            + `per-file records (sample_cloud_data.PEAK). This view reads one lens sidecar.` };
    }
    if (!parsed || typeof parsed !== 'object') {
        return { read: false, message: `${name} is not a JSON object.` };
    }
    if (parsed.metadata && parsed.metadata.analyzer_version) {
        return { read: false, message: `${name} is the ANALYZER's .PEAK `
            + `(analyzer ${parsed.metadata.analyzer_version}), not this view's lens sidecar. `
            + `Its musicality says root_note_name and beats_per_minute; the lenses here read `
            + `key and bpm, so importing it would draw em dashes and call it a success.` };
    }
    if (parsed.format !== undefined && parsed.format !== SIDECAR_FORMAT) {
        return { read: false, message: `${name} says format "${parsed.format}", not `
            + `"${SIDECAR_FORMAT}".` };
    }
    const version = parsed.schema_version;
    if (typeof version === 'string') {
        const major = Number(version.split('.')[0]);
        if (!Number.isFinite(major)) {
            return { read: false, message: `${name} has an unreadable schema_version `
                + `"${version}".` };
        }
        if (major !== SIDECAR_MAJOR) {
            return { read: false, message: `${name} is schema_version ${version}. This view reads `
                + `${SIDECAR_MAJOR}.x — a major bump means its keys no longer mean what they mean `
                + `here, so it is refused rather than read wrongly.` };
        }
    }
    return { read: true, message: version
        ? `Imported metadata sidecar successfully from ${name} (schema_version ${version})`
        : `Imported metadata sidecar successfully from ${name} (no schema_version — pre-1.0.0, `
          + `read on its keys)` };
};

// What LensesView.jsx and LensesPanels.jsx read, under the names they had here.
window.oaPeakDocument = {
    withoutContainer, NOT_MEASURED, measured, num, PEAK_MUSICALITY_KEYS, PEAK_LOUDNESS_KEYS,
    toSidecarGroup, fromSidecarGroup, SIDECAR_FORMAT, SIDECAR_MAJOR, identifyPeakDocument,
};
