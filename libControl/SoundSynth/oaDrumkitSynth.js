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

// Synthesize a kit voice at `time` with `volume` (0..1). Used when no sample.
// The voice is built by its engine from the patch in OA_DRUM_SYNTH — `track`
// only carries the kit index and, in Tone Mode, a pitch ratio to apply.
window.oaPlayDrumVoice = function (ctx, track, time, volume, pan) {
    if (!track) return;
    const idx = track.idx != null ? track.idx : (window.OA_DRUM_KIT || []).indexOf(track);
    const patch = window.oaSynthPatch((window.OA_DRUM_SYNTH || {})[idx] || window.oaFactoryPatch(idx));
    const engine = window.OA_SYNTH_ENGINES[patch.engine] || window.OA_SYNTH_ENGINES.membrane;

    // Tone Mode hands us a ratio; shift every frequency-shaped parameter by it.
    // This pad's own bend is a standing offset on top of that — a synth voice
    // has no detune AudioParam to retune later, so it opens at the pad's tuning
    // and keeps it for its (short) life.
    const ratio = (track.pitchRatio || 1) * (window.oaBendRatio ? window.oaBendRatio(idx) : 1);
    const tuned = (ratio === 1) ? patch : window.oaTransposePatch(patch, ratio);

    const out = window.oaVoiceOut ? window.oaVoiceOut(ctx, idx, pan) : ctx.destination;
    // Engines report the voice's length; that is when its chain can go. The
    // fallback covers an engine that returns nothing rather than leaking on it.
    const dur = engine.render(ctx, tuned, time, Math.max(0.0001, volume), out);
    if (window.oaRetireVoice) {
        window.oaRetireVoice(ctx, out, time + (typeof dur === 'number' && isFinite(dur) ? dur : 2));
    }
};

// Frequency-valued parameters that should follow a Tone Mode transposition.
const OA_PITCHED_PARAMS = ['pitchStart', 'pitchEnd', 'tone1', 'tone2', 'base', 'freq', 'carrier', 'filterFreq'];
window.oaTransposePatch = function (patch, ratio) {
    const out = Object.assign({}, patch);
    OA_PITCHED_PARAMS.forEach((k) => { if (typeof out[k] === 'number') out[k] = out[k] * ratio; });
    return out;
};
// Play a loaded sample ENTRY at `time` with `volume` (0..1); honours pitch,
// loop and fade. Returns the BufferSource so a looping voice can be stopped.
window.oaPlayDrumSample = function (ctx, entry, time, volume, pan) {
    if (!entry || !entry.buffer) return null;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    
    const pitch = entry.pitch || 1;
    const useCache = !!entry.cachedBuffer;
    
    src.buffer = entry.cachedBuffer || entry.buffer;
    src.playbackRate.value = useCache ? 1 : pitch;
    src.loop = !!entry.loop;

    // Break mode (mono/retrigger): stop any currently playing voice instance on this pad
    if (entry.break) {
        for (let i = window.OA_LIVE_VOICES.length - 1; i >= 0; i--) {
            const live = window.OA_LIVE_VOICES[i];
            if (live && live.__oaPad === entry.idx) {
                try { live.stop(); } catch (e) {}
                window.OA_LIVE_VOICES.splice(i, 1);
            }
        }
    }
    
    const origDur = entry.buffer.duration;
    let offset = Math.max(0, Math.min(entry.offset || 0, origDur - 0.001));
    let end = (entry.end != null && entry.end > offset) ? Math.min(entry.end, origDur) : origDur;
    let region = Math.max(0.001, end - offset);
    
    const playDur = region / pitch;
    
    if (useCache) {
        offset = offset / pitch;
        end = end / pitch;
        region = region / pitch;
    }
    
    if (src.loop) { src.loopStart = offset; src.loopEnd = end; }
    src.connect(gain);
    // entry.idx is stamped on by oaSetDrumSample so the sample path finds its
    // own reverb send, the same as a synth voice does.
    const out = window.oaVoiceOut ? window.oaVoiceOut(ctx, entry.idx, pan) : ctx.destination;
    gain.connect(out);

    const v = Math.max(0.0001, volume);
    if (entry.fadeIn || entry.fadeOut) {
        // Fades chopped in the browser are lengths of the SOURCE, so they play
        // back shorter or longer with the pitch, exactly like the region does.
        const fi = Math.max(0, Math.min((entry.fadeIn || 0) / pitch, playDur));
        const fo = Math.max(0, Math.min((entry.fadeOut || 0) / pitch, playDur - fi));
        if (fi > 0) {
            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(v, time + fi);
        } else {
            gain.gain.setValueAtTime(v, time);
        }
        // A looping voice has no end to fade at; its tail would be a hole in
        // the middle of the loop.
        if (fo > 0 && !src.loop) {
            gain.gain.setValueAtTime(v, time + playDur - fo);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + playDur);
        }
    } else if (entry.fade) {
        const f = Math.min(0.05, playDur * 0.2);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(v, time + f);
        if (!src.loop) {
            gain.gain.setValueAtTime(v, Math.max(time + f, time + playDur - f));
            gain.gain.exponentialRampToValueAtTime(0.0001, time + playDur);
        }
    } else {
        gain.gain.setValueAtTime(v, time);
    }
    
    if (src.loop) src.start(time, offset);
    else src.start(time, offset, region);
    
    // Register as an active voice so the wheel can retune it live, and start it
    // at THIS PAD's bend — every pad carries its own, so a pattern plays each
    // track at its own tuning. Tagged with the pad so a wheel move can find the
    // voices it owns. Auto-removed when the note ends.
    try {
        src.__oaPad = entry.idx;
        if (src.detune) src.detune.value = window.oaPadBend ? window.oaPadBend(entry.idx) : 0;
        window.OA_LIVE_VOICES.push(src);
        src.addEventListener('ended', function () {
            const i = window.OA_LIVE_VOICES.indexOf(src);
            if (i >= 0) window.OA_LIVE_VOICES.splice(i, 1);
            // The registry is this voice's last strong reference; dropping the
            // graph behind it is what lets the panner, the sends and the drive
            // pedal built for this one hit go with it.
            try { src.disconnect(); gain.disconnect(); } catch (e) {}
            if (window.oaRetireVoice) window.oaRetireVoice(ctx, out, ctx.currentTime);
        });
    } catch (e) {}
    return src;
};
// Trigger drum voice `idx`: sample (pitch/loop/fade) if loaded, else synth.
// For an auto-loop pad, TOGGLES the loop. Returns true if a loop just STARTED.
window.oaTriggerDrum = function (idx, volume, time) {
    const ctx = window.oaAudioCtx();
    const t = (typeof time === 'number') ? time : ctx.currentTime;
    const vol = Math.max(0, Math.min(1, volume == null ? 1 : volume));
    const entry = window.OA_DRUM_SAMPLES[idx];
    if (entry && entry.buffer) {
        if (entry.loop) {
            const existing = window.OA_DRUM_LOOPS[idx];
            if (existing) { try { existing.stop(); } catch (e) {} window.OA_DRUM_LOOPS[idx] = null; return false; }
            const src = window.oaPlayDrumSample(ctx, entry, t, vol);
            window.OA_DRUM_LOOPS[idx] = src;
            if (src) src.onended = () => { if (window.OA_DRUM_LOOPS[idx] === src) window.OA_DRUM_LOOPS[idx] = null; };
            return true;
        }
        window.oaPlayDrumSample(ctx, entry, t, vol);
        return false;
    }
    window.oaPlayDrumVoice(ctx, { idx: idx }, t, vol);
    return false;
};
// Trigger a drum voice pitched by N semitones (Tone Mode)
window.oaTriggerTone = function(rootIdx, semitones, volume, time) {
    const ctx = window.oaAudioCtx();
    const t = (typeof time === 'number') ? time : ctx.currentTime;
    const vol = Math.max(0, Math.min(1, volume == null ? 1 : volume));
    const entry = window.OA_DRUM_SAMPLES[rootIdx];
    
    if (entry && entry.buffer) {
        const pitchRatio = Math.pow(2, semitones / 12);
        const totalPitch = (entry.pitch || 1) * pitchRatio;
        
        // If we have a pre-rendered cache for this exact pitch, use it at 1x speed to save latency
        const cache = window.OA_TONE_CACHE[rootIdx];
        if (cache && cache[semitones]) {
            // Played, so this pad is the one to keep when the budget bites.
            if (window.oaTouchToneCache) window.oaTouchToneCache(rootIdx);
            window.oaPlayDrumSample(ctx, Object.assign({}, entry, { cachedBuffer: cache[semitones], pitch: totalPitch }), t, vol);
            return true;
        }
        
        // Fallback to real-time resampling if not in cache
        window.oaPlayDrumSample(ctx, Object.assign({}, entry, { pitch: totalPitch }), t, vol);
        return true;
    }
    
    // Fallback to the synth voice, transposed
    if (window.OA_DRUM_KIT[rootIdx]) {
        window.oaPlayDrumVoice(ctx, { idx: rootIdx, pitchRatio: Math.pow(2, semitones / 12) }, t, vol);
        return true;
    }
    return false;
};
// ---------------------------------------------------------------------------
// The Tone Mode cache, and the budget that stops it eating the machine.
//
// Pre-rendering a pad at every pitch removes the resampling latency, and it is
// worth doing. What it is not worth doing is FORGETTING, which is what used to
// happen: the cache was written on precache and never read back out. Two ways
// that ended badly.
//
//   IT WAS NEVER EVICTED ON A SAMPLE CHANGE. Loading a new sound onto a pad
//   replaced OA_DRUM_SAMPLES[idx] and left sixty-one renders of the OLD sound
//   sitting under the same key. They were not merely wasted — oaTriggerTone
//   reads the cache BEFORE the entry, so tone mode went on playing the sample
//   that used to be on that pad. A silent wrong-sound bug on top of the leak.
//
//   IT HAD NO CEILING. The range below is 61 renders per pad, and pitching down
//   two octaves makes a buffer four times longer, so the set weighs about
//   seventy times the original sample. A one-second stereo 48k sample is 384KB,
//   so one pad is ~27MB and a full 5x5 grid is over half a gigabyte of
//   AudioBuffer. Long before it ran out, the collector pressure alone was
//   enough to stall the main thread — and a main-thread stall during playback
//   is heard as a dropout, which is what "it slowed down and distorted" is.
//
// So: a byte budget, least-recently-used eviction across pads, and a hard drop
// whenever the pad's sound changes underneath it.
// ---------------------------------------------------------------------------

// Two octaves down, three up.
const OA_TONE_LO = -24;
const OA_TONE_HI = 36;

// Generous enough that a working pad or three stay resident, small enough that
// it can never be the reason a machine starts swapping.
window.OA_TONE_CACHE_BUDGET = window.OA_TONE_CACHE_BUDGET || 64 * 1024 * 1024;

// rootIdx -> bytes held, and rootIdx -> a monotonic stamp for LRU order.
const toneBytes = {};
let toneClock = 0;
const toneUsed = {};

const bufBytes = function (b) {
    return b ? b.numberOfChannels * b.length * 4 : 0;
};

/** Total bytes currently held by every pre-rendered pitch, across all pads. */
window.oaToneCacheBytes = function () {
    return Object.keys(toneBytes).reduce(function (a, k) { return a + toneBytes[k]; }, 0);
};

/** Mark a pad as recently played, so the budget evicts a colder one first. */
window.oaTouchToneCache = function (rootIdx) {
    if (toneBytes[rootIdx] != null) toneUsed[rootIdx] = ++toneClock;
};

/** Drop every pre-rendered pitch for one pad. Safe to call when there is none. */
window.oaEvictToneCache = function (rootIdx) {
    if (window.OA_TONE_CACHE[rootIdx]) delete window.OA_TONE_CACHE[rootIdx];
    delete toneBytes[rootIdx];
    delete toneUsed[rootIdx];
    const entry = window.OA_DRUM_SAMPLES[rootIdx];
    // The single-pitch cache is baked from the same sample and goes stale with
    // it. Left behind, oaPlayDrumSample would play the old sound at 1x.
    if (entry && entry.cachedBuffer) entry.cachedBuffer = null;
};

/**
 * Evict whole pads, coldest first, until the cache is back inside its budget.
 * Returns true if there is room to carry on rendering `keepIdx`.
 *
 * The pad being rendered is exempt from eviction — throwing away the work in
 * progress to make room for itself is a loop that never terminates. But that
 * exemption is also why this has to report failure: one pad's full set can be
 * bigger than the entire budget on its own (a two-second stereo sample renders
 * to roughly seventy times its own size across the pitch range). When even an
 * empty cache cannot hold it, the answer is to stop rendering and let
 * oaTriggerTone fall back to real-time resampling for the pitches that did not
 * fit — a little latency, which is recoverable, instead of a machine on its
 * knees, which is not.
 */
const enforceToneBudget = function (keepIdx) {
    let held = window.oaToneCacheBytes();
    if (held <= window.OA_TONE_CACHE_BUDGET) return true;

    const order = Object.keys(toneBytes)
        .filter(function (k) { return String(k) !== String(keepIdx); })
        .sort(function (a, b) { return (toneUsed[a] || 0) - (toneUsed[b] || 0); });
    for (let i = 0; i < order.length && held > window.OA_TONE_CACHE_BUDGET; i++) {
        held -= toneBytes[order[i]] || 0;
        window.oaEvictToneCache(order[i]);
    }
    return held <= window.OA_TONE_CACHE_BUDGET;
};

// Pre-render a sample at multiple pitches to eliminate real-time resampling latency
window.oaPrecacheTones = async function (rootIdx) {
    const entry = window.OA_DRUM_SAMPLES[rootIdx];
    if (!entry || !entry.buffer) return;

    const origBuf = entry.buffer;
    const basePitch = entry.pitch || 1;
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) return;

    // Whatever is under this key was rendered from a different sample or a
    // different base pitch; either way it is not this one.
    window.oaEvictToneCache(rootIdx);
    window.OA_TONE_CACHE[rootIdx] = {};
    toneBytes[rootIdx] = 0;
    toneUsed[rootIdx] = ++toneClock;

    for (let semitones = OA_TONE_LO; semitones <= OA_TONE_HI; semitones++) {
        // A pad whose sample changed while this loop was awaiting a render has
        // taken its cache with it. Stop rather than refill a dead key.
        if (!window.OA_TONE_CACHE[rootIdx]) return;
        if (window.OA_DRUM_SAMPLES[rootIdx] !== entry) return;

        try {
            const pitchRatio = Math.pow(2, semitones / 12);
            const totalPitch = basePitch * pitchRatio;

            if (totalPitch === 1) {
                // The original buffer, not a copy — it is already held by the
                // entry, so this costs nothing and must not be counted twice.
                window.OA_TONE_CACHE[rootIdx][semitones] = origBuf;
                continue;
            }

            const dur = origBuf.duration / totalPitch;
            const offCtx = new OfflineCtx(origBuf.numberOfChannels, Math.ceil(dur * origBuf.sampleRate), origBuf.sampleRate);

            const src = offCtx.createBufferSource();
            src.buffer = origBuf;
            src.playbackRate.value = totalPitch;
            src.connect(offCtx.destination);
            src.start(0);

            const rendered = await offCtx.startRendering();
            window.OA_TONE_CACHE[rootIdx][semitones] = rendered;
            toneBytes[rootIdx] = (toneBytes[rootIdx] || 0) + bufBytes(rendered);
            if (!enforceToneBudget(rootIdx)) {
                // No room left even with every other pad evicted. Give the one
                // that just tipped it over back, and stop: the pitches already
                // cached still play instantly, and the rest resample in
                // real time, which is what happened before any of this existed.
                delete window.OA_TONE_CACHE[rootIdx][semitones];
                toneBytes[rootIdx] -= bufBytes(rendered);
                return;
            }
        } catch (e) {
            console.error('Failed to pre-render pitch', semitones, e);
        }
    }
};
// Pre-cache an individual pad's configured pitch to eliminate real-time latency
window.oaPrecachePad = async function(entry) {
    if (!entry || !entry.buffer) return;
    const pitch = entry.pitch || 1;
    if (pitch === 1) {
        entry.cachedBuffer = entry.buffer;
        return;
    }
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) {
        entry.cachedBuffer = entry.buffer;
        return;
    }
    try {
        const dur = entry.buffer.duration / pitch;
        const offCtx = new OfflineCtx(entry.buffer.numberOfChannels, Math.ceil(dur * entry.buffer.sampleRate), entry.buffer.sampleRate);
        const src = offCtx.createBufferSource();
        src.buffer = entry.buffer;
        src.playbackRate.value = pitch;
        src.connect(offCtx.destination);
        src.start(0);
        entry.cachedBuffer = await offCtx.startRendering();
    } catch (e) {
        entry.cachedBuffer = entry.buffer;
    }
};
