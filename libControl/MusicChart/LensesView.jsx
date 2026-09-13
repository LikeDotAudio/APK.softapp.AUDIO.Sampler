// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

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

window.LensesView = ({ audioBuffer, filename, padIdx }) => {
    const [activeLens, setActiveLens] = React.useState('taxonomy');
    const [scanData, setScanData] = React.useState(null);
    const [scanning, setScanning] = React.useState(false);
    // Where the scan has got to, as `oaDeepScanAudio` reports it: `{ frame,
    // totalFrames }` or null before the first report. FRAMES AND NOT A
    // PERCENTAGE — the scanner's header says why, and the short version is that
    // the loop skips quiet frames, so the last report of a healthy scan is
    // short of `totalFrames` and a bar would look stuck.
    const [scanProgress, setScanProgress] = React.useState(null);
    const [scanError, setScanError] = React.useState(null);
    // What the last import was told about the file it was handed. NOT `scanError`
    // — that banner says "the scan did not finish", which is a different and
    // untrue account of a refused import. A refusal has to be on the SCREEN and
    // not only in an `alert()`: an alert is gone the moment it is dismissed, and
    // the question the operator is left with is which document they are holding.
    const [importNote, setImportNote] = React.useState(null);
    const [ucsCatKey, setUcsCatKey] = React.useState('MUSC-TONE');
    const [creatorId, setCreatorId] = React.useState('LIKEAUDIO');
    const [sourceId, setSourceId] = React.useState('SCANALYZER');
    const [isDictating, setIsDictating] = React.useState(false);

    const canvasRef = React.useRef(null);
    const sample = (padIdx != null && window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[padIdx]) || null;
    const buf = audioBuffer || (sample && sample.buffer);
    // Three tiers, most-informed first: what the caller says, what the pad's
    // own sound calls itself, then a last resort. NO EXTENSION on that last
    // resort — the buffer may be a recording that was never a file, and every
    // export below either strips the extension or appends its own container.
    // A caller passing a stand-in here skips tiers two and three (PLAN-491.01).
    const fname = filename || (sample && sample.name) || 'sample';

    // Auto-run scanner when buffer changes
    React.useEffect(() => {
        if (!buf) return;
        setScanning(true);
        setScanError(null);
        setScanProgress(null);
        (async () => {
            try {
                const res = await window.oaDeepScanAudio(buf, setScanProgress);
                setScanData(res);
            } catch (e) {
                // A thrown scan used to leave the panel permanently blank with
                // the reason in a console nobody has open. It says so now.
                console.error("Lenses scan error:", e);
                setScanError(e && e.message ? e.message : String(e));
            } finally {
                setScanning(false);
            }
        })();
    }, [buf]);

    // Draw Performance Data Over Time Canvas Timeline
    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !buf) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth || 800;
        const height = canvas.height = 140;

        ctx.fillStyle = '#0b0d11';
        ctx.fillRect(0, 0, width, height);

        const data = buf.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const midY = height / 2;

        // 1. Draw Waveform & RMS Envelope Over Time
        ctx.fillStyle = '#1b263b';
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
            let min = 1.0, max = -1.0;
            for (let j = 0; j < step; j++) {
                const val = data[x * step + j] || 0;
                if (val < min) min = val;
                if (val > max) max = val;
            }
            const y1 = midY + min * (height * 0.35);
            const y2 = midY + max * (height * 0.35);
            ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
        }

        // 2. Draw Pitch Contour Over Time (Hz)
        //
        // ONLY WHEN THERE IS ONE. `|| 440` drew a confident line through the
        // middle of an unpitched file and labelled it 440.0 Hz — a default
        // rendered as a measurement, which is the one thing a lens must not do.
        if (scanData && scanData.musicality && measured(scanData.musicality.pitchHz)) {
            const hz = scanData.musicality.pitchHz;
            ctx.strokeStyle = '#f4902c';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const normPitchY = midY - (Math.log2(hz / 110) * 15);
            ctx.moveTo(0, normPitchY);
            ctx.lineTo(width, normPitchY);
            ctx.stroke();

            // Pitch label
            ctx.fillStyle = '#f4902c';
            ctx.font = '10px monospace';
            const keyPart = scanData.musicality.key ? ` (${scanData.musicality.key})` : '';
            ctx.fillText(`Pitch: ${hz.toFixed(1)} Hz${keyPart}`, 10, normPitchY - 4);
        }

        // 3. Draw Beat Markers Over Time
        if (scanData && Array.isArray(scanData.beatMarkers)) {
            const dur = buf.duration;
            ctx.strokeStyle = 'rgba(125, 255, 74, 0.4)';
            ctx.lineWidth = 1;
            scanData.beatMarkers.forEach(bm => {
                const x = (bm.timestamp_seconds / dur) * width;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            });
        }

        // 4. Draw Vocal VAD Bursts Over Time
        if (scanData && scanData.lyrics && Array.isArray(scanData.lyrics.words)) {
            const dur = buf.duration;
            ctx.fillStyle = 'rgba(66, 165, 245, 0.6)';
            scanData.lyrics.words.forEach(w => {
                const x1 = (w.start / dur) * width;
                const wWidth = Math.max(8, (0.5 / dur) * width);
                ctx.fillRect(x1, height - 18, wWidth, 12);
                ctx.fillStyle = '#ffffff';
                ctx.font = '8px monospace';
                ctx.fillText(w.text, x1 + 2, height - 9);
                ctx.fillStyle = 'rgba(66, 165, 245, 0.6)';
            });
        }

    }, [buf, scanData]);

    // Handle Timeline Scrubbing & Seeking
    const handleTimelineClick = (e) => {
        const canvas = canvasRef.current;
        if (!canvas || !buf) return;
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const progress = x / rect.width;
        const seekTime = progress * buf.duration;

        if (window.oaSeekAudio) {
            window.oaSeekAudio(seekTime);
        }
    };

    // Export Performance Data (.PERF.json download).
    //
    // NOT THE SAME ARTIFACT AS A TRACKED `.PERF` SIDECAR, and the two must not
    // be confused. This is a SCALAR SNAPSHOT of one scan — pitch, key, bpm, the
    // integrated loudness figures, beat markers — downloaded by a person as
    // `<name>.PERF.json`. `.apk.scripts/build_perf_sidecar.py` writes something
    // else: a `<name>.PERF` committed beside the sample, carrying a short-term
    // LUFS TRAJECTORY typed by `SCAN/Web_Front/src/perfSchema.json`.
    //
    // `format` and `schema_version` are here so that distinction survives
    // contact with a reader. `.PEAK` shipped without a version, changed shape,
    // broke its reader, and grew `normalizePeakRecords` plus a
    // LEGACY_MIGRATION_GAPS list to apologise — 115 lines that two fields would
    // have prevented.
    //
    // 1.2.0, AND NO MIGRATION IS OWED. At 1.0.0 this function threw on
    // `scanData.musicality.pitchHz` before it reached the blob, so no visitor
    // has ever held a 1.0.0 file written by it. 1.1.0 moved anyway, because the
    // shape did: `sha256_checksum` became `pcm_sha256` and said what it hashed
    // (PLAN-601.01). 1.2.0 is the same kind of move — `vad_vocal_events` is now
    // `lyric_events`, because nothing in this app has ever run Voice Activity
    // Detection and a key name is a claim (PLAN-629.01). A reader of a 1.1.0
    // file reads a FILE, not this code, and the version is how it tells which
    // name to look for; that is the whole reason the field is here.
    //
    // AND THERE IS NOW SOMETHING ON THE OTHER END OF THAT VERSION. A version is
    // a promise to a validator, and for two releases this one was made to
    // nobody: `perfSchema.json` types the OTHER `.PERF` and nothing typed this.
    // `SCAN/Web_Front/src/lensPerfExportSchema.json` does, beside it and beside
    // the `.PEAK` one, so all three descriptions of these colliding extensions
    // sit in one folder. `.apk.scripts/check_lens_exports.py` renders this
    // component, clicks this button, and validates the bytes; the schema pins
    // `schema_version` with `const` and forbids unknown keys, so a rename here
    // without the schema moving with it is a red lane (PLAN-802.01).
    const exportPERFData = () => {
        if (!scanData) return;
        const m = scanData.musicality || {};
        const l = scanData.loudness || {};
        const payload = {
            format: "perf-lens-export",
            schema_version: "1.2.0",
            filename: fname,
            // `null`, not 0, when there is no buffer to ask: 0 seconds is a
            // claim about the audio and this is the absence of one. Same rule
            // as every scalar below it.
            duration_seconds: buf ? buf.duration : null,
            sample_rate: buf ? buf.sampleRate : (window.oaSampleRate ? window.oaSampleRate() : null),
            performance_data: {
                // `null` and never absent — a reader must be able to tell "this
                // scan could not measure a tempo" from "this writer forgot to
                // put one in". Same rule as perfSchema.json's short_term array.
                pitch_hz: measured(m.pitchHz) ? m.pitchHz : null,
                cents_offset: measured(m.centsOffset) ? m.centsOffset : null,
                key: m.key || null,
                bpm: measured(m.bpm) ? m.bpm : null,
                integrated_lufs: measured(l.integratedLUFS) ? l.integratedLUFS : null,
                max_true_peak_dbtp: measured(l.maxTruePeakdBTP) ? l.maxTruePeakdBTP : null,
                lra_lu: measured(l.lraLU) ? l.lraLU : null,
                gating_threshold_lufs: measured(l.gatingThresholdLUFS) ? l.gatingThresholdLUFS : null,
                beat_markers: Array.isArray(scanData.beatMarkers) ? scanData.beatMarkers : [],
                // `lyric_events`, AND NOTHING HERE RUNS VOICE ACTIVITY
                // DETECTION. These are the lines a PERSON put in — one
                // dictated through the browser's recogniser, or a `.LRC` file
                // imported — and `oaDeepScanAudio` returns `lyrics: { words:
                // [] }` and will until a recogniser lands (PLAN-570.01). The
                // key here said `vad_vocal_events`, so every file this view
                // wrote told its reader that VAD produced the value; the lie
                // left the screen when PLAN-570.01 corrected the tab and
                // stayed in the artifact the user keeps (PLAN-629.01).
                //
                // The scan's OWN vocal rows are `vocal_section_cues` —
                // arithmetic seek points laid inside each Verse and Chorus —
                // and they are deliberately not folded in here. Recognised
                // words and cue points are different data and must not share
                // a key.
                lyric_events: (scanData.lyrics && Array.isArray(scanData.lyrics.words))
                    ? scanData.lyrics.words
                    : [],
                pcm_sha256: scanData.pcm_sha256 || null,
                sha256_scope: "decoded-pcm"
            }
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${withoutContainer(fname)}.PERF.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Speech Dictation ("Talk to Type")
    const startDictation = (onResult) => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition is not supported in this browser. Please type directly.");
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        setIsDictating(true);
        recognition.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            setIsDictating(false);
            if (onResult) onResult(transcript);
        };
        recognition.onerror = () => setIsDictating(false);
        recognition.onend = () => setIsDictating(false);
        recognition.start();
    };

    // Speech Synthesis ("Talk Back / Read Aloud")
    const speakText = (text) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    };

    // Import Metadata (.PEAK, .LRC, JSON)
    const handleImportFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target.result;
                if (file.name.endsWith('.PEAK') || file.name.endsWith('.json')) {
                    const parsed = JSON.parse(text);
                    // BEFORE ANYTHING ELSE. A document this view cannot read must
                    // leave `scanData` alone — the old guard set it first and
                    // announced success afterwards, so a wrong file replaced a
                    // real scan on its way to being called an import.
                    const document_ = identifyPeakDocument(parsed, file.name);
                    if (!document_.read) {
                        setImportNote({ refused: true, text: document_.message });
                        alert(document_.message);
                        return;
                    }
                    if (parsed.ucs) {
                        if (parsed.ucs.cat_key) setUcsCatKey(parsed.ucs.cat_key);
                        if (parsed.ucs.creator_id) setCreatorId(parsed.ucs.creator_id);
                        if (parsed.ucs.source_id) setSourceId(parsed.ucs.source_id);
                    }
                    if (parsed.musicality || parsed.beat_markers) {
                        setScanData(prev => ({
                            ...prev,
                            // BOTH SPELLINGS, and the table is the one the
                            // export writes through. A 1.0.0 sidecar carries
                            // camelCase inside these two groups because 1.0.0
                            // wrote what the scan held; 1.1.0 carries the
                            // snake_case the rest of the document has always
                            // used. `fromSidecarGroup` reads either and hands
                            // the view the memory spelling it draws from, so a
                            // file downloaded before the bump still round-trips
                            // (PLAN-1067.01).
                            musicality: fromSidecarGroup(PEAK_MUSICALITY_KEYS, parsed.musicality)
                                || (prev && prev.musicality),
                            beatMarkers: parsed.beat_markers || (prev && prev.beatMarkers),
                            // NO `lyrics_vad` FALLBACK, AND NO MIGRATION IS
                            // OWED. A `.PEAK` old enough to carry that key
                            // carries an ARRAY under it — `scanData.lyrics`
                            // was an array until PLAN-601.01 — whose rows are
                            // keyed `word` while everything that reads them
                            // reads `text`. So the value in every such file is
                            // already unreadable by this view: `[].words` is
                            // `undefined` and the guard below rejects it. A
                            // fallback would import nothing and keep the lying
                            // name alive in the code (PLAN-629.01).
                            lyrics: parsed.lyrics || (prev && prev.lyrics),
                            loudness: fromSidecarGroup(PEAK_LOUDNESS_KEYS, parsed.loudness_ebu_r128)
                                || (prev && prev.loudness)
                        }));
                    }
                    setImportNote({ refused: false, text: document_.message });
                    alert(document_.message);
                } else if (file.name.endsWith('.lrc')) {
                    const lines = text.split('\n');
                    const words = [];
                    lines.forEach(l => {
                        const m = l.match(/\[(\d+):(\d+\.\d+)\]\s*(.*)/);
                        if (m) {
                            const time = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
                            words.push({ start: time, text: m[3] });
                        }
                    });
                    setScanData(prev => ({
                        ...prev,
                        lyrics: { words, vadSegments: [] }
                    }));
                    alert(`Imported ${words.length} LRC lyric timestamps from ${file.name}`);
                }
            } catch (err) {
                console.error("Metadata import failed:", err);
                alert("Could not parse imported metadata file.");
            }
        };
        reader.readAsText(file);
    };

    // Export Helpers
    //
    // THE THREE VALUABLE SECTIONS USED TO BE MISSING FROM EVERY FILE THIS
    // WROTE. `musicality`, `beat_markers` and `loudness_ebu_r128` each read a
    // key the scanner did not return, so `JSON.stringify` dropped all three and
    // the sidecar came out looking complete (PLAN-601.01). They are measured
    // now, and an unmeasurable one is `null` rather than absent.
    //
    // THERE ARE TWO `.PEAK` FORMATS AND THIS IS THE SECOND ONE. The 147 files
    // tracked under `SampleLibrary/` are the ANALYZER's — grouped `metadata` /
    // `classification` / `envelope` / `spectral_features`, written by
    // `sample_analyzer_rs` and read by `SCAN/Web_Front/src/peakSchema.ts` —
    // and this one shares the extension with them and not one group name. The
    // extension cannot tell them apart, so `format` does. `App.jsx`'s global
    // drop accepts either.
    //
    // 1.1.0, AND A MIGRATION IS OWED AND PAID. Every key in this document was
    // snake_case except the five inside `musicality` and the four inside
    // `loudness_ebu_r128`, which were handed through verbatim from
    // `oaScanMeasure.js` and therefore carried its in-memory camelCase onto
    // disk. 1.1.0 spells them the way the rest of the document and the
    // `.PERF.json` beside it already did, and `handleImportFile` above reads
    // BOTH spellings so a 1.0.0 file a visitor already downloaded still imports
    // (PLAN-1067.01). Unlike the `.PERF` export's 1.0.0, this one WAS reachable
    // and files exist, which is why the migration is not optional here.
    //
    // `schema_version` FROM 1.0.0, WHICH IS LATE AND NOT OPTIONAL. This is the
    // omission `peakSchema.ts` is an account of: a format shipped without a
    // version, changed shape, broke its reader, and grew `normalizePeakRecords`
    // plus a `LEGACY_MIGRATION_GAPS` list to apologise. Its own header argues
    // that two fields would have prevented all of it, and the export beside it
    // went on writing neither until PLAN-802.01. Both files are now typed by a
    // committed schema — `lensPeakSidecarSchema.json` for this one — and
    // `.apk.scripts/check_lens_exports.py` renders this component, clicks this
    // button, and validates what comes out. A key renamed here without the
    // schema moving with it is a red lane, which is what a version is FOR.
    const exportPeakSidecar = () => {
        if (!scanData) return;
        const payload = {
            format: "peak-lens-sidecar",
            // 1.2.0: `bext_time_reference` and the three `spatial_aes69`
            // numbers became nullable when PLAN-908.01 stopped writing values
            // nobody measured. A MINOR, so every 1.0.0 and 1.1.0 file on a
            // visitor's disk still imports — `identifyPeakDocument` refuses on
            // an unknown MAJOR only, and the reason is written where that
            // decision lives.
            schema_version: "1.2.0",
            filename: fname,
            ucs: {
                cat_key: ucsCatKey,
                creator_id: creatorId,
                source_id: sourceId,
            },
            // SNAKE_CASE, THROUGH THE TABLE, AND NOT HANDED THROUGH VERBATIM
            // ANY MORE. These two objects were the only camelCase in the whole
            // document — the two a reader most needs to line up against the
            // analyzer's `.PEAK` — because the scan's in-memory shape was
            // written straight to disk (PLAN-1067.01).
            musicality: toSidecarGroup(PEAK_MUSICALITY_KEYS, scanData.musicality),
            beat_markers: Array.isArray(scanData.beatMarkers) ? scanData.beatMarkers : [],
            loudness_ebu_r128: toSidecarGroup(PEAK_LOUDNESS_KEYS, scanData.loudness),
            archival_aes: {
                // The digest of the DECODED SAMPLES, and `sha256_scope` says so.
                // The constant that stood here — e3b0c442…b855 — is the SHA-256
                // of the empty string, written into an archival preservation
                // block as though it were this file's checksum. A page holding
                // an AudioBuffer cannot hash the file it came from; it can hash
                // what it has, and name it.
                pcm_sha256: scanData.pcm_sha256 || null,
                sha256_scope: "decoded-pcm",
                // `null`, NOT `0`. A BWF time reference of 0 is not "unknown" —
                // it is the claim that this audio begins at sample zero of the
                // timeline it was recorded against, which is a fact only the
                // `bext` chunk carries and this page never sees one: it holds a
                // decoded `AudioBuffer`, and the chunk was gone before it got
                // here. Same correction, same block, same reason as the
                // `e3b0c442…b855` that stood in `pcm_sha256` (PLAN-601.01) —
                // and the same shape as its `null`. PLAN-908.01.
                bext_time_reference: null,
                version: "AES60-BWF-v2"
            },
            // NOTHING HERE IS MEASURED, SO NOTHING HERE IS A NUMBER.
            //
            // These four used to be `0.0, 0.0, 1.0` and a format string, which
            // reads off the file as "the source is dead ahead at one metre".
            // `grep -n azimuth_deg` finds one site in this component and it is
            // the literal: no control offers a placement, no scan derives one,
            // and no importer fills one in. A reader handed the sidecar could
            // not tell a measured placement from nobody having asked, which is
            // the fabrication `002_🏛⚖📜 Philosophy/Doctrine/readme.Refusal over
            // fabrication.md` names.
            //
            // `sofa_format` STAYS A STRING, and it is not the same kind of
            // claim: it says which vocabulary the three numbers would be
            // expressed in if one ever measured them, exactly as
            // `sha256_scope` names the scope of a `pcm_sha256` that is often
            // null. PLAN-908.01.
            spatial_aes69: {
                azimuth_deg: null,
                elevation_deg: null,
                distance_m: null,
                sofa_format: "AES69-SOFA-v1"
            },
            // `lyrics`, not `lyrics_vad` — the same correction as the `.PERF`
            // export above, and for the same reason. An OBJECT and never
            // undefined: `scanData.lyrics` is `{ words: [] }` from the scanner
            // and `{ words, vadSegments }` from dictation and `.LRC` import,
            // but it is whatever the importer below put there when a sidecar
            // was dropped, so it is normalised on the way out.
            lyrics: (scanData.lyrics && Array.isArray(scanData.lyrics.words))
                ? scanData.lyrics
                : { words: [] }
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${withoutContainer(fname)}.PEAK`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // The four sections of a scan, each substituted with an EMPTY one rather
    // than left undefined. A lens whose section is missing draws NOT_MEASURED;
    // it does not throw, and it does not invent a number. Reading them here
    // once is the "one place, not twenty" of PLAN-601.01.
    const musicality = (scanData && scanData.musicality) || {};
    const loudness = (scanData && scanData.loudness) || {};
    const beatMarkers = (scanData && Array.isArray(scanData.beatMarkers)) ? scanData.beatMarkers : [];
    const sections = (scanData && Array.isArray(scanData.sections)) ? scanData.sections : [];
    /** The dictated / imported lines, if there are any. Never undefined. */
    const lyricWords = (scanData && scanData.lyrics && Array.isArray(scanData.lyrics.words))
        ? scanData.lyrics.words
        : [];

    // The button that did nothing. It was enabled whenever a scan existed and
    // returned on the first line, because `scanData.lyrics` was an ARRAY and
    // `[].words` is undefined — so a visitor clicked it and got no file, no
    // error and no explanation. Its `disabled` now tracks the same condition
    // this guard tests, so a click that cannot write is a control that cannot
    // be pressed.
    const exportLrcLyrics = () => {
        if (!lyricWords.length) return;
        let lrc = `[ar:${creatorId}]\n[ti:${fname}]\n[by:Scanalyzer]\n\n`;
        lyricWords.forEach(w => {
            const min = String(Math.floor(w.start / 60)).padStart(2, '0');
            const sec = String(Math.floor(w.start % 60)).padStart(2, '0');
            const ms = String(Math.floor((w.start % 1) * 100)).padStart(2, '0');
            lrc += `[${min}:${sec}.${ms}] ${w.text}\n`;
        });

        const blob = new Blob([lrc], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${withoutContainer(fname)}.lrc`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!buf) {
        return (
            <div style={{ background: '#121418', border: '1px solid #333', borderRadius: '6px', padding: '20px', textAlign: 'center', color: '#888' }}>
                <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>🔭</span>
                Select or drop an audio track to launch the Multidimensional Audio Lenses Inspector.
            </div>
        );
    }

    return (
        <div style={{ background: '#121418', border: '1px solid var(--accent)', borderRadius: '6px', padding: '12px', color: '#ccc', fontFamily: 'monospace' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid #2a2f38', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px', color: 'var(--accent)', fontWeight: 'bold' }}>🔭 MULTIDIMENSIONAL AUDIO LENSES</span>
                    <span style={{ fontSize: '11px', color: '#888', background: '#1e222b', padding: '2px 6px', borderRadius: '3px' }}>{fname}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <label style={{ background: '#2a2f38', color: '#ccc', border: '1px solid #444', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                        📥 Import Sidecar/LRC
                        <input type="file" accept=".PEAK,.json,.lrc" onChange={handleImportFile} style={{ display: 'none' }} />
                    </label>
                    <button onClick={exportPERFData} disabled={!scanData}
                        style={{ background: '#9c27b0', color: '#fff', border: 'none', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                        📊 Export .PERF JSON
                    </button>
                    <button onClick={exportPeakSidecar} disabled={!scanData}
                        style={{ background: 'var(--accent)', color: '#111', border: 'none', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                        💾 Export .PEAK
                    </button>
                    <button onClick={exportLrcLyrics} disabled={!lyricWords.length}
                        title={lyricWords.length ? '' : 'No lyric lines yet — dictate one, or import an .LRC.'}
                        style={{ background: lyricWords.length ? '#2196f3' : '#1e222b', color: lyricWords.length ? '#fff' : '#666', border: 'none', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', cursor: lyricWords.length ? 'pointer' : 'not-allowed' }}>
                        📝 Export .LRC
                    </button>
                </div>
            </div>

            {/* Performance Data Over Time Timeline Canvas */}
            <div style={{ marginBottom: '12px', background: '#0b0d11', borderRadius: '4px', padding: '4px', border: '1px solid #222' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                        📈 PERFORMANCE DATA OVER TIME (CLICK TO SEEK & PLAY)
                    </span>
                    <span style={{ fontSize: '9px', color: '#888' }}>
                        Waveform / Pitch Contour (Hz) / Beat Grid / Vocal VAD Bursts
                    </span>
                </div>
                <canvas ref={canvasRef} onClick={handleTimelineClick} style={{ width: '100%', height: '140px', display: 'block', borderRadius: '3px', cursor: 'pointer' }} />
            </div>

            {/* Lens Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', borderBottom: '1px solid #222', paddingBottom: '6px', overflowX: 'auto' }}>
                {[
                    { id: 'taxonomy', label: '🔍 1. UCS Taxonomy' },
                    { id: 'musicality', label: '🎵 2. Pitch & Beats' },
                    /* `Lyric Dictation`, not `Lyrics VAD`, and the rename is the same
                     * ruling PLAN-629.01 took about the DATA one layer down: the export
                     * key `lyrics_vad` claimed Voice Activity Detection over a scanner
                     * that runs none, and became `lyrics`. The chrome kept the claim
                     * for ten days. What this lens offers is what its own button
                     * already says -- `Dictate Lyric Line`, a person typing a line
                     * against a playhead -- so the tab now says that too. PLAN-1069.01.
                     *
                     * THE `*` DOWN THE MARGIN IS LOAD-BEARING. `deepscan.test.mjs`
                     * bans the old key from the CODE and exempts the comments, so that
                     * a note recording the rename is not itself read as a relapse --
                     * and it draws that line by dropping every source line that starts
                     * with `//`, `*` or `/*`. A continuation line without one puts
                     * `lyrics_vad` back on the wrong side of it, which is exactly how
                     * this comment first went red. */
                    { id: 'lyrics', label: '🎙️ 3. Lyric Dictation' },
                    { id: 'loudness', label: '🎚️ 4. EBU R128 Loudness' },
                    { id: 'archival', label: '🏛️ 5. AES Preservation' },
                    { id: 'spatial', label: '🌐 6. AES69 3D Spatial' }
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveLens(tab.id)}
                        style={{
                            background: activeLens === tab.id ? 'var(--accent-s70)' : '#1e222b',
                            color: activeLens === tab.id ? 'var(--accent-t60)' : '#aaa',
                            border: `1px solid ${activeLens === tab.id ? 'var(--accent)' : '#333'}`,
                            borderRadius: '4px', padding: '4px 8px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold'
                        }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Scanning Status */}
            {/* THE LINE MOVES NOW. It said one fixed sentence for the whole
                scan, so a five-second scan and a hung one looked identical —
                which is the complaint PLAN-801.01 was carved from, with the
                number changed. It updates about forty-five times over a
                three-minute track, once per yield. */}
            {scanning && (
                <div style={{ color: 'var(--accent)', fontSize: '11px', marginBottom: '10px' }}>
                    ⚡ Extracting 6-lens metadata from audio buffer
                    {scanProgress
                        ? ` — frame ${scanProgress.frame.toLocaleString()} of ${scanProgress.totalFrames.toLocaleString()}`
                        : '...'}
                </div>
            )}
            {importNote && (
                <div style={{
                    background: importNote.refused ? '#3a1f1f' : '#1b2a1b',
                    border: `1px solid ${importNote.refused ? '#a33' : '#3a6'}`,
                    borderRadius: '4px', padding: '8px', margin: '8px 0',
                    fontSize: '11px', color: '#ddd',
                }}>
                    {importNote.refused ? '⛔ Not imported: ' : '📥 '}{importNote.text}
                </div>
            )}
            {scanError && (
                <div style={{ color: '#ff5252', fontSize: '11px', marginBottom: '10px', background: '#1e1416', border: '1px solid #4a2226', borderRadius: '4px', padding: '8px' }}>
                    ⚠ The scan did not finish, so these lenses have nothing to read: {scanError}
                </div>
            )}

            {/* Lens Views */}
            {scanData && (
                <div>
                    {/* Lens 1: UCS Taxonomy */}
                    {activeLens === 'taxonomy' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px' }}>
                            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px', border: '1px solid #2a2f38' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>UCS CATEGORY CONFIGURATION</span>
                                    <button onClick={() => startDictation(txt => setUcsCatKey(txt.toUpperCase().replace(/\s+/g, '-')))}
                                        style={{ background: isDictating ? '#ff5252' : '#333', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>
                                        {isDictating ? '🎙️ Listening…' : '🎤 Dictate CatKey'}
                                    </button>
                                </div>
                                <label style={{ display: 'block', marginBottom: '4px' }}>CatKey (6-Part Schema):</label>
                                <input value={ucsCatKey} onChange={e => setUcsCatKey(e.target.value)}
                                    style={{ width: '100%', background: '#0d0e12', border: '1px solid #444', color: '#fff', padding: '4px', borderRadius: '3px', marginBottom: '8px' }} />
                                
                                <label style={{ display: 'block', marginBottom: '4px' }}>Creator ID:</label>
                                <input value={creatorId} onChange={e => setCreatorId(e.target.value)}
                                    style={{ width: '100%', background: '#0d0e12', border: '1px solid #444', color: '#fff', padding: '4px', borderRadius: '3px', marginBottom: '8px' }} />

                                <label style={{ display: 'block', marginBottom: '4px' }}>Source ID:</label>
                                <input value={sourceId} onChange={e => setSourceId(e.target.value)}
                                    style={{ width: '100%', background: '#0d0e12', border: '1px solid #444', color: '#fff', padding: '4px', borderRadius: '3px' }} />
                            </div>
                            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px', border: '1px solid #2a2f38' }}>
                                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '6px' }}>COMPOSED UCS BASENAME</div>
                                <div style={{ fontSize: '12px', color: '#7dff4a', background: '#0d0e12', padding: '8px', borderRadius: '3px', wordBreak: 'break-all' }}>
                                    {`${ucsCatKey}_${withoutContainer(fname)}_${creatorId}_${sourceId}.wav`}
                                </div>
                                <button onClick={() => speakText(`UCS Category Key: ${ucsCatKey}. Composed filename: ${ucsCatKey}_${withoutContainer(fname)}_${creatorId}_${sourceId}.wav`)}
                                    style={{ marginTop: '8px', background: '#2a2f38', color: '#7dff4a', border: '1px solid #444', borderRadius: '3px', padding: '3px 8px', fontSize: '9px', cursor: 'pointer' }}>
                                    🔊 Read Aloud UCS Basename
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Lens 2: Pitch & Beats */}
                    {activeLens === 'musicality' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '11px' }}>
                            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                                <div style={{ color: '#aaa' }}>DETECTED KEY & PITCH</div>
                                <div style={{ fontSize: '20px', color: musicality.key ? 'var(--accent)' : '#666', fontWeight: 'bold' }}>{musicality.key || NOT_MEASURED}</div>
                                <div>{num(musicality.pitchHz, 2)} Hz ({num(musicality.centsOffset)} cents)</div>
                                {!musicality.key && <div style={{ color: '#777', marginTop: '4px' }}>No frame cleared the scanner's noise floor, so this buffer has no key to report.</div>}
                                <button onClick={() => speakText(musicality.key
                                    ? `Key: ${musicality.key}, ${num(musicality.pitchHz, 1)} Hertz`
                                    : 'No key or pitch was measured in this buffer.')}
                                    style={{ marginTop: '6px', background: '#2a2f38', color: '#ccc', border: 'none', padding: '2px 5px', fontSize: '9px', borderRadius: '2px', cursor: 'pointer' }}>
                                    🔊 Speak Pitch
                                </button>
                            </div>
                            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                                <div style={{ color: '#aaa' }}>ESTIMATED TEMPO</div>
                                <div style={{ fontSize: '20px', color: measured(musicality.bpm) ? '#7dff4a' : '#666', fontWeight: 'bold' }}>{num(musicality.bpm, 1)} BPM</div>
                                <div>{beatMarkers.length} Energy Onsets Detected</div>
                                {!measured(musicality.bpm) && <div style={{ color: '#777', marginTop: '4px' }}>A tempo needs several bars of onsets to autocorrelate; this buffer has none.</div>}
                            </div>
                            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                                <div style={{ color: '#aaa' }}>SOUNDING CHUNKS</div>
                                <div style={{ fontSize: '20px', color: '#42a5f5', fontWeight: 'bold' }}>{sections.length} Chunks</div>
                                <div>Ready for 16-Pad Slicing</div>
                            </div>
                        </div>
                    )}

                    {/* Lens 3: Lyric Dictation */}
                    {activeLens === 'lyrics' && (
                        <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px', fontSize: '11px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>VOICE ACTIVITY & SUBTITLE ALIGNMENT</span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={() => startDictation(txt => {
                                        const nowSec = 0.0;
                                        setScanData(prev => ({
                                            ...prev,
                                            lyrics: {
                                                words: [...((prev && prev.lyrics && prev.lyrics.words) || []), { start: nowSec, text: txt }]
                                            }
                                        }));
                                    })} style={{ background: isDictating ? '#ff5252' : '#333', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>
                                        {isDictating ? '🎙️ Listening…' : '🎤 Dictate Lyric Line'}
                                    </button>
                                    <button onClick={() => {
                                        if (lyricWords.length) speakText(lyricWords.map(w => w.text).join(' '));
                                    }} style={{ background: '#2a2f38', color: '#7dff4a', border: '1px solid #444', borderRadius: '3px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>
                                        🔊 Read Aloud Lyrics
                                    </button>
                                </div>
                            </div>
                            <div>Vocal Phrasing Detected: {lyricWords.length} Word Timestamps</div>
                            <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '6px', background: '#0d0e12', padding: '6px', borderRadius: '3px' }}>
                                {lyricWords.length === 0
                                    ? <span style={{ color: '#777' }}>Nothing has transcribed this file — the deep scanner runs no recogniser. Dictate a line, or import an .LRC.</span>
                                    : lyricWords.map((w, i) => (
                                        <span key={i} style={{ display: 'inline-block', marginRight: '8px', color: '#cde' }}>
                                            [{w.start.toFixed(2)}s] {w.text}
                                        </span>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Lens 4: EBU R128 Loudness */}
                    {activeLens === 'loudness' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '11px' }}>
                            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                                <div style={{ color: '#aaa' }}>INTEGRATED LOUDNESS</div>
                                <div style={{ fontSize: '20px', color: !measured(loudness.integratedLUFS) ? '#666' : (loudness.integratedLUFS > -14 ? '#ff5252' : '#7dff4a'), fontWeight: 'bold' }}>
                                    {num(loudness.integratedLUFS, 2)} LUFS
                                </div>
                                <div>EBU R128 Target: -23 LUFS</div>
                                {!measured(loudness.integratedLUFS) && <div style={{ color: '#777', marginTop: '4px' }}>No 400 ms block cleared the −70 LUFS absolute gate.</div>}
                            </div>
                            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                                <div style={{ color: '#aaa' }}>MAX TRUE PEAK</div>
                                <div style={{ fontSize: '20px', color: measured(loudness.maxTruePeakdBTP) ? '#ffb74d' : '#666', fontWeight: 'bold' }}>{num(loudness.maxTruePeakdBTP, 2)} dBTP</div>
                                <div>Ceiling: -1.0 dBTP</div>
                                {!measured(loudness.maxTruePeakdBTP) && <div style={{ color: '#777', marginTop: '4px' }}>Digital silence — its true peak is −∞ dB, which is not a reading.</div>}
                            </div>
                            <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px' }}>
                                <div style={{ color: '#aaa' }}>LOUDNESS RANGE (LRA)</div>
                                <div style={{ fontSize: '20px', color: measured(loudness.lraLU) ? '#42a5f5' : '#666', fontWeight: 'bold' }}>{num(loudness.lraLU, 2)} LU</div>
                                <div>Dynamic Range Window</div>
                                {!measured(loudness.lraLU) && <div style={{ color: '#777', marginTop: '4px' }}>A range needs 3 s of gated short-term blocks; this buffer has none.</div>}
                            </div>
                        </div>
                    )}

                    {/* Lens 5: AES Preservation */}
                    {activeLens === 'archival' && (
                        <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px', fontSize: '11px' }}>
                            <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '6px' }}>AES SC-03-06 ARCHIVAL PRESERVATION METADATA</div>
                            <div>BWF bext Version: 2 (EBU Tech 3285)</div>
                            <div style={{ wordBreak: 'break-all' }}>
                                SHA-256 of the decoded PCM:{' '}
                                <span style={{ color: scanData.pcm_sha256 ? '#7dff4a' : '#777' }}>
                                    {scanData.pcm_sha256 || NOT_MEASURED}
                                </span>
                            </div>
                            {/* The constant that used to stand here — e3b0c442…b855 — is the
                                SHA-256 of the EMPTY STRING, printed under a preservation
                                heading as though it were this file's checksum (PLAN-601.01).
                                This page holds an AudioBuffer and not the bytes it was decoded
                                from, so the file's own digest is a thing it cannot compute;
                                what it can hash is the samples, and the label says which. */}
                            <div style={{ color: '#777', marginTop: '4px' }}>
                                This identifies the AUDIO, not the container — two encodes of one take agree here and differ on disk.
                                {!scanData.pcm_sha256 && ' Unavailable: crypto.subtle is absent on an insecure origin.'}
                            </div>
                            <div>Sample-Accurate Time Reference: 0 samples since midnight</div>
                        </div>
                    )}

                    {/* Lens 6: AES69 3D Spatial */}
                    {activeLens === 'spatial' && (
                        <div style={{ background: '#181b22', padding: '10px', borderRadius: '4px', fontSize: '11px' }}>
                            <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '6px' }}>AES69 / SOFA 3D SPATIAL AUDIO METADATA</div>
                            {/* EM DASHES, NOT `0.0° | 0.0° | 1.0 m`. This lens
                                drew three literals typed into the JSX — not
                                even read back from the export — so it presented
                                a placement as though it had come off the file.
                                It says which gate was not cleared instead, the
                                way every unmeasured scalar in this view does.
                                PLAN-908.01. */}
                            <div>Azimuth (Φ): — | Elevation (Θ): — | Distance (r): —</div>
                            <div style={{ color: '#7a8494', marginTop: '4px' }}>
                                No placement was measured: nothing in this view offers a position
                                control, and a decoded AudioBuffer carries no SOFA source. The
                                sidecar writes these three as <code>null</code>.
                            </div>
                            <div style={{ marginTop: '4px' }}>Spatial Format: AES69 SOFA HRTF / EBU ADM (Tech 3364)</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
