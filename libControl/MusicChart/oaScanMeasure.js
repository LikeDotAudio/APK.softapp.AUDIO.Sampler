// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: oaScanMeasure.js
 * Purpose: The measurements `oaDeepScanAudio` reports about a buffer — EBU R128
 *   loudness, musicality (key / pitch / tempo), energy onsets, and a digest of
 *   the decoded PCM. Nothing here draws anything; the surfaces read what it
 *   returns.
 * Description: These fields existed as READS long before they existed as
 *   values. `LensesView` has always asked the scan for `musicality.pitchHz`,
 *   `loudness.integratedLUFS` and `beatMarkers`, and the scanner has never
 *   returned any of them — two lens tabs white-screened and one export threw
 *   (PLAN-601.01). This file is the side that owed the fields.
 *
 *   REFUSAL OVER FABRICATION — company doctrine, and the reason every function
 *   here returns `null` rather than a number it could not measure. A 400 ms
 *   loudness block does not exist in a 200 ms buffer; a tempo does not exist in
 *   silence; a key does not exist where no frame was above the noise floor.
 *   `null` says that. `0` would not: 0 LUFS is the loudest number in the unit
 *   and 0 BPM is not a slow song. `perfSchema.json`'s `$comment` and
 *   `002_🏛⚖📜 Philosophy/Doctrine/readme.Refusal over fabrication.md` are the ruling;
 *   `sample_analyzer_rs`'s `LoudnessR128` reaches the same shape in Rust with
 *   `Option<f64>`, and this is the browser-side counterpart of it.
 *
 *   NOT A SECOND EBU R128 IMPLEMENTATION BY CHOICE. The corpus is measured by
 *   the `ebur128` crate through `sample_analyzer_rs`, which is the authority for
 *   anything committed. That crate cannot run in a page, and the Scanalyzer
 *   measures a buffer a visitor just dropped, which is not in the corpus and
 *   never will be. So this is the same specification (ITU-R BS.1770-4 gating,
 *   EBU Tech 3342 range) computed where the audio is, and the two are expected
 *   to agree within the tolerance of the true-peak oversampler below — not to
 *   be byte-identical.
 *
 *   EVERY FUNCTION TAKES RAW PCM AND A RATE, never an AudioBuffer. That is what
 *   makes them testable without a browser, and it is why `oaDeepScanner.js`
 *   pulls the channel data out before calling in.
 */

/**
 * ITU-R BS.1770-4 K-weighting, as two biquads, redesigned for any sample rate.
 *
 * The standard tabulates coefficients at 48 kHz only. A dropped file is
 * whatever rate it was recorded at, so the analogue prototypes are
 * bilinear-transformed here instead — at 48 kHz these reproduce the published
 * table, and at every other rate they are the filter the table is a sample of.
 */
window.oaKWeightingBiquads = function(sampleRate) {
    // Stage 1: the high-shelf that stands in for the head.
    const shelfF0 = 1681.974450955533;
    const shelfG = 3.999843853973347;   // dB
    const shelfQ = 0.7071752369554196;
    const ks = Math.tan(Math.PI * shelfF0 / sampleRate);
    const vh = Math.pow(10, shelfG / 20);
    const vb = Math.pow(vh, 0.4996667741545416);
    const sDen = 1 + ks / shelfQ + ks * ks;

    // Stage 2: the RLB high-pass.
    const hpF0 = 38.13547087602444;
    const hpQ = 0.5003270373238773;
    const kh = Math.tan(Math.PI * hpF0 / sampleRate);
    const hDen = 1 + kh / hpQ + kh * kh;

    return [
        {
            b0: (vh + vb * ks / shelfQ + ks * ks) / sDen,
            b1: 2 * (ks * ks - vh) / sDen,
            b2: (vh - vb * ks / shelfQ + ks * ks) / sDen,
            a1: 2 * (ks * ks - 1) / sDen,
            a2: (1 - ks / shelfQ + ks * ks) / sDen
        },
        {
            b0: 1.0,
            b1: -2.0,
            b2: 1.0,
            a1: 2 * (kh * kh - 1) / hDen,
            a2: (1 - kh / hpQ + kh * kh) / hDen
        }
    ];
};

/** Direct-form-I biquad over a whole signal, into a fresh array. */
window.oaApplyBiquad = function(input, c) {
    const out = new Float64Array(input.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < input.length; i++) {
        const x0 = input[i];
        const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
        x2 = x1; x1 = x0;
        y2 = y1; y1 = y0;
        out[i] = y0;
    }
    return out;
};

/**
 * Max true peak in dBTP, by 4x polyphase sinc interpolation.
 *
 * `null` for digital silence — the true peak of all zeros is −∞ dB, and −∞ is
 * not a reading. The same call `sample_analyzer_rs` answers with `None`.
 *
 * BS.1770-4 specifies a 4x oversampler with a stated ripple; this is a 24-tap
 * per-phase windowed sinc, which is close but not that filter, so a reading
 * here may sit a few hundredths of a dB under the crate's. The centre tap is an
 * exact integer multiple of the oversampling factor, so phase 0 passes the
 * original samples through unchanged and the answer can never come back BELOW
 * the sample peak — which is the one error that would matter.
 *
 * EVERY SAMPLE IS INTERPOLATED, and the shortcut was declined on purpose. The
 * usual optimisation is to oversample only around samples within some margin of
 * the sample peak; it is 10-20x faster and it is a HEURISTIC, because the
 * overshoot of a band-limited signal is not bounded by its own samples — the
 * degenerate case is a signal at fs/2 sampled at its zero crossings, whose
 * samples are all zero. A measurement whose whole purpose is to be trusted does
 * not get a shortcut with a caveat. The cost is the second largest in a scan and
 * a long way behind the first: measured 2026-09-07 over a synthetic three-minute
 * 48 kHz track, this pass and the chromagram it sits beside came in at roughly
 * 0.2 s and 17.7 s respectively. PLAN-801.01 owns that one.
 */
window.oaTruePeakDbtp = function(pcm, oversample) {
    const O = oversample || 4;
    if (!pcm || pcm.length === 0) return null;

    let samplePeak = 0;
    for (let i = 0; i < pcm.length; i++) {
        const a = Math.abs(pcm[i]);
        if (a > samplePeak) samplePeak = a;
    }
    // Digital silence. No interpolation can lift it, and there is nothing to say.
    if (samplePeak === 0) return null;

    const TAPS_PER_PHASE = 24;          // 97-tap prototype at 4x
    const L = O * TAPS_PER_PHASE + 1;
    const centre = (L - 1) / 2;          // an exact multiple of O, so phase 0 is identity
    const h = new Float64Array(L);
    for (let n = 0; n < L; n++) {
        const t = (n - centre) / O;
        const sinc = (t === 0) ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
        const win = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (L - 1));
        h[n] = sinc * win;
    }

    let peak = samplePeak;
    const k0 = centre / O;               // taps behind the output sample
    for (let m = 0; m < pcm.length; m++) {
        for (let p = 1; p < O; p++) {    // phase 0 is the sample itself, already counted
            let acc = 0;
            for (let k = 0; k < TAPS_PER_PHASE; k++) {
                const idx = m + k0 - k;
                if (idx < 0 || idx >= pcm.length) continue;
                acc += h[p + k * O] * pcm[idx];
            }
            const a = Math.abs(acc);
            if (a > peak) peak = a;
        }
    }
    return Math.round(20 * Math.log10(peak) * 100) / 100;
};

/**
 * EBU R128 / ITU-R BS.1770-4 loudness over one channel of PCM.
 *
 * Returns `{ integratedLUFS, maxTruePeakdBTP, lraLU, gatingThresholdLUFS }`,
 * every one of them `null` when the buffer cannot support it:
 *
 *   integrated   needs one 400 ms block above the −70 LUFS absolute gate
 *   lra          needs 3 s of audio and a block above the relative gate
 *   true peak    needs one non-zero sample
 *
 * MONO ONLY, and on purpose. `oaDeepScanAudio` scans channel 0; a summed
 * stereo pair with BS.1770's channel weights would be a different measurement
 * from the one every other number in the scan is taken over.
 */
window.oaMeasureLoudnessR128 = function(pcm, sampleRate) {
    const empty = {
        integratedLUFS: null,
        maxTruePeakdBTP: null,
        lraLU: null,
        gatingThresholdLUFS: null
    };
    if (!pcm || !pcm.length || !sampleRate) return empty;

    const truePeak = window.oaTruePeakDbtp(pcm, 4);

    // K-weight once; both the integrated figure and the range read the same pass.
    const [shelf, hp] = window.oaKWeightingBiquads(sampleRate);
    const weighted = window.oaApplyBiquad(window.oaApplyBiquad(pcm, shelf), hp);

    // Running sum of squares, so a window's mean square is one subtraction
    // rather than a second pass over it. THE 3 s SHORT-TERM WINDOW IS WHY: at 48
    // kHz it is 144,000 samples stepped by 4,800, so a three-minute track would
    // otherwise re-add 255 million products to produce 1,770 numbers. Measured
    // 2026-09-07 at 4.1 s for that track; the running sum makes it one pass.
    const cumulative = new Float64Array(weighted.length + 1);
    for (let i = 0; i < weighted.length; i++) {
        cumulative[i + 1] = cumulative[i] + weighted[i] * weighted[i];
    }

    /** Mean square of every window of `winSec` seconds stepped by `hopSec`. */
    const meanSquares = (winSec, hopSec) => {
        const win = Math.round(sampleRate * winSec);
        const hop = Math.round(sampleRate * hopSec);
        const out = [];
        if (win <= 0 || hop <= 0 || weighted.length < win) return out;
        for (let start = 0; start + win <= weighted.length; start += hop) {
            out.push((cumulative[start + win] - cumulative[start]) / win);
        }
        return out;
    };

    const LUFS = (z) => -0.691 + 10 * Math.log10(z);
    const ABSOLUTE_GATE = -70;

    // --- Integrated: 400 ms blocks, 75% overlap, two-stage gate --------------
    const blocks = meanSquares(0.4, 0.1);
    let integrated = null;
    let relativeGate = null;
    if (blocks.length) {
        const aboveAbs = blocks.filter((z) => z > 0 && LUFS(z) > ABSOLUTE_GATE);
        if (aboveAbs.length) {
            const meanAbs = aboveAbs.reduce((a, z) => a + z, 0) / aboveAbs.length;
            relativeGate = LUFS(meanAbs) - 10;
            const gated = aboveAbs.filter((z) => LUFS(z) > relativeGate);
            if (gated.length) {
                const meanGated = gated.reduce((a, z) => a + z, 0) / gated.length;
                integrated = Math.round(LUFS(meanGated) * 100) / 100;
                relativeGate = Math.round(relativeGate * 100) / 100;
            } else {
                relativeGate = null;
            }
        }
    }

    // --- Loudness range: EBU Tech 3342, 3 s short-term, −20 LU relative gate --
    const shortTerm = meanSquares(3.0, 0.1);
    let lra = null;
    if (shortTerm.length) {
        const aboveAbs = shortTerm.filter((z) => z > 0 && LUFS(z) > ABSOLUTE_GATE);
        if (aboveAbs.length) {
            const meanAbs = aboveAbs.reduce((a, z) => a + z, 0) / aboveAbs.length;
            const gate = LUFS(meanAbs) - 20;
            const kept = aboveAbs.map(LUFS).filter((l) => l > gate).sort((a, b) => a - b);
            if (kept.length) {
                const pct = (p) => {
                    const pos = (kept.length - 1) * p;
                    const lo = Math.floor(pos);
                    const hi = Math.ceil(pos);
                    return kept[lo] + (kept[hi] - kept[lo]) * (pos - lo);
                };
                lra = Math.round((pct(0.95) - pct(0.10)) * 100) / 100;
            }
        }
    }

    return {
        integratedLUFS: integrated,
        maxTruePeakdBTP: truePeak,
        lraLU: lra,
        gatingThresholdLUFS: relativeGate
    };
};

/**
 * A 10 ms-hop half-wave-rectified energy-difference envelope.
 *
 * The chroma loop upstairs hops every 250 ms, which cannot resolve a beat. This
 * is a second, cheap pass at a resolution that can.
 */
window.oaOnsetEnvelope = function(pcm, sampleRate) {
    const hop = Math.max(1, Math.round(sampleRate * 0.01));
    const win = hop * 2;
    const frames = Math.floor((pcm.length - win) / hop) + 1;
    if (frames < 2) return { hopSeconds: hop / sampleRate, flux: new Float64Array(0) };

    const rms = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
        const start = f * hop;
        let sum = 0;
        for (let i = start; i < start + win; i++) sum += pcm[i] * pcm[i];
        rms[f] = Math.sqrt(sum / win);
    }

    const flux = new Float64Array(frames);
    for (let f = 1; f < frames; f++) {
        const d = rms[f] - rms[f - 1];
        flux[f] = d > 0 ? d : 0;
    }
    return { hopSeconds: hop / sampleRate, flux };
};

/**
 * Onset peaks and, if the file is long enough to carry one, a tempo.
 *
 * THESE ARE ONSETS, NOT A BEAT-TRACKED GRID. They are the instants the energy
 * rose, which is what the timeline draws and what the tempo is inferred from —
 * a downbeat is not claimed and no metre is assumed. The scan calls the array
 * `beatMarkers` because that is the name the surfaces and the `.PEAK` sidecar
 * have always used for it; the contract of the field is this paragraph.
 *
 * `bpm` is `null` under about four seconds: the autocorrelation needs several
 * periods of the slowest tempo it looks for before a peak in it means anything.
 */
window.oaDetectOnsets = function(pcm, sampleRate) {
    const { hopSeconds, flux } = window.oaOnsetEnvelope(pcm, sampleRate);
    const n = flux.length;
    if (n < 2) return { beatMarkers: [], bpm: null };

    let peak = 0;
    let total = 0;
    for (let i = 0; i < n; i++) { total += flux[i]; if (flux[i] > peak) peak = flux[i]; }
    // Nothing rose anywhere. Silence, or a signal with no transient in it.
    if (peak <= 0) return { beatMarkers: [], bpm: null };
    const mean = total / n;

    // Adaptive threshold: above the running mean AND above a fixed fraction of
    // the loudest onset, so a quiet passage does not manufacture onsets out of
    // its own noise floor.
    const half = Math.max(1, Math.round(0.5 / hopSeconds));
    const minGap = Math.max(1, Math.round(0.06 / hopSeconds));
    const beatMarkers = [];
    let lastIdx = -minGap;
    for (let i = 1; i < n - 1; i++) {
        if (flux[i] <= flux[i - 1] || flux[i] < flux[i + 1]) continue;
        if (i - lastIdx < minGap) continue;
        let localSum = 0, localCount = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
            localSum += flux[j]; localCount++;
        }
        const threshold = Math.max(localSum / localCount + 0.1 * mean, 0.15 * peak);
        if (flux[i] < threshold) continue;
        beatMarkers.push({
            timestamp_seconds: Math.round(i * hopSeconds * 1000) / 1000,
            strength: Math.round((flux[i] / peak) * 1000) / 1000
        });
        lastIdx = i;
    }

    // --- Tempo, by autocorrelation of the same envelope ----------------------
    const minLag = Math.max(1, Math.round(60 / (200 * hopSeconds)));   // 200 BPM
    const maxLag = Math.round(60 / (60 * hopSeconds));                 // 60 BPM
    let bpm = null;
    if (n >= maxLag * 3) {
        let best = 0, bestLag = 0;
        for (let lag = minLag; lag <= maxLag; lag++) {
            let acc = 0;
            for (let i = lag; i < n; i++) acc += flux[i] * flux[i - lag];
            acc /= (n - lag);
            if (acc > best) { best = acc; bestLag = lag; }
        }
        if (bestLag > 0 && best > 0) {
            bpm = Math.round((60 / (bestLag * hopSeconds)) * 10) / 10;
        }
    }

    return { beatMarkers, bpm };
};

/** Krumhansl-Schmuckler key profiles, major then minor, rooted on C. */
window.OA_KEY_PROFILES = {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
};

/**
 * The key a summed chromagram best matches, by Pearson correlation against the
 * twenty-four rotated Krumhansl-Schmuckler profiles.
 *
 * `null` for a chroma vector with no energy in it — an unsounding buffer has no
 * key, and "C major" is what every zero vector correlates to if you let it.
 */
window.oaEstimateKey = function(chromaSum) {
    if (!chromaSum || chromaSum.length !== 12) return null;
    let total = 0;
    for (let i = 0; i < 12; i++) total += chromaSum[i];
    if (!(total > 0)) return null;

    const meanOf = (v) => v.reduce((a, x) => a + x, 0) / v.length;
    const corr = (a, b) => {
        const ma = meanOf(a), mb = meanOf(b);
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < 12; i++) {
            const xa = a[i] - ma, xb = b[i] - mb;
            num += xa * xb; da += xa * xa; db += xb * xb;
        }
        return (da > 0 && db > 0) ? num / Math.sqrt(da * db) : 0;
    };

    const chroma = Array.from(chromaSum, (x) => x / total);
    let bestName = null, bestScore = -2;
    ['major', 'minor'].forEach((mode) => {
        const profile = window.OA_KEY_PROFILES[mode];
        for (let root = 0; root < 12; root++) {
            const rotated = [];
            for (let i = 0; i < 12; i++) rotated.push(profile[(i - root + 12) % 12]);
            const score = corr(chroma, rotated);
            if (score > bestScore) {
                bestScore = score;
                bestName = `${window.NOTE_NAMES_12[root]} ${mode}`;
            }
        }
    });
    return bestName ? { key: bestName, confidence: Math.round(bestScore * 100) / 100 } : null;
};

/**
 * A fundamental in Hz, and how far off equal temperament it sits, in cents.
 *
 * Autocorrelation over a bounded set of windows spread through the file rather
 * than every frame — a 0.5 s window at 48 kHz costs 20 million multiplies per
 * lag sweep, and sixteen honest samples of a track answer the same question as
 * four hundred. A window whose autocorrelation peak is under `CLARITY` is
 * DISCARDED rather than reported: an unpitched frame has no fundamental, and
 * the median of a set that includes its noise is not a pitch either.
 *
 * `null` when no window cleared it.
 */
window.oaEstimatePitch = function(pcm, sampleRate) {
    const CLARITY = 0.5;
    const MIN_HZ = 55, MAX_HZ = 1000;
    const minLag = Math.max(2, Math.floor(sampleRate / MAX_HZ));
    const maxLag = Math.ceil(sampleRate / MIN_HZ);
    const win = Math.min(pcm.length, Math.max(2048, maxLag * 2));
    if (pcm.length < win || maxLag >= win) return null;

    const WINDOWS = 16;
    const span = Math.max(1, Math.floor((pcm.length - win) / WINDOWS));
    const estimates = [];

    for (let w = 0; w < WINDOWS; w++) {
        const start = w * span;
        if (start + win > pcm.length) break;

        let energy = 0;
        for (let i = start; i < start + win; i++) energy += pcm[i] * pcm[i];
        if (energy <= 0) continue;
        if (Math.sqrt(energy / win) < 0.01) continue;   // the scanner's own noise floor

        let best = 0, bestLag = 0;
        for (let lag = minLag; lag <= maxLag; lag++) {
            let acc = 0;
            for (let i = start; i < start + win - lag; i++) acc += pcm[i] * pcm[i + lag];
            const norm = acc / (win - lag);
            if (norm > best) { best = norm; bestLag = lag; }
        }
        const clarity = best / (energy / win);
        if (bestLag > 0 && clarity >= CLARITY) estimates.push(sampleRate / bestLag);
    }

    if (!estimates.length) return null;
    estimates.sort((a, b) => a - b);
    const hz = estimates[Math.floor(estimates.length / 2)];

    // Distance from the nearest equal-tempered pitch at A440, in cents.
    const midi = 69 + 12 * Math.log2(hz / 440);
    const nearest = 440 * Math.pow(2, (Math.round(midi) - 69) / 12);
    return {
        pitchHz: Math.round(hz * 100) / 100,
        centsOffset: Math.round(1200 * Math.log2(hz / nearest)),
        agreeingWindows: estimates.length
    };
};

/**
 * SHA-256 OF THE DECODED PCM, NOT OF THE SOURCE FILE — and the difference is
 * the whole reason this function is named the way it is.
 *
 * The Scanalyzer is handed an AudioBuffer. The bytes of the file it was decoded
 * from are gone by then, so a file checksum is a thing this code CANNOT compute,
 * and the constant it used to print in the AES Preservation lens —
 * `e3b0c442…b855` — is the SHA-256 of the empty string, displayed as if it were
 * the file's. What can be computed is a digest of the samples, which identifies
 * the audio rather than the container: two encodes of one take hash alike here
 * and differently on disk. Any consumer needs to know which it is holding, so
 * the key says so and so does the `sha256_scope` field beside it in the export.
 *
 * `null` where `crypto.subtle` is not there — it is absent from an insecure
 * origin, and a page served over plain http would otherwise have no hash and no
 * explanation for it.
 */
window.oaPcmSha256 = async function(pcm) {
    const subtle = (window.crypto && window.crypto.subtle) || null;
    if (!subtle || !pcm || !pcm.length) return null;
    try {
        // A copy, because `pcm` is usually a subarray view of a larger buffer
        // and `.buffer` on one of those is the whole channel, not the window.
        const copy = Float32Array.from(pcm);
        const digest = await subtle.digest('SHA-256', copy.buffer);
        return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    } catch (e) {
        return null;
    }
};
