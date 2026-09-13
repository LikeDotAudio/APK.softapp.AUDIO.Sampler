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

// The filename stamp is oaStamp() in oaSongFile.js — one implementation, so a
// rendered take and a saved pattern cannot disagree about what time it is.
window.useSeqRenderer = (pattern, steps, mutes, bpm, safeLabel) => {
    const [rendering, setRendering] = React.useState(false);
    const velOf = (c) => (typeof c === 'number' ? c : (c ? 100 : 0));

    // How many times the pattern is laid down. One for a single loop to drop
    // into a DAW, eight for something long enough to play against.
    const renderLoop = async (loops = 1) => {
        const LOOPS = Math.max(1, loops | 0);
        setRendering(true);
        try {
            const secPerStep = 0.25 * 60 / (bpm || 120);   // 16th note
            const totalSteps = steps * LOOPS;
            const dur = totalSteps * secPerStep;
            // The app's rate — the bounce has to print the same tape head
            // spacing and reverb tail the user was monitoring.
            const rate = window.oaSampleRate();
            const tailSec = 2.0;
            const offline = window.oaOfflineContext(2, dur + tailSec, rate);
            const TRACKS = window.OA_DRUM_KIT || [];

            // Reverbs and tape delays print with the pattern. The tape worklet
            // has to be registered on THIS context before any voice asks for a
            // send, because scheduling and rendering happen in one tick.
            if (window.oaWarmFx) { try { await window.oaWarmFx(offline); } catch (e) {} }

            for (let step = 0; step < totalSteps; step++) {
                const t = step * secPerStep;
                pattern.forEach((track, trkIdx) => {
                    const v = velOf(track[step % steps]);
                    if (v > 0 && !mutes[trkIdx]) {
                        const vol = v / 100;
                        const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[trkIdx];
                        if (entry && entry.buffer && window.oaPlayDrumSample) window.oaPlayDrumSample(offline, Object.assign({}, entry, { loop: false }), t, vol);
                        else if (window.oaPlayDrumVoice) window.oaPlayDrumVoice(offline, { idx: trkIdx }, t, vol);
                    }
                });
            }
            const rendered = await offline.startRendering();
            const loopLen = Math.max(1, Math.round(dur * rate));
            const loopBuf = window.oaAudioCtx().createBuffer(2, loopLen, rate);
            for (let ch = 0; ch < 2; ch++) {
                const src = rendered.getChannelData(ch);
                const dst = loopBuf.getChannelData(ch);
                for (let i = 0; i < loopLen; i++) dst[i] = src[i] || 0;
                for (let j = 0; j + loopLen < src.length && j < loopLen; j++) dst[j] += src[loopLen + j]; // wrap tail
            }
            const blob = new Blob([window.oaEncodeWavFromBuffer(loopBuf)], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            // Stamped here rather than at the top of the render, so the name
            // agrees with the file's own modified time once it is on disk.
            a.href = url;
            a.download = `${window.oaStamp()} Loop that is ${bpm || 120} bpm.wav`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e) { console.error('🛑 [Sequencer] render failed:', e); }
        setRendering(false);
    };

    // Render individual stems (isolated tracks with Compression and Distortion, but NO Reverb/Tape FX)
    const renderStems = async (loops = 1) => {
        const LOOPS = Math.max(1, loops | 0);
        setRendering(true);
        try {
            const secPerStep = 0.25 * 60 / (bpm || 120);   // 16th note
            const totalSteps = steps * LOOPS;
            const dur = totalSteps * secPerStep;
            const rate = window.oaSampleRate();
            const TRACKS = window.OA_DRUM_KIT || [];

            // Simple PKZIP store creator for pure JS ZIP generation without external libraries
            const createZipBlob = (files) => {
                const parts = [];
                const centralDirectory = [];
                let offset = 0;

                const enc = new TextEncoder();
                const crcTable = new Uint32Array(256);
                for (let n = 0; n < 256; n++) {
                    let c = n;
                    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
                    crcTable[n] = c;
                }
                const calcCrc32 = (buf) => {
                    let crc = 0xffffffff;
                    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
                    return (crc ^ 0xffffffff) >>> 0;
                };

                files.forEach(({ name, data }) => {
                    const nameBytes = enc.encode(name);
                    const crc = calcCrc32(data);
                    const size = data.length;

                    // Local file header
                    const localHeader = new Uint8Array(30 + nameBytes.length);
                    const dv = new DataView(localHeader.buffer);
                    dv.setUint32(0, 0x04034b50, true); // Local file header signature
                    dv.setUint16(4, 20, true);         // Version needed to extract
                    dv.setUint16(6, 0, true);          // General purpose bit flag
                    dv.setUint16(8, 0, true);          // Compression method (0 = store)
                    dv.setUint16(10, 0, true);         // File last modification time
                    dv.setUint16(12, 0, true);         // File last modification date
                    dv.setUint32(14, crc, true);       // CRC-32
                    dv.setUint32(18, size, true);      // Compressed size
                    dv.setUint32(22, size, true);      // Uncompressed size
                    dv.setUint16(26, nameBytes.length, true); // File name length
                    dv.setUint16(28, 0, true);         // Extra field length
                    localHeader.set(nameBytes, 30);

                    // Central directory header
                    const cdHeader = new Uint8Array(46 + nameBytes.length);
                    const cdDv = new DataView(cdHeader.buffer);
                    cdDv.setUint32(0, 0x02014b50, true); // Central directory header signature
                    cdDv.setUint16(4, 20, true);         // Version made by
                    cdDv.setUint16(6, 20, true);         // Version needed to extract
                    cdDv.setUint16(8, 0, true);          // General purpose bit flag
                    cdDv.setUint16(10, 0, true);         // Compression method (0 = store)
                    cdDv.setUint16(12, 0, true);         // File last modification time
                    cdDv.setUint16(14, 0, true);         // File last modification date
                    cdDv.setUint32(16, crc, true);       // CRC-32
                    cdDv.setUint32(20, size, true);      // Compressed size
                    cdDv.setUint32(24, size, true);      // Uncompressed size
                    cdDv.setUint16(28, nameBytes.length, true); // File name length
                    cdDv.setUint16(30, 0, true);         // Extra field length
                    cdDv.setUint16(32, 0, true);         // File comment length
                    cdDv.setUint16(34, 0, true);         // Disk number start
                    cdDv.setUint16(36, 0, true);         // Internal file attributes
                    cdDv.setUint32(38, 0, true);         // External file attributes
                    cdDv.setUint32(42, offset, true);    // Relative offset of local header
                    cdHeader.set(nameBytes, 46);

                    parts.push(localHeader, data);
                    centralDirectory.push(cdHeader);

                    offset += localHeader.length + data.length;
                });

                const cdOffset = offset;
                let cdSize = 0;
                centralDirectory.forEach((cd) => {
                    parts.push(cd);
                    cdSize += cd.length;
                });

                // End of central directory record
                const eocd = new Uint8Array(22);
                const eocdDv = new DataView(eocd.buffer);
                eocdDv.setUint32(0, 0x06054b50, true); // End of central directory signature
                eocdDv.setUint16(4, 0, true);          // Number of this disk
                eocdDv.setUint16(6, 0, true);          // Disk where central directory starts
                eocdDv.setUint16(8, files.length, true);  // Number of central directory records on this disk
                eocdDv.setUint16(10, files.length, true); // Total number of central directory records
                eocdDv.setUint32(12, cdSize, true);       // Size of central directory
                eocdDv.setUint32(16, cdOffset, true);     // Offset of start of central directory
                eocdDv.setUint16(20, 0, true);            // ZIP file comment length
                parts.push(eocd);

                return new Blob(parts, { type: 'application/zip' });
            };

            const zipFiles = [];

            const numTracks = (pattern && pattern.length) || TRACKS.length || 16;

            // Render each active track individually into an isolated stem WAV
            for (let trkIdx = 0; trkIdx < numTracks; trkIdx++) {
                if (!pattern[trkIdx]) continue;
                // Check if track has any notes
                let hasNotes = false;
                for (let step = 0; step < steps; step++) {
                    if (velOf(pattern[trkIdx][step]) > 0) { hasNotes = true; break; }
                }
                if (!hasNotes || (mutes && mutes[trkIdx])) continue;

                // Offline Context for this isolated stem (no reverb/delay sends)
                const offline = window.oaOfflineContext(2, dur + 0.1, rate);

                // Render only notes for this single track `trkIdx`
                for (let step = 0; step < totalSteps; step++) {
                    const t = step * secPerStep;
                    const v = velOf(pattern[trkIdx][step % steps]);
                    if (v > 0) {
                        const vol = v / 100;
                        const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[trkIdx];
                        if (entry && entry.buffer && window.oaPlayDrumSample) {
                            window.oaPlayDrumSample(offline, Object.assign({}, entry, { loop: false }), t, vol);
                        } else if (window.oaPlayDrumVoice) {
                            window.oaPlayDrumVoice(offline, { idx: trkIdx }, t, vol);
                        }
                    }
                }

                const rendered = await offline.startRendering();
                const loopLen = Math.max(1, Math.round(dur * rate));
                const stemBuf = window.oaAudioCtx().createBuffer(2, loopLen, rate);
                for (let ch = 0; ch < 2; ch++) {
                    const src = rendered.getChannelData(ch);
                    const dst = stemBuf.getChannelData(ch);
                    for (let i = 0; i < loopLen; i++) dst[i] = src[i] || 0;
                }

                const trackName = (TRACKS[trkIdx] && TRACKS[trkIdx].name) ? TRACKS[trkIdx].name.replace(/[^a-zA-Z0-9_-]/g, '_') : `Track_${trkIdx + 1}`;
                const wavData = new Uint8Array(window.oaEncodeWavFromBuffer(stemBuf));
                zipFiles.push({ name: `${String(trkIdx + 1).padStart(2, '0')}_${trackName}.wav`, data: wavData });
            }

            if (zipFiles.length === 0) {
                window.alert('No active tracks with notes to render stems for.');
                setRendering(false);
                return;
            }

            const zipBlob = createZipBlob(zipFiles);
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${window.oaStamp()} Stems ${bpm || 120} bpm.zip`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e) { console.error('🛑 [Sequencer] stem render failed:', e); }
        setRendering(false);
    };

    return { rendering, renderLoop, renderStems };
};
