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
 * Header: oaDrivePresets.js
 * Purpose: The pedal's factory settings, and nothing else.
 * Description: Data, lifted out of oaDrive.js. Each entry is a full pedal: a
 *   voicing (`mode`), how hard it is driven, the two extra faults (starve and
 *   octave), the tone control and the blend.
 *
 *   WHAT THE THREE VOICINGS CAN AND CANNOT DO, which is what these settings are
 *   built around:
 *
 *     od    tanh, dead centre. Symmetric, so ODD harmonics only — the third,
 *           fifth, seventh. Hollow and woody. Every "pushed amp" sound is here.
 *     tube  tanh off-centre. Lopsided clipping makes EVEN harmonics, the second
 *           above all, which is an octave and therefore reads as warmth. Every
 *           "console" and "tape push" sound is here.
 *     fuzz  a hard clamp at the rail. Square wave, endless harmonic series.
 *
 *   HOW THE FAMOUS CIRCUITS MAP ONTO THAT. The differences between the classic
 *   boxes are mostly (a) where they clip, (b) how symmetric the clipping is and
 *   (c) what the tone stack does either side of it:
 *
 *     A germanium fuzz has LESS gain than a silicon one and a softer, grainier
 *     break-up with a smooth top — so: fuzz voicing, moderate drive, tone well
 *     down. A silicon fuzz has more gain and more high-order harmonics — same
 *     voicing, much more drive, tone open.
 *
 *     A four-stage sustain fuzz is scooped and endless: maximum drive, tone
 *     pulled back to keep it from fizzing, mix at 100%.
 *
 *     The mid-hump overdrives (the green one at ~723Hz, the hard-clipping grey
 *     one at ~1kHz) get their character from a bandpass this pedal does not
 *     have — it has a single lowpass. The nearest honest thing is the right
 *     VOICING plus a tone setting that lands the energy in the same place, so
 *     those two are named for what they do rather than for what they are.
 *
 *   Loaded before oaDrive.js.
 */

window.OA_DRIVE_PRESETS = {
    // ---- clean and nearly clean -------------------------------------------
    clean:    { label: 'Clean (bypass)',   mode: 'od',   drive: 1,    starve: 0,    rect: 0,    tone: 18000, level: 1,    mix: 0 },
    tape:     { label: 'Tape Push',        mode: 'tube', drive: 1.8,  starve: 0,    rect: 0,    tone: 15000, level: 1,    mix: 0.18 },
    console:  { label: 'Console Push',     mode: 'tube', drive: 2.2,  starve: 0,    rect: 0,    tone: 16000, level: 1,    mix: 0.22 },
    grit:     { label: 'Amp Grit',         mode: 'od',   drive: 2.5,  starve: 0,    rect: 0,    tone: 12000, level: 1,    mix: 0.25 },

    // ---- overdrive: the peaks rounded, never chopped ------------------------
    edge:     { label: 'Edge of Breakup',  mode: 'od',   drive: 3.5,  starve: 0,    rect: 0,    tone: 14000, level: 1,    mix: 0.30 },
    warm:     { label: 'Warm Tube',        mode: 'tube', drive: 5,    starve: 0,    rect: 0,    tone: 7500,  level: 1,    mix: 0.45 },
    midpush:  { label: 'Mid Push OD',      mode: 'od',   drive: 6.5,  starve: 0,    rect: 0,    tone: 5600,  level: 1,    mix: 0.50 },
    crunch:   { label: 'Crunch',           mode: 'od',   drive: 9,    starve: 0,    rect: 0,    tone: 9000,  level: 0.95, mix: 0.55 },
    stack:    { label: 'Stacked Gain',     mode: 'od',   drive: 16,   starve: 0,    rect: 0,    tone: 7000,  level: 0.9,  mix: 0.65 },
    radio:    { label: 'Radio Crunch',     mode: 'od',   drive: 14,   starve: 0,    rect: 0,    tone: 2000,  level: 0.9,  mix: 0.85 },

    // ---- tube: lopsided, so the even harmonics come up ----------------------
    bass:     { label: 'Bass Drive',       mode: 'tube', drive: 4,    starve: 0,    rect: 0,    tone: 3200,  level: 1,    mix: 0.40 },
    kick:     { label: 'Kick Weight',      mode: 'tube', drive: 3,    starve: 0,    rect: 0,    tone: 2400,  level: 1,    mix: 0.35 },
    valve:    { label: 'Hot Valve',        mode: 'tube', drive: 8,    starve: 0,    rect: 0,    tone: 6200,  level: 0.95, mix: 0.60 },
    saturate: { label: 'Saturated Mix Bus',mode: 'tube', drive: 2.6,  starve: 0,    rect: 0,    tone: 11000, level: 1,    mix: 0.30 },

    // ---- fuzz: clamped flat at the rail -------------------------------------
    germanium:{ label: 'Germanium Fuzz',   mode: 'fuzz', drive: 8,    starve: 0,    rect: 0,    tone: 3800,  level: 0.9,  mix: 0.80 },
    silicon:  { label: 'Silicon Fuzz',     mode: 'fuzz', drive: 22,   starve: 0,    rect: 0,    tone: 6800,  level: 0.85, mix: 0.90 },
    fuzz:     { label: 'Big Fuzz',         mode: 'fuzz', drive: 18,   starve: 0,    rect: 0,    tone: 5200,  level: 0.85, mix: 0.85 },
    sustain:  { label: 'Sustain Fuzz',     mode: 'fuzz', drive: 30,   starve: 0,    rect: 0,    tone: 4800,  level: 0.8,  mix: 1 },
    hardclip: { label: 'Hard Clip Dist',   mode: 'fuzz', drive: 12,   starve: 0,    rect: 0,    tone: 6500,  level: 0.9,  mix: 0.70 },
    fizz:     { label: 'Fizz Lead',        mode: 'fuzz', drive: 34,   starve: 0,    rect: 0,    tone: 9500,  level: 0.8,  mix: 0.90 },

    // ---- the two faults ------------------------------------------------------
    // STARVE is a dying battery: a dead band around zero, so the tail of every
    // note sputters out instead of decaying.
    starved:  { label: 'Dying Battery',    mode: 'fuzz', drive: 26,   starve: 0.55, rect: 0,    tone: 4200,  level: 0.9,  mix: 1 },
    splutter: { label: 'Gated Splutter',   mode: 'fuzz', drive: 30,   starve: 0.70, rect: 0,    tone: 5000,  level: 0.9,  mix: 1 },
    speaker:  { label: 'Broken Speaker',   mode: 'fuzz', drive: 24,   starve: 0.35, rect: 0,    tone: 2600,  level: 0.85, mix: 1 },
    // OCTAVE folds the wave. At 0.5 it is half-wave rectification — fundamental
    // still there with the octave over it; at 1 the original pitch has gone.
    octfuzz:  { label: 'Octave Fuzz',          mode: 'fuzz', drive: 20,   starve: 0.12, rect: 0.9,  tone: 6000,  level: 0.85, mix: 0.90 },
    ring:     { label: 'Ring Octave',      mode: 'fuzz', drive: 16,   starve: 0,    rect: 0.55, tone: 7000,  level: 0.85, mix: 0.80 },
    full8ve:  { label: 'Full Octave Up',   mode: 'fuzz', drive: 18,   starve: 0,    rect: 1,    tone: 6500,  level: 0.85, mix: 0.90 },

    // ---- drum-kit specific ---------------------------------------------------
    snare:    { label: 'Snare Crack',      mode: 'od',   drive: 7,    starve: 0,    rect: 0,    tone: 9000,  level: 0.95, mix: 0.50 },
    hat:      { label: 'Hat Sizzle',       mode: 'od',   drive: 5,    starve: 0,    rect: 0,    tone: 16000, level: 0.9,  mix: 0.35 },
};
