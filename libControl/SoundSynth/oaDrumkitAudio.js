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

// ---- Audio decode (with an AIFF/AIFC fallback) ------------------------------
// Chromium's decodeAudioData frequently can't decode AIFF, so parse it by hand.
// Reads an 80-bit IEEE extended float (AIFF sample rate).
function oaRead80(dv, off) {
    const expon = dv.getUint16(off, false);
    const hi = dv.getUint32(off + 2, false);
    const lo = dv.getUint32(off + 6, false);
    const sign = (expon & 0x8000) ? -1 : 1;
    const e = expon & 0x7fff;
    if (e === 0 && hi === 0 && lo === 0) return 0;
    const mant = hi * Math.pow(2, 32) + lo;
    return sign * mant * Math.pow(2, e - 16383 - 63);
}

function oaDecodeAiff(ctx, ab) {
    const dv = new DataView(ab);
    const readStr = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint8(o + i)); return s; };
    let numChannels = 0, numFrames = 0, bitDepth = 0, sampleRate = 0, compression = 'NONE';
    let ssndDataOffset = 0, ssndSize = 0;
    let off = 12; // skip FORM + size + formType
    while (off + 8 <= ab.byteLength) {
        const id = readStr(off, 4);
        const size = dv.getUint32(off + 4, false);
        const body = off + 8;
        if (id === 'COMM') {
            numChannels = dv.getInt16(body, false);
            numFrames = dv.getUint32(body + 2, false);
            bitDepth = dv.getInt16(body + 6, false);
            sampleRate = oaRead80(dv, body + 8);
            if (size >= 22) compression = readStr(body + 18, 4);
        } else if (id === 'SSND') {
            const dataOffset = dv.getUint32(body, false);
            ssndDataOffset = body + 8 + dataOffset;
            ssndSize = size - 8 - dataOffset;
        }
        off = body + size + (size & 1); // chunks are padded to even length
    }
    if (!numChannels || !sampleRate) throw new Error('unsupported AIFF');
    const le = (compression === 'sowt');   // sowt = byte-swapped (little-endian)
    const bytesPer = bitDepth / 8;
    const frames = numFrames || Math.floor(ssndSize / (bytesPer * numChannels));
    const out = ctx.createBuffer(numChannels, frames, sampleRate);
    const chans = [];
    for (let c = 0; c < numChannels; c++) chans.push(out.getChannelData(c));
    let p = ssndDataOffset;
    for (let f = 0; f < frames; f++) {
        for (let c = 0; c < numChannels; c++) {
            let v = 0;
            if (bitDepth === 16) { v = dv.getInt16(p, le) / 32768; p += 2; }
            else if (bitDepth === 8) { v = dv.getInt8(p) / 128; p += 1; }
            else if (bitDepth === 24) {
                const a0 = dv.getUint8(p), a1 = dv.getUint8(p + 1), a2 = dv.getUint8(p + 2);
                let val = le ? (a0 | (a1 << 8) | (a2 << 16)) : ((a0 << 16) | (a1 << 8) | a2);
                if (val & 0x800000) val -= 0x1000000;
                v = val / 8388608; p += 3;
            } else if (bitDepth === 32) { v = dv.getInt32(p, le) / 2147483648; p += 4; }
            else { p += bytesPer; }
            chans[c][f] = v;
        }
    }
    return out;
}

// Decode any audio ArrayBuffer. AIFF/AIFC is parsed manually (Chromium can't);
// everything else goes to the browser's decodeAudioData.
window.oaDecodeAudio = async function (ctx, arrayBuffer) {
    const b = new Uint8Array(arrayBuffer);
    const tag = (o) => (b.length > o + 3 ? String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]) : '');
    if (tag(0) === 'FORM' && (tag(8) === 'AIFF' || tag(8) === 'AIFC')) {
        try { return oaDecodeAiff(ctx, arrayBuffer); }
        catch (e) { /* fall through to native (Safari can do AIFF) */ }
    }
    return await ctx.decodeAudioData(arrayBuffer);
};

// Encode a decoded AudioBuffer to a 16-bit PCM WAV **ArrayBuffer** (RENDER/export).
//
// THE NAME CARRIES THE ARGUMENT ON PURPOSE. This and oaEncodeWavFromChannels in
// oaRecordings.js shared ONE global name until PLAN-646.01. They take different
// first arguments, take a different NUMBER of arguments, and hand back different
// types — so the later entry in sources.json simply overwrote this one, and the
// sequencer's two export buttons threw a TypeError into a swallowed catch.
// Two functions, two names. Do not reintroduce a shared one; test/globals.test.mjs
// fails if any module-level global is written by two files in the bundle.
window.oaEncodeWavFromBuffer = function (audioBuffer) {
    const numCh = audioBuffer.numberOfChannels;
    const len = audioBuffer.length;
    const rate = audioBuffer.sampleRate;
    const blockAlign = numCh * 2;
    const dataSize = len * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(buffer);
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); dv.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, numCh, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * blockAlign, true); dv.setUint16(32, blockAlign, true); dv.setUint16(34, 16, true);
    writeStr(36, 'data'); dv.setUint32(40, dataSize, true);
    const chans = [];
    for (let c = 0; c < numCh; c++) chans.push(audioBuffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < len; i++) {
        for (let c = 0; c < numCh; c++) {
            const s = Math.max(-1, Math.min(1, chans[c][i]));
            dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            off += 2;
        }
    }
    return buffer;
};
