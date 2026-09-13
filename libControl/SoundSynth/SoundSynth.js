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
 * Header: DrumKit.js
 * Purpose: Shared 16-voice drum kit for the Sampler + Sequencer.
 * Description: Single source of truth for the drum-sound names/voices so the
 *   Sampler pads and the Sequencer tracks are the SAME kit. Also provides a
 *   shared AudioContext and a shared sample store, so a sample loaded on a
 *   Sampler pad is played by the Sequencer for that track too.
 *
 * Plain JS (not JSX) so it runs before the text/babel component scripts and
 * window.OA_DRUM_KIT is ready when they execute.
 *
 * Version: 26.07.11.1
 */

// Every voice the kit can offer: name + synth pitch (Hz) + oscillator type
// (used when no sample is loaded). The first 16 are the original 4 × 4 kit; the
// rest fill out a 5 × 5. Pad index === Sequencer track index === key into
// OA_DRUM_SAMPLES.
window.OA_DRUM_VOICES = [
    { name: 'Kick',    freq: 60,   type: 'sine' },
    { name: 'Snare',   freq: 200,  type: 'sine' },
    { name: 'Hi-Hat',  freq: 800,  type: 'square' },
    { name: 'Perc',    freq: 400,  type: 'sine' },
    { name: 'Clap',    freq: 300,  type: 'square' },
    { name: 'Rim',     freq: 1000, type: 'square' },
    { name: 'Tom Lo',  freq: 100,  type: 'sine' },
    { name: 'Tom Mid', freq: 150,  type: 'sine' },
    { name: 'Tom Hi',  freq: 250,  type: 'sine' },
    { name: 'Cymbal',  freq: 1200, type: 'square' },
    { name: 'Ride',    freq: 900,  type: 'square' },
    { name: 'Cowbell', freq: 540,  type: 'square' },
    { name: 'Conga',   freq: 350,  type: 'sine' },
    { name: 'Clave',   freq: 1100, type: 'sine' },
    { name: 'Shaker',  freq: 1500, type: 'square' },
    { name: 'FX',      freq: 700,  type: 'sawtooth' },
    // 5 × 5 adds a second kick and snare, the open hat the 4 × 4 had no room
    // for, a floor tom, and the metal and hand percussion to go with them.
    { name: 'Kick 2',  freq: 70,   type: 'sine' },
    { name: 'Snare 2', freq: 240,  type: 'sine' },
    { name: 'Open Hat',freq: 850,  type: 'square' },
    { name: 'Tom Fl',  freq: 80,   type: 'sine' },
    { name: 'Crash',   freq: 1300, type: 'square' },
    { name: 'Splash',  freq: 1600, type: 'square' },
    { name: 'Block',   freq: 1150, type: 'square' },
    { name: 'Triangle',freq: 1100, type: 'sine' },
    { name: 'Bongo',   freq: 520,  type: 'sine' },
];

// The live kit, cut to the current grid. MUTATED in place rather than replaced —
// several modules read it once at load time, and they all have to see the same
// array change size.
window.OA_DRUM_KIT = window.OA_DRUM_KIT || [];

window.oaBuildDrumKit = function () {
    const kit = window.OA_DRUM_KIT;
    const n = window.OA_PAD_COUNT;
    kit.length = 0;
    for (let i = 0; i < n; i++) {
        // Past the named voices a pad still needs a name and a pitch; carry on
        // up the list an octave at a time.
        const v = window.OA_DRUM_VOICES[i % window.OA_DRUM_VOICES.length];
        const lap = Math.floor(i / window.OA_DRUM_VOICES.length);
        kit.push(lap === 0 ? Object.assign({}, v)
                           : { name: `${v.name} ${lap + 1}`, freq: v.freq * Math.pow(2, lap), type: v.type });
    }
    return kit;
};
window.oaBuildDrumKit();

// Shared AudioContext so buffers decoded by the Sampler play in the Sequencer.
window.oaAudioCtx = function () {
    if (!window.OA_AUDIO_CTX) {
        // Through oaNewAudioContext(), which asks for OA_SAMPLE_RATE and — if
        // the browser refuses it — adopts whatever the device gave instead, so
        // every offline render in the app follows the live rate rather than a
        // constant that turned out not to be true. See oaAudioRate.js.
        window.OA_AUDIO_CTX = window.oaNewAudioContext();
    }
    if (window.OA_AUDIO_CTX.state === 'suspended') {
        // Best-effort resume (browsers gate audio until a user gesture).
        try { window.OA_AUDIO_CTX.resume(); } catch (e) {}
    }
    // The tape delays run in an AudioWorklet, which has to be fetched and
    // registered before a node can exist. Kick that off the moment there is a
    // context, so it is ready long before the first hit.
    if (window.oaWarmFx && !window.OA_AUDIO_CTX.__oaWarmed) {
        window.OA_AUDIO_CTX.__oaWarmed = true;
        try { window.oaWarmFx(window.OA_AUDIO_CTX).catch(() => {}); } catch (e) {}
    }
    return window.OA_AUDIO_CTX;
};

// index -> sample ENTRY { buffer, pitch, loop, fade, name }. Populated by the
// Sampler / AudioEditor, read by both the Sampler pads and the Sequencer.
window.OA_DRUM_SAMPLES = window.OA_DRUM_SAMPLES || {};
// index -> currently-playing looping BufferSource (for auto-loop toggle pads).
window.OA_DRUM_LOOPS = window.OA_DRUM_LOOPS || {};

// Every currently-sounding BufferSource, for live MIDI pitch-bend.
//
// THIS USED TO BE CALLED OA_DRUM_VOICES, which is the name of the kit voice
// table thirty lines above. `window.OA_DRUM_VOICES = window.OA_DRUM_VOICES || []`
// therefore did nothing at all — the table was already truthy — and every
// sounding BufferSource was pushed onto the KIT DEFINITION. Two things went
// wrong and neither announced itself: oaBuildDrumKit() indexes that table with
// `i % length`, so rebuilding the grid while anything was ringing handed pads a
// BufferSource in place of a voice spec (no .name, no .freq); and the array is
// the app's only strong reference to a playing source, so it is exactly where a
// voice that never fires 'ended' piles up. Separate names, separate arrays.
window.OA_LIVE_VOICES = window.OA_LIVE_VOICES || [];
// How far the wheel reaches, in cents. ±200 = the usual two semitones.
window.OA_BEND_RANGE = window.OA_BEND_RANGE || 200;

// ---------------------------------------------------------------------------
// The bend belongs to the PAD, not to the desk.
//
// One global offset made the wheel a master tuning control: bend a kick down
// and the hats went with it, and a sequence playing sixteen voices played all
// sixteen at whatever the last gesture was. That is not what a wheel is for on
// a sampler. Here each pad keeps its own standing offset, so a pad can be tuned
// by ear once and then played — and the sequencer plays every track at its own
// tuning, all at the same time, which a single global number cannot express.
//
// The wheel is therefore a control that has to be POINTED at something: playing
// a pad hands it that pad (oaFocusBendPad), the pad's own value jumps into the
// wheel, and moving the wheel writes back to that pad and no other.
// ---------------------------------------------------------------------------
window.OA_PAD_BEND = window.OA_PAD_BEND || {};       // pad idx -> cents
// Which pad the wheel is currently holding. Pad 1 until something is played,
// so a wheel moved before the first hit still has somewhere to put the value.
window.OA_BEND_PAD = (window.OA_BEND_PAD != null) ? window.OA_BEND_PAD : 0;
// The focused pad's value, mirrored for the display and for anything that only
// wants "the bend right now".
window.OA_PITCH_BEND = window.OA_PITCH_BEND || 0;

/** One pad's standing offset in cents. */
window.oaPadBend = function (idx) {
    return (idx != null && window.OA_PAD_BEND[idx]) || 0;
};

/**
 * Point the wheel at a pad — called when that pad is PLAYED by hand, from the
 * grid, the computer keyboard or a MIDI note. The pad's own tuning becomes what
 * the wheel reads and what the wheel will change.
 *
 * Sequencer steps deliberately do NOT come through here: a running pattern
 * would drag the wheel around once per sixteenth, and every track already plays
 * at its own tuning without anyone pointing at it.
 */
window.oaFocusBendPad = function (idx) {
    if (idx == null) return;
    const cents = window.oaPadBend(idx);
    const same = window.OA_BEND_PAD === idx && window.OA_PITCH_BEND === cents;
    window.OA_BEND_PAD = idx;
    window.OA_PITCH_BEND = cents;
    if (!same) window.dispatchEvent(new CustomEvent('oa-pitch-bend', { detail: { cents: cents, idx: idx } }));
};

// Pre-rendered pitched buffers for Tone Mode (avoids real-time resampling
// latency). rootIdx -> { semitones -> AudioBuffer }. See oaDrumkitSynth.js for
// the budget that keeps this from eating the machine.
window.OA_TONE_CACHE = window.OA_TONE_CACHE || {};

/**
 * Move the wheel: retune the focused pad, and everything of that pad's that is
 * sounding right now.
 *
 * The bend LATCHES. It is a standing offset, not a gesture: the value stays on
 * the pad after the wheel is let go, so the next hit — and the one after the
 * song is reloaded onto the same kit — plays at the pitch it was tuned to. The
 * spring on a hardware wheel is handled where the wheel is read
 * (useMidiPads.js), not here.
 *
 * `idx` names the pad; left out, it is whichever pad was last played.
 */
window.oaSetPitchBend = function (cents, idx) {
    const pad = (idx != null) ? idx : window.OA_BEND_PAD;
    const v = cents || 0;
    if (pad != null) window.OA_PAD_BEND[pad] = v;
    if (pad === window.OA_BEND_PAD) window.OA_PITCH_BEND = v;
    // Only this pad's voices — the whole point is that the hats do not follow
    // the kick down.
    for (let i = 0; i < window.OA_LIVE_VOICES.length; i++) {
        const s = window.OA_LIVE_VOICES[i];
        try { if (s.detune && s.__oaPad === pad) s.detune.value = v; } catch (e) {}
    }
    // The on-screen wheel follows the hardware one, and vice versa; this is how
    // whichever moved tells the other. (PitchWheel.jsx)
    window.dispatchEvent(new CustomEvent('oa-pitch-bend', { detail: { cents: v, idx: pad } }));
};

// A pad's bend as a frequency ratio, for the paths that have no detune
// AudioParam to hand (the synth voices, which are built from frequencies).
window.oaBendRatio = function (idx) {
    return Math.pow(2, window.oaPadBend(idx != null ? idx : window.OA_BEND_PAD) / 1200);
};

// Store/replace a pad's sample. opts: { loop, pitch, fade, name }.
window.oaSetDrumSample = function (idx, buffer, opts) {
    opts = opts || {};
    let sampleRoot = null;
    const name = opts.name || '';
    const m = /ROOT-(\d+)/i.exec(name);
    if (m) sampleRoot = parseInt(m[1], 10);
    
    const entry = {
        idx: idx,                   // so a played copy can find its reverb send
        buffer: buffer,
        pitch: opts.pitch || 1,     // playbackRate multiplier (pitch + speed)
        sampleRoot: sampleRoot,     // MIDI note root parsed from filename
        offset: opts.offset || 0,   // start offset in seconds (time shift)
        end: (opts.end != null ? opts.end : null),   // cut-off in seconds (null = EOF)
        loop: !!opts.loop,
        // fade is the old both-ends switch; fadeIn/fadeOut are lengths in
        // seconds of the source, set by chopping in the browser. Either one
        // being present is enough to say this sound is faded.
        fadeIn: opts.fadeIn || 0,
        fadeOut: opts.fadeOut || 0,
        fade: !!opts.fade || !!opts.fadeIn || !!opts.fadeOut,
        name: name,
        folder: opts.folder || '',  // source folder (for set snapshots / revert)
    };
    // The pad's old sample is gone, so every pre-rendered pitch of it is dead
    // weight — and worse than dead, because oaTriggerTone reads the cache FIRST
    // and would go on playing the sample that used to be here. Drop it before
    // the new entry lands.
    if (window.oaEvictToneCache) window.oaEvictToneCache(idx);

    window.OA_DRUM_SAMPLES[idx] = entry;
    if (window.oaPrecachePad) window.oaPrecachePad(entry);
    // Kept in the browser so the next session opens with this kit already in
    // memory — no folder prompt, no decode. This is the one choke point every
    // loader passes through, which is why it is here and not in each of them.
    // A pad that just came OUT of that store is not written back into it.
    if (!opts.fromStore && window.oaKeepSample) window.oaKeepSample(idx, entry);
    // A loaded sample takes over from the synth voice — the Mixer hides SYNTH.
    window.dispatchEvent(new CustomEvent('oa-sample-changed', { detail: { idx: idx } }));
};

/**
 * Decode a picked File onto a pad, chop and all.
 *
 * The one road from "a file somebody chose" to "a sound on a pad": the Sampler's
 * own pads, the SAMPLER panel on the mixer and the browser's Load button all
 * arrive here, so a sound loaded from any of them lands the same way — same
 * decode, same in/out marks, same fades. `meta` is what the browser hands back
 * ({ folder, offset, end, fadeIn, fadeOut }); anything it leaves out means "the
 * whole file", which is what a plain file input gives.
 */
window.oaLoadSampleToPad = async function (idx, file, meta) {
    if (!file) return null;
    const ctx = window.oaAudioCtx();
    const buffer = await window.oaDecodeAudio(ctx, await file.arrayBuffer());
    const m = meta || {};
    window.oaSetDrumSample(idx, buffer, {
        name: file.name,
        folder: m.folder || '',
        offset: m.offset || 0,
        // An OUT sitting at the end of the file is not a cut — storing it as one
        // would freeze the length against a sample that gets replaced later.
        end: (m.end != null && m.end < buffer.duration - 0.0005) ? m.end : null,
        fadeIn: m.fadeIn || 0,
        fadeOut: m.fadeOut || 0,
    });
    return buffer;
};

// Patch an existing pad's options (pitch/loop/fade) without re-decoding.
window.oaUpdateDrumSample = function (idx, patch) {
    const e = window.OA_DRUM_SAMPLES[idx];
    if (e) {
        const oldPitch = e.pitch || 1;
        Object.assign(e, patch || {});
        if (e.pitch !== oldPitch || !e.cachedBuffer) {
            // Every tone-mode render was baked at the OLD base pitch, so they
            // are all the wrong speed now. Same reasoning as a sample swap.
            if (e.pitch !== oldPitch && window.oaEvictToneCache) window.oaEvictToneCache(idx);
            if (window.oaPrecachePad) window.oaPrecachePad(e);
        }
        // A chop or a tuning is part of the pad, so the kept copy follows it —
        // otherwise a reload brings the sound back untrimmed and at 1x.
        if (window.oaKeepSample) window.oaKeepSample(idx, e);
    }
};


