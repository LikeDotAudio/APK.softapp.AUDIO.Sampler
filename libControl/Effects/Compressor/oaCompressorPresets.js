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
 * Header: oaCompressorPresets.js
 * Purpose: The limiting amplifier's factory settings, and nothing else.
 * Description: Data, lifted out of oaCompressor.js.
 *
 *   READING THE NUMBERS. Two of these fields do not mean what they look like:
 *
 *     `input` IS THE THRESHOLD. The box has no threshold knob — the threshold is
 *     fixed at -24dB inside it and input drives the signal into it. A preset
 *     with input 20 is a preset that compresses hard, whatever else it says.
 *     `output` puts back what the squashing took away, which is why the two
 *     always move in opposite directions.
 *
 *     BOTH TIME KNOBS RUN BACKWARDS, like the original. 0 is fully
 *     counter-clockwise and SLOWEST (800µs attack, 1.1s release); 1 is fully
 *     clockwise and FASTEST (20µs, 50ms). A preset with attack 0.1 lets the
 *     whole transient through before it clamps; one with attack 0.95 catches the
 *     stick itself.
 *
 *   THE SETTINGS WORTH KNOWING, which most of these are built around:
 *
 *     The classic vocal setting is 4:1 with the attack around a quarter of its
 *     travel and the release around 60% — slow enough to keep the consonants,
 *     fast enough to catch the line. It is famous because it flatters almost
 *     anything, and it is `vocaltex` below.
 *
 *     ALL BUTTONS IN was a fault condition on the hardware — every ratio button
 *     pushed at once, the threshold collapsing, the knee smearing and the attack
 *     lagging behind itself. It is used on drum rooms, ambience mics and
 *     parallel busses, which is exactly what `smash`, `roomcrush` and
 *     `loopsmash` are.
 *
 *     Below 100% blend is parallel compression: the peaks are controlled and the
 *     transients survive underneath. On a drum machine that is usually the one
 *     you want.
 *
 *   Loaded before oaCompressor.js.
 */

window.OA_COMP_PRESETS = {
    // ---- off ----------------------------------------------------------------
    bypass:   { label: 'Bypass',            on: false, ratio: '4',   input: 0,  output: 0,  attack: 0.45, release: 0.50, mix: 1 },

    // ---- gentle: levelling that does not announce itself ---------------------
    gentle:   { label: 'Gentle Level',      on: true,  ratio: '4',   input: 4,  output: -2, attack: 0.30, release: 0.40, mix: 1 },
    glue:     { label: 'Glue',              on: true,  ratio: '4',   input: 6,  output: -3, attack: 0.25, release: 0.55, mix: 1 },
    busglue:  { label: 'Drum Bus Glue',     on: true,  ratio: '4',   input: 6,  output: -3, attack: 0.15, release: 0.70, mix: 1 },
    vocal:    { label: 'Vocal 4:1',         on: true,  ratio: '4',   input: 8,  output: -4, attack: 0.45, release: 0.50, mix: 1 },
    vocaltex: { label: 'Vocal Texture',     on: true,  ratio: '4',   input: 10, output: -5, attack: 0.25, release: 0.60, mix: 1 },
    ride:     { label: 'Vocal Ride',        on: true,  ratio: '8',   input: 9,  output: -5, attack: 0.40, release: 0.55, mix: 1 },

    // ---- transient work: the attack knob is the whole preset -----------------
    // Slow attack lets the stick through and clamps the body behind it, which is
    // how a compressor makes a drum hit HARDER instead of duller.
    punch:    { label: 'Drum Punch',        on: true,  ratio: '4',   input: 10, output: -5, attack: 0.10, release: 0.80, mix: 1 },
    keep:     { label: 'Transient Keep',    on: true,  ratio: '4',   input: 10, output: -5, attack: 0.00, release: 0.80, mix: 1 },
    kick:     { label: 'Kick Control',      on: true,  ratio: '4',   input: 8,  output: -4, attack: 0.05, release: 0.60, mix: 1 },
    // Fast attack catches the front of the hit and softens it.
    snap:     { label: 'Snap (fast atk)',   on: true,  ratio: '8',   input: 12, output: -6, attack: 0.95, release: 0.70, mix: 1 },
    snare:    { label: 'Snare Squash',      on: true,  ratio: '8',   input: 14, output: -7, attack: 0.80, release: 0.75, mix: 1 },
    perc:     { label: 'Perc Snap',         on: true,  ratio: '12',  input: 13, output: -6, attack: 0.85, release: 0.85, mix: 0.8 },
    hat:      { label: 'Hat Tame',          on: true,  ratio: '12',  input: 6,  output: -3, attack: 0.90, release: 0.95, mix: 0.7 },

    // ---- firm: you can hear it working, and that is the point ----------------
    bass:     { label: 'Bass Steady',       on: true,  ratio: '4',   input: 12, output: -6, attack: 0.35, release: 0.45, mix: 1 },
    firm:     { label: 'Firm 8:1',          on: true,  ratio: '8',   input: 12, output: -6, attack: 0.50, release: 0.60, mix: 1 },
    pump:     { label: 'Pumping 8ths',      on: true,  ratio: '8',   input: 16, output: -8, attack: 0.95, release: 0.25, mix: 1 },
    heavy:    { label: 'Heavy 12:1',        on: true,  ratio: '12',  input: 14, output: -7, attack: 0.70, release: 0.65, mix: 1 },

    // ---- limiting: a ceiling the signal cannot cross -------------------------
    limit:    { label: 'Peak Limit',        on: true,  ratio: '20',  input: 4,  output: 0,  attack: 1.00, release: 0.85, mix: 1 },
    safety:   { label: 'Safety Limit',      on: true,  ratio: '20',  input: 2,  output: 0,  attack: 1.00, release: 0.90, mix: 1 },
    squeeze:  { label: 'Squeeze Everything',on: true,  ratio: '20',  input: 20, output: -9, attack: 1.00, release: 1.00, mix: 1 },

    // ---- parallel: peaks held, transients intact underneath ------------------
    parallel: { label: 'Parallel Crush',    on: true,  ratio: '20',  input: 22, output: -8, attack: 0.85, release: 0.90, mix: 0.45 },
    parroom:  { label: 'Parallel Room',     on: true,  ratio: '20',  input: 24, output: -10,attack: 0.90, release: 0.90, mix: 0.30 },
    parglue:  { label: 'Parallel Glue',     on: true,  ratio: '8',   input: 14, output: -6, attack: 0.30, release: 0.70, mix: 0.55 },

    // ---- all buttons in: every ratio at once, which was a fault ---------------
    smash:    { label: 'All Buttons In',    on: true,  ratio: 'all', input: 16, output: -9, attack: 0.75, release: 0.95, mix: 1 },
    roomcrush:{ label: 'Room Mic Crush',    on: true,  ratio: 'all', input: 20, output: -10,attack: 0.60, release: 0.90, mix: 1 },
    loopsmash:{ label: 'Loop Smash',        on: true,  ratio: 'all', input: 18, output: -9, attack: 0.70, release: 0.80, mix: 0.6 },
};
