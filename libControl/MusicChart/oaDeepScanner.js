// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MUSIC CHART DEEP SCANNER
 *
 * Chunks songs up into structural sections (Verse, Chorus, Bridge), detects local
 * key changes, root notes and chord progressions (triads / 7ths) from a
 * chromagram, and lays evenly spaced cue points inside each vocal-bearing
 * section.
 *
 * THERE IS NO LYRIC EXTRACTION HERE, AND `lyrics` IS ALWAYS EMPTY. Nothing in
 * this file reads speech: there is no VAD, no recogniser, and no dependency
 * that could be one. The header said otherwise until PLAN-570.01, and the
 * section that filled `lyrics` divided each Verse/Chorus into nine and pushed
 * eight rows whose `word` was `[Vocal Word <n>]` — a counter, drawn in the
 * Lyrics tab under a heading claiming the vocal had been aligned. Those rows
 * survive as `vocal_section_cues`, which is what they always were: arithmetic
 * on a section boundary, useful as seek points and nothing else. If a
 * recogniser is ever added, it fills `lyrics`; it does not relabel these.
 *
 * WHAT `oaDeepScanAudio` RETURNS IS A CONTRACT, and it is stated here because
 * for its whole life it was not. `LensesView` read `musicality.pitchHz`,
 * `loudness.integratedLUFS`, `beatMarkers`, `lyrics.words` and a checksum off
 * this return value; not one of those keys was ever in it, so two of the six
 * lens tabs threw on open and one of the three exports threw on click
 * (PLAN-601.01). The keys are:
 *
 *     duration_seconds, sample_rate      the buffer, restated
 *     sections, chords, notes, total_chords   the chunker and the chromagram
 *     vocal_section_cues                 arithmetic seek points, see above
 *     lyrics: { words: [] }              ALWAYS EMPTY. An OBJECT, not an array,
 *                                        because dictation and .LRC import both
 *                                        write `{ words }` and a field that is
 *                                        an array from one writer and an object
 *                                        from another is the defect itself.
 *     musicality: { key, keyConfidence, pitchHz, centsOffset, bpm }
 *     loudness:   { integratedLUFS, maxTruePeakdBTP, lraLU, gatingThresholdLUFS }
 *     beatMarkers: [{ timestamp_seconds, strength }]
 *     pcm_sha256                         the DECODED SAMPLES, not the file
 *
 * ANY SCALAR IN THOSE THREE OBJECTS MAY BE `null`, and a reader must draw that
 * as an absence rather than as a number. A 400 ms loudness block does not exist
 * in a 200 ms buffer and silence has no key; `oaScanMeasure.js` refuses rather
 * than substituting, and its header carries the doctrine. `beatMarkers` is an
 * array and is empty rather than null, because a buffer with no transient in it
 * genuinely has no onsets.
 *
 * `oaDeepScanAudio` YIELDS TO THE EVENT LOOP MID-SCAN, so a caller must await
 * it and must not assume the page is unchanged across the call. It surrenders
 * the thread every `window.OA_SCAN_YIELD_FRAMES` sounding frames — about 45
 * times over a three-minute track — because the whole scan used to run as one
 * uninterrupted block and the drop handler's progress line could not paint.
 * Two scans may therefore interleave; nothing here holds state between frames
 * that is not local to the call.
 *
 * AND IT SAYS WHERE IT IS. `oaDeepScanAudio(buffer, onProgress)` calls the
 * optional second argument with `{ frame, totalFrames }` at each yield and
 * never between them, so the report rate is bounded by OA_SCAN_YIELD_FRAMES
 * rather than by the frame rate. It stayed optional because the suite calls
 * this function with one argument in more than a dozen places, and because one
 * of the three call sites has nowhere to put the number. PLAN-801.03; the yield
 * itself was PLAN-801.01, which shipped the yield alone on purpose — a progress
 * callback with no consumer is dead surface — and the surfaces asked afterwards.
 *
 * FRAMES, NOT A PERCENTAGE, and that is the one thing a reader must not
 * "improve". `totalFrames` counts every frame in the buffer; the loop SKIPS
 * every frame under 0.01 RMS, so a track with a quiet ending reports its last
 * progress well short of `totalFrames` and a bar drawn from `frame/totalFrames`
 * would appear to stall at 80% on a perfectly healthy scan. Two numbers that
 * are moving say "working" honestly; one number that is a fraction of a
 * denominator it can never reach does not.
 *
 * WHO READS IT:
 *   · `MusicChart/LensesView.jsx`   — yes; the auto-scan line under the tabs.
 *   · `MusicChart/MusicChartOverlay.jsx` — yes; the Deep Scan button's label.
 *   · `App/App.jsx`                 — NO, deliberately. The global drop handler
 *     has no element of its own: it logs to the console and then hands the
 *     buffer to the chopper, and the panels above are what the visitor is
 *     looking at while it runs. A `console.log` forty-five times a scan is
 *     noise in the one surface an operator debugs with.
 */

window.NOTE_NAMES_12 = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Sounding frames between the yields `oaDeepScanAudio` makes to the event loop.
// It is a FRAME COUNT and not a millisecond budget on purpose: a wall-clock
// budget is untestable here, because the harness's `performance.now()` is
// pinned at 0, and a knob that cannot be exercised by the suite is a knob the
// suite cannot tell has stopped working.
window.OA_SCAN_YIELD_FRAMES = 16;

// 24 Standard Major & Minor Triad Chromagram Templates
window.CHORD_TEMPLATES = (function() {
    const templates = [];
    for (let root = 0; root < 12; root++) {
        const rootName = window.NOTE_NAMES_12[root];
        
        // Major Triad (root, +4, +7)
        const maj = new Float32Array(12);
        maj[root] = 1.0;
        maj[(root + 4) % 12] = 0.8;
        maj[(root + 7) % 12] = 0.8;
        templates.push({ name: `${rootName}maj`, root, type: 'major', vector: maj });
        
        // Minor Triad (root, +3, +7)
        const min = new Float32Array(12);
        min[root] = 1.0;
        min[(root + 3) % 12] = 0.8;
        min[(root + 7) % 12] = 0.8;
        templates.push({ name: `${rootName}m`, root, type: 'minor', vector: min });

        // Dominant 7th (root, +4, +7, +10)
        const dom7 = new Float32Array(12);
        dom7[root] = 1.0;
        dom7[(root + 4) % 12] = 0.7;
        dom7[(root + 7) % 12] = 0.7;
        dom7[(root + 10) % 12] = 0.6;
        templates.push({ name: `${rootName}7`, root, type: 'dom7', vector: dom7 });
    }
    return templates;
})();

/**
 * Compute 12-bin chromagram from PCM audio frame.
 *
 * THE SAME NUMBER AS THE NAIVE DFT, BY A GOERTZEL FILTER. Each of the 49
 * semitone bins from C2 to C6 is one second-order resonator run over the frame:
 * s[i] = x[i] + 2cos(w)s[i-1] - s[i-2], whose squared output magnitude
 * s1^2 + s2^2 - 2cos(w)s1s2 is the DFT term at w up to a unit-modulus phase
 * factor the magnitude discards. So this is an identical result, not an
 * approximation of one, and `chroma.fixture.json` holds it to that.
 *
 * WHAT IT REPLACED, AND WHY. The previous form evaluated
 * `Math.cos`, `Math.sin` AND a Hann `Math.cos` inside the innermost loop —
 * three transcendentals per sample per bin, 49 x 24,000 = 3.5 million of them
 * per frame at 48 kHz. `oaDeepScanAudio` calls this every 250 ms of sounding
 * audio, so a three-minute song cost 17.7 s of blocked main thread and every
 * other measurement in the scan together cost 0.2 s (PLAN-801.01). The
 * recurrence has one multiply and two adds per sample per bin and no
 * transcendental at all: measured 21.6 ms -> 1.8 ms per frame, 11.9x.
 *
 * THE WINDOW IS HOISTED, AND THAT IS HALF OF IT. The Hann coefficient depends
 * only on `n`, which does not change across a scan, yet it was recomputed once
 * per bin — 49 times over for every sample. It is now built once per frame
 * LENGTH and the frame is windowed once, into scratch buffers kept between
 * calls. That scratch is safe under the interleaving `oaDeepScanAudio`'s yield
 * introduces because it is written and read entirely within this one
 * synchronous call.
 *
 * DO NOT SHORTEN THE FRAME TO BUY SPEED. The 500 ms window and 250 ms hop are
 * the resolution the section chunker and the chord timeline are drawn at;
 * shortening them changes the answer rather than the cost of getting it.
 */
window.oaComputeFrameChroma = (function() {
    // Kept between calls rather than allocated per frame: 718 frames of a
    // three-minute track is 718 pairs of 24,000-element arrays otherwise.
    let hannN = -1;
    let hann = null;
    let windowed = null;

    return function(data, sampleRate) {
        const chroma = new Float32Array(12);
        if (!data || data.length < 512) return chroma;

        const n = data.length;
        if (n !== hannN) {
            hannN = n;
            hann = new Float64Array(n);
            windowed = new Float64Array(n);
            for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
        }
        for (let i = 0; i < n; i++) windowed[i] = data[i] * hann[i];

        // Goertzel over octave frequencies (C2=65.4Hz to C6=1046.5Hz)
        for (let midi = 36; midi <= 84; midi++) {
            const freq = 440 * Math.pow(2, (midi - 69) / 12);
            const omega = 2 * Math.PI * freq / sampleRate;
            const coeff = 2 * Math.cos(omega);
            let s1 = 0, s2 = 0;
            for (let i = 0; i < n; i++) {
                const s0 = windowed[i] + coeff * s1 - s2;
                s2 = s1;
                s1 = s0;
            }
            // Clamped at zero: the closed form is a difference of large
            // products and rounding can put a genuinely silent bin a hair
            // below it, which Math.sqrt would answer with NaN.
            const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
            chroma[midi % 12] += Math.sqrt(power > 0 ? power : 0);
        }

        // Normalize chroma
        let maxVal = 0;
        for (let i = 0; i < 12; i++) if (chroma[i] > maxVal) maxVal = chroma[i];
        if (maxVal > 0) {
            for (let i = 0; i < 12; i++) chroma[i] /= maxVal;
        }
        return chroma;
    };
})();

/**
 * Match a 12-bin chroma vector against chord templates
 */
window.oaMatchChord = function(chroma) {
    let bestMatch = window.CHORD_TEMPLATES[0];
    let maxSim = -1;
    
    for (let i = 0; i < window.CHORD_TEMPLATES.length; i++) {
        const tmpl = window.CHORD_TEMPLATES[i];
        let dot = 0, normA = 0, normB = 0;
        for (let k = 0; k < 12; k++) {
            dot += chroma[k] * tmpl.vector[k];
            normA += chroma[k] * chroma[k];
            normB += tmpl.vector[k] * tmpl.vector[k];
        }
        const sim = (normA > 0 && normB > 0) ? (dot / (Math.sqrt(normA) * Math.sqrt(normB))) : 0;
        if (sim > maxSim) {
            maxSim = sim;
            bestMatch = tmpl;
        }
    }
    return { chord: bestMatch.name, root: bestMatch.root, confidence: Math.round(maxSim * 100) / 100 };
};

/**
 * Deep Scan an AudioBuffer to extract:
 * 1. Structural song chunks (Intro, Verse, Chorus, Bridge, Outro)
 * 2. Key changes & local chord progression timeline
 * 3. Note root contour
 * 4. Evenly spaced cue points inside each Verse / Chorus section
 *
 * `lyrics` is in the return value and is always `[]` — see the file header.
 */
window.oaDeepScanAudio = async function(audioBuffer, onProgress) {
    if (!audioBuffer) return null;

    // TYPE-CHECKED RATHER THAN TRUTH-CHECKED. The parameter in this position
    // used to be `peakData`, which no line of this function ever read — a dead
    // parameter, and every caller in the tree passed one argument. Anything
    // that still hands an object across is therefore ignored exactly as it was
    // before, instead of being called.
    const report = typeof onProgress === 'function' ? onProgress : null;
    
    const sr = audioBuffer.sampleRate;
    const dur = audioBuffer.duration;
    const pcm = audioBuffer.getChannelData(0);
    
    const windowSize = Math.floor(sr * 0.5); // 500ms windows
    const hopSize = Math.floor(sr * 0.25);   // 250ms hop
    const totalFrames = Math.floor((pcm.length - windowSize) / hopSize);
    
    const chords = [];
    const keys = [];
    const notes = [];
    let prevChord = "";
    // Summed across every SOUNDING frame, then handed to the key estimator. The
    // per-frame chroma is already paid for by the chord matcher below; a second
    // pass over the audio to find the key would be the same DFT twice.
    const chromaSum = new Float64Array(12);

    // THE SCAN GIVES THE TAB THE EVENT LOOP BACK, and that is a separate fix
    // from making the arithmetic cheaper — both were wanted and PLAN-801.01
    // did both. A frame of the chromagram is ~1.8 ms at 48 kHz, so yielding
    // every 16 SOUNDING frames bounds one uninterrupted block at about 30 ms
    // and a three-minute track surrenders the thread roughly 45 times. That is
    // what lets the "⚡ Extracting 6-lens metadata" line the drop handler shows
    // actually paint; before, it could not, because nothing between the drop
    // and the return ever reached the event loop.
    //
    // A silent frame never gets here — it is skipped above — so a scan of
    // silence still costs no timers at all.
    let sinceYield = 0;

    for (let f = 0; f < totalFrames; f++) {
        const startSample = f * hopSize;
        const frameData = pcm.subarray(startSample, startSample + windowSize);
        const tSec = startSample / sr;
        
        // Calculate frame energy
        let sumSq = 0;
        for (let i = 0; i < frameData.length; i++) sumSq += frameData[i] * frameData[i];
        const rms = Math.sqrt(sumSq / frameData.length);
        if (rms < 0.01) continue; // Skip quiet frames
        
        if (++sinceYield >= window.OA_SCAN_YIELD_FRAMES) {
            sinceYield = 0;
            // BEFORE the yield, not after: the point of the yield is to let a
            // repaint happen, and the repaint should draw the number this pass
            // reached rather than the one from the pass before it.
            if (report) report({ frame: f, totalFrames });
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const chroma = window.oaComputeFrameChroma(frameData, sr);
        for (let k = 0; k < 12; k++) chromaSum[k] += chroma[k];
        const match = window.oaMatchChord(chroma);
        
        if (match.chord !== prevChord) {
            chords.push({
                timestamp_seconds: Math.round(tSec * 1000) / 1000,
                chord: match.chord,
                confidence: match.confidence,
                root_note: window.NOTE_NAMES_12[match.root]
            });
            prevChord = match.chord;
        }
        
        notes.push({
            timestamp_seconds: Math.round(tSec * 1000) / 1000,
            root_note: window.NOTE_NAMES_12[match.root],
            energy: Math.round(rms * 1000) / 1000
        });
    }
    
    // 2. Song Structural Chunking (Intro, Verse, Chorus, Bridge, Outro)
    const sections = [];
    const numSections = Math.max(3, Math.min(8, Math.floor(dur / 15)));
    const sectionDur = dur / numSections;
    
    const sectionNames = ["Intro", "Verse 1", "Chorus 1", "Verse 2", "Chorus 2", "Bridge", "Solo", "Outro"];
    for (let i = 0; i < numSections; i++) {
        const st = i * sectionDur;
        const et = Math.min(dur, (i + 1) * sectionDur);
        const label = sectionNames[i % sectionNames.length];
        
        // Pick dominant chord in this section
        const secChords = chords.filter(c => c.timestamp_seconds >= st && c.timestamp_seconds < et);
        const domChord = secChords.length > 0 ? secChords[0].chord : "Cmaj";
        
        sections.push({
            index: i,
            label,
            start_seconds: Math.round(st * 1000) / 1000,
            end_seconds: Math.round(et * 1000) / 1000,
            duration_seconds: Math.round((et - st) * 1000) / 1000,
            key_center: domChord
        });
    }
    
    // 3. Cue points inside the vocal-bearing sections
    //
    // NOT WORDS. Each Verse / Chorus is divided into nine and the eight interior
    // boundaries become cue points, so the surface has somewhere to seek to
    // inside a section. No audio is read to place them — the timestamp is
    // arithmetic on the section the chunker already drew, and `label` says so.
    const vocalSectionCues = [];
    const CUES_PER_SECTION = 8;
    
    for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        if (sec.label.includes("Verse") || sec.label.includes("Chorus")) {
            const cueDur = sec.duration_seconds / (CUES_PER_SECTION + 1);
            for (let c = 0; c < CUES_PER_SECTION; c++) {
                const cst = sec.start_seconds + (c + 1) * cueDur;
                vocalSectionCues.push({
                    index: vocalSectionCues.length,
                    timestamp_seconds: Math.round(cst * 1000) / 1000,
                    duration_seconds: Math.round((cueDur * 0.7) * 1000) / 1000,
                    section: sec.label,
                    label: `${sec.label} · cue ${c + 1}/${CUES_PER_SECTION}`
                });
            }
        }
    }
    
    // 4. The measurements the surfaces have always read and this has never
    //    returned. Each of these refuses rather than guessing — see the
    //    contract in this file's header and the doctrine in oaScanMeasure.js.
    const loudness = window.oaMeasureLoudnessR128(pcm, sr);
    const onsets = window.oaDetectOnsets(pcm, sr);
    const keyEstimate = window.oaEstimateKey(chromaSum);
    const pitch = window.oaEstimatePitch(pcm, sr);
    const pcmSha256 = await window.oaPcmSha256(pcm);

    return {
        duration_seconds: Math.round(dur * 1000) / 1000,
        sample_rate: sr,
        total_chords: chords.length,
        sections,
        chords,
        notes,
        vocal_section_cues: vocalSectionCues,
        musicality: {
            key: keyEstimate ? keyEstimate.key : null,
            keyConfidence: keyEstimate ? keyEstimate.confidence : null,
            pitchHz: pitch ? pitch.pitchHz : null,
            centsOffset: pitch ? pitch.centsOffset : null,
            bpm: onsets.bpm
        },
        loudness,
        beatMarkers: onsets.beatMarkers,
        pcm_sha256: pcmSha256,
        // Empty, always — an object rather than a bare array so that the one
        // shape survives every writer. `[]` was what the scanner returned while
        // dictation and .LRC import both wrote `{ words }` into the same field,
        // and `[].words` is `undefined`, which is how the .LRC export became a
        // button that did nothing at all (PLAN-601.01). The day a recogniser
        // lands, `words` is where it writes.
        lyrics: { words: [] }
    };
};

/**
 * Automatically chop/slice a long song/track into 16 triggerable sample pads.
 */
window.oaChopSongToPads = function(buffer, filename, chartOrMapData) {
    if (!buffer) return 0;
    
    const count = window.OA_PAD_COUNT || 16;
    let chunks = [];
    
    if (chartOrMapData && chartOrMapData.chunk_maps && chartOrMapData.chunk_maps.length > 0) {
        chunks = chartOrMapData.chunk_maps;
    } else if (chartOrMapData && chartOrMapData.sections && chartOrMapData.sections.length > 0) {
        chunks = chartOrMapData.sections.map((s, idx) => ({
            chunk_index: idx,
            start_seconds: s.start_seconds,
            end_seconds: s.end_seconds,
            root_note_name: s.key_center
        }));
    } else {
        // Equal region division fallback
        const dur = buffer.duration;
        const sliceDur = dur / Math.min(count, 16);
        for (let i = 0; i < Math.min(count, 16); i++) {
            chunks.push({
                chunk_index: i,
                start_seconds: i * sliceDur,
                end_seconds: Math.min(dur, (i + 1) * sliceDur),
                root_note_name: `Slice ${i + 1}`
            });
        }
    }
    
    let loadedCount = 0;
    const padCountToFill = Math.min(count, chunks.length);
    
    for (let i = 0; i < padCountToFill; i++) {
        const c = chunks[i];
        // The container list, not "everything after the last dot" — `Kick 90.5
        // Loop` was labelled `Kick 90` on all sixteen pads (PLAN-602.01). The
        // `Track` fallback stays in front of it: an absent name is not a name
        // with nothing to strip.
        const padName = `${filename ? window.oaWithoutContainer(filename) : "Track"} — ${c.root_note_name || ("Slice " + (i + 1))}`;
        
        window.oaSetDrumSample(i, buffer, {
            name: padName,
            folder: 'Downloads',
            offset: c.start_seconds,
            end: c.end_seconds,
            fadeIn: 0.005,
            fadeOut: 0.005
        });
        
        loadedCount++;
        window.dispatchEvent(new CustomEvent('oa-sample-changed', { detail: { idx: i } }));
    }
    
    console.log(`[+] Auto-chopped song into ${loadedCount} pads!`);
    return loadedCount;
};

/**
 * The pad-facing view of a `.PEAK` sidecar OR of a scan return — ONE shape,
 * built from four documents that spell the same measurements four ways.
 *
 * THE DROP HANDLERS READ ONE FORMAT AND ARE HANDED FOUR. `App.jsx` fills its
 * `peakData` from a dropped sidecar or, when none was dropped, from
 * `oaDeepScanAudio(buffer)` above — and those are not the same document:
 *
 *     this scan             `beatMarkers` (camel), `musicality.{key,bpm}`, `sections`
 *     LensesView's .PEAK    `beat_markers` (snake), `musicality.{key,bpm}`
 *     extract_note_root_beat_map.py's .PEAK
 *                           `musicality.note_root_key_beat_marker_map` — NESTED,
 *                           which is why reading it off the top level found
 *                           nothing, and ELEVEN keys wide.
 *     the ANALYZER's .PEAK  the same nested map from `note_map.rs`, but SIX keys
 *                           wide. This is the one PLAN-800.01 did not know about,
 *                           and it is the one the library is made of: 164 of the
 *                           346 records in the 147 tracked `.PEAK` carry it.
 *                           `analyzerPeakSchema.json` types it.
 *
 * `SamplerEditor` reads `entry.noteMap.{global_root_note, global_bpm,
 * total_beats, total_chunks, beat_markers, chunk_maps}` and hands the last two
 * to `WaveTrim`. The handlers used to assign `musicality` whenever the map key
 * was absent — which was always — and `musicality` has NONE of those six, so
 * the panel drew `KEY: undefined · undefined BPM · undefined BEATS` over every
 * scanned song and the waveform drew no onset ticks at all (PLAN-800.01).
 *
 * THE EMBEDDED MAP IS COMPLETED, NOT PASSED THROUGH. `total_chunks` is in the
 * Python CLI's map and is NOT in `peak::NoteRootKeyBeatMarkerMap`, so handing
 * the analyzer's map through verbatim drew `undefined note chunks detected`
 * over every sample in the bundled library — the PLAN-800.01 defect surviving
 * in the one document that plan did not enumerate. It is derived from
 * `chunk_maps.length`, which is where the Python CLI gets it too, so this is
 * the SAME number and not a substitute for a missing one (PLAN-907.01).
 *
 * NOTHING IS INVENTED. An unmeasured field is `null`, `chunk_maps` is `[]`
 * rather than a guess, and a document with no markers, no sections, no key and
 * no tempo yields `noteMap: null` — no panel, which is the truthful render.
 * Same doctrine as `oaScanMeasure.js`: refuse rather than substitute.
 */
window.oaPadMetaFromPeak = function(peakData) {
    if (!peakData || typeof peakData !== 'object') return null;

    const musicality = peakData.musicality || {};

    // The embedded map is already the shape the editor reads, so it is used as
    // it stands rather than rebuilt from its own parts — with the one key the
    // Rust writer does not emit derived from the array it counts. `??` and not
    // `||`: a genuine zero-chunk map must read as 0, not fall through to a
    // recount that also says 0 but for the wrong reason.
    const embedded = musicality.note_root_key_beat_marker_map;
    if (embedded && typeof embedded === 'object') {
        const chunkMaps = Array.isArray(embedded.chunk_maps) ? embedded.chunk_maps : [];
        const noteMap = embedded.total_chunks === undefined
            ? { ...embedded, total_chunks: chunkMaps.length }
            : embedded;
        return { noteMap, chartData: peakData };
    }

    // Both spellings carry `timestamp_seconds`, which is the only field
    // `WaveTrim` draws — so the two arrays are interchangeable to the reader
    // and only the KEY they arrive under differs.
    const beatMarkers = Array.isArray(peakData.beat_markers) ? peakData.beat_markers
        : Array.isArray(peakData.beatMarkers) ? peakData.beatMarkers
        : [];

    // The chopper's own section->chunk mapping, so the editor's Chop buttons
    // land on the same boundaries `oaChopSongToPads` gave the sixteen pads.
    const sections = Array.isArray(peakData.sections) ? peakData.sections : [];
    const chunkMaps = sections.map((s, i) => ({
        chunk_index: i,
        start_seconds: s.start_seconds,
        end_seconds: s.end_seconds,
        root_note_name: s.key_center
    }));

    // `key`/`bpm` is the scan and LensesView's sidecar; `root_note_name`/
    // `beats_per_minute` is the Python sidecar's flat `musicality` block, which
    // is what a file written before the map was embedded looks like.
    const rootNote = musicality.key || musicality.root_note_name || null;
    const bpm = typeof musicality.bpm === 'number' ? musicality.bpm
        : typeof musicality.beats_per_minute === 'number' ? musicality.beats_per_minute
        : null;

    if (!beatMarkers.length && !chunkMaps.length && rootNote === null && bpm === null) {
        return { noteMap: null, chartData: peakData };
    }

    return {
        noteMap: {
            global_root_note: rootNote,
            global_bpm: bpm,
            total_beats: beatMarkers.length,
            total_chunks: chunkMaps.length,
            beat_markers: beatMarkers,
            chunk_maps: chunkMaps
        },
        chartData: peakData
    };
};

/**
 * Attach a dropped sidecar or a fresh scan to one pad, and return what was
 * attached (`null` when there was nothing to attach).
 *
 * THE THREE DROP TARGETS SHARE THIS ONE BODY ON PURPOSE. `App.jsx` has two —
 * a file dropped with audio and a sidecar dropped alone — and `Pad.jsx` has a
 * third on the pad itself; all three carried the same three assignment lines,
 * so the format bug above existed in triplicate and a fix to one of them would
 * have been the mirror-bug family this tree already has four plans about.
 *
 * `beatMarkers` IS DELIBERATELY NOT WRITTEN ONTO THE ENTRY. All three sites
 * used to set `entry.beatMarkers`, and nothing in this app has ever read it —
 * `SamplerEditor` takes its markers from `entry.noteMap.beat_markers`. It was
 * a write-only field, and on the auto-scan path the value written was
 * `undefined` besides.
 */
window.oaApplyPeakToPad = function(idx, peakData) {
    const meta = window.oaPadMetaFromPeak(peakData);
    const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[idx];
    if (!meta || !entry) return null;
    entry.noteMap = meta.noteMap;
    entry.chartData = meta.chartData;
    return meta;
};
