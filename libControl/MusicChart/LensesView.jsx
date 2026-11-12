// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

window.LensesView = ({ audioBuffer, filename, padIdx }) => {
    // The PEAK document reader lives in oaPeakDocument.js; read at render time.
    const {
        NOT_MEASURED, PEAK_LOUDNESS_KEYS, PEAK_MUSICALITY_KEYS, fromSidecarGroup,
        identifyPeakDocument, measured, num, toSidecarGroup, withoutContainer,
    } = window.oaPeakDocument;
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
            // The live accent (oaTheme.js), so the theme picker reaches the canvas too.
            ctx.strokeStyle = window.oaAccent();
            ctx.lineWidth = 2;
            ctx.beginPath();
            const normPitchY = midY - (Math.log2(hz / 110) * 15);
            ctx.moveTo(0, normPitchY);
            ctx.lineTo(width, normPitchY);
            ctx.stroke();

            // Pitch label
            ctx.fillStyle = window.oaAccent();
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
    // LUFS TRAJECTORY typed by `Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/src/perfSchema.json`.
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
    // `Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/src/lensPerfExportSchema.json` does, beside it and beside
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
            if (window.APKSoftapp) window.APKSoftapp.showProblem('unsupported_browser', {
                subject: 'Talk to Type', detail: 'this browser has no speech recognition',
                fix: ['Type the text directly, or use Chrome / Edge, which have speech recognition.'] });
            else alert("Speech recognition is not supported in this browser. Please type directly.");
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
        recognition.onerror = (ev) => {
            setIsDictating(false);
            // 'no-speech' and 'aborted' are a quiet room or a second press, not a fault.
            const why = ev && ev.error;
            if (!window.APKSoftapp || why === 'no-speech' || why === 'aborted') return;
            window.APKSoftapp.showProblem(why === 'not-allowed' || why === 'service-not-allowed' ? 'permission_denied'
                : why === 'audio-capture' ? 'device_busy' : why === 'network' ? 'fetch_failed' : 'script_error', {
                subject: 'Talk to Type', detail: `speech recognition error '${why}'`,
                fix: ['Allow the microphone for this page, check the input is plugged in, then press the mic button again.'] });
        };
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
                if (window.APKSoftapp) window.APKSoftapp.showProblem('bad_json', {
                    subject: file.name, detail: 'could not parse it: ' + String((err && err.message) || err),
                    fix: ['Import a .PEAK or .json sidecar the analyzer wrote, or an .lrc lyric file.'] });
                else alert("Could not parse imported metadata file.");
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
    // `sample_analyzer_rs` and read by `Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/src/peakSchema.ts` —
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

    // What the six lens bodies in LensesPanels.jsx read, handed over as one
    // object. They are plain functions called where their markup sits.
    const lv = {
        NOT_MEASURED, beatMarkers, creatorId, filename, fname, isDictating, loudness, lyricWords,
        measured, musicality, num, scanData, sections, setCreatorId, setScanData, setSourceId,
        setUcsCatKey, sourceId, speakText, startDictation, ucsCatKey, withoutContainer,
    };

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
                    {activeLens === 'taxonomy' && window.oaLensTaxonomy(lv)}

                    {/* Lens 2: Pitch & Beats */}
                    {activeLens === 'musicality' && window.oaLensMusicality(lv)}

                    {/* Lens 3: Lyric Dictation */}
                    {activeLens === 'lyrics' && window.oaLensLyrics(lv)}

                    {/* Lens 4: EBU R128 Loudness */}
                    {activeLens === 'loudness' && window.oaLensLoudness(lv)}

                    {/* Lens 5: AES Preservation */}
                    {activeLens === 'archival' && window.oaLensArchival(lv)}

                    {/* Lens 6: AES69 3D Spatial */}
                    {activeLens === 'spatial' && window.oaLensSpatial(lv)}
                </div>
            )}
        </div>
    );
};
