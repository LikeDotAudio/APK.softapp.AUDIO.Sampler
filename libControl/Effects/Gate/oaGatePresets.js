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
 * Header: oaGatePresets.js
 * Purpose: The noise gate's factory settings, and nothing else.
 * Description: Data, kept out of oaGate.js the way the compressor's presets are.
 *
 *   READING THE NUMBERS. Times are MILLISECONDS and levels are DECIBELS — both
 *   knobs mean exactly what they say here, unlike the limiting amplifier's two
 *   backwards time controls. Three fields decide whether a setting chatters:
 *
 *     `hold`  how long the gate stays open after the signal has fallen through
 *             the closing threshold. It has to outlast one cycle of the lowest
 *             frequency the channel carries, because a peak detector reading a
 *             40 Hz sine sees a zero crossing every 12.5 ms. Kick and bass want
 *             80-120 ms; a hat can live on 20.
 *
 *     `hyst`  how far BELOW the opening threshold the closing one sits. This is
 *             what stops a signal parked on the line from opening and shutting
 *             on its own noise: at 3 dB the gate will not close until the
 *             channel has genuinely dropped away.
 *
 *     `range` how far down a shut gate turns the channel, and 0 dB IS A WIRE.
 *             A gate that slams to silence announces itself on every tail; -12
 *             to -24 dB ducks the spill without cutting a room off mid-decay,
 *             which is what most of these use.
 *
 *   `ratio` is the slope below the threshold — 1 is no expansion at all and 20
 *   is effectively a switch. The gates worth the name sit between 4 and 12; the
 *   hard settings here are for tightening a loop, not for a live channel.
 *
 *   Loaded before oaGate.js.
 */

window.OA_GATE_PRESETS = {
    // ---- off ----------------------------------------------------------------
    bypass:  { label: 'Bypass',           on: false, thresh: -40, range: 0,   ratio: 8,  knee: 6, hyst: 3, attack: 1.0,  hold: 40,  release: 200 },

    // ---- ducking, not cutting: the settings that do not announce themselves --
    tidy:    { label: 'Tidy Up',          on: true,  thresh: -52, range: -12, ratio: 4,  knee: 9, hyst: 4, attack: 3.0,  hold: 80,  release: 300 },
    room:    { label: 'Room Duck',        on: true,  thresh: -46, range: -14, ratio: 4,  knee: 9, hyst: 5, attack: 5.0,  hold: 120, release: 400 },
    breath:  { label: 'Breath Control',   on: true,  thresh: -44, range: -10, ratio: 3,  knee: 12,hyst: 4, attack: 8.0,  hold: 150, release: 350 },

    // ---- drums: the attack knob is the whole preset --------------------------
    // A gate that opens slowly clips the front off a stick hit, which is the one
    // thing a drum channel cannot afford. These all open in well under a
    // millisecond and spend their time on the hold instead.
    kick:    { label: 'Kick Tighten',     on: true,  thresh: -34, range: -30, ratio: 10, knee: 4, hyst: 4, attack: 0.3,  hold: 110, release: 180 },
    snare:   { label: 'Snare Tighten',    on: true,  thresh: -32, range: -26, ratio: 10, knee: 4, hyst: 4, attack: 0.2,  hold: 60,  release: 140 },
    tom:     { label: 'Tom Spill',        on: true,  thresh: -38, range: -20, ratio: 8,  knee: 6, hyst: 5, attack: 0.5,  hold: 90,  release: 260 },
    hat:     { label: 'Hat Chatter Free', on: true,  thresh: -42, range: -18, ratio: 6,  knee: 6, hyst: 6, attack: 0.1,  hold: 25,  release: 90 },

    // ---- expansion: a slope, not a switch ------------------------------------
    expand:  { label: 'Gentle Expand',    on: true,  thresh: -48, range: -8,  ratio: 2,  knee: 12,hyst: 3, attack: 4.0,  hold: 60,  release: 300 },
    depth:   { label: 'Add Depth',        on: true,  thresh: -50, range: -16, ratio: 3,  knee: 12,hyst: 3, attack: 6.0,  hold: 100, release: 500 },

    // ---- hard: for tightening a loop, not for a live channel -----------------
    tight:   { label: 'Hard Gate',        on: true,  thresh: -30, range: -60, ratio: 16, knee: 1, hyst: 6, attack: 0.1,  hold: 50,  release: 80 },
    stutter: { label: 'Stutter Cut',      on: true,  thresh: -24, range: -80, ratio: 20, knee: 0, hyst: 2, attack: 0.05, hold: 10,  release: 20 },
    // The one that shows what the hold knob is FOR: everything else is a good
    // setting, this is the same gate with the hold and the hysteresis taken
    // away. On anything sustained it chatters, audibly, which is the point.
    nohold:  { label: 'No Hold (chatters)', on: true, thresh: -30, range: -60, ratio: 16, knee: 0, hyst: 0, attack: 0.05, hold: 0, release: 20 },
};
