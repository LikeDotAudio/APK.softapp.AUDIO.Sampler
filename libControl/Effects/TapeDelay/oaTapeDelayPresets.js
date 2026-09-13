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
 * Header: oaTapeDelayPresets.js
 * Purpose: The tape machine's factory settings, and nothing else.
 * Description: Data, lifted out of oaTapeDelay.js. Every entry is a full set of
 *   the seven tape parameters; applying one walks them through oaSetDelay() a
 *   parameter at a time, so each is clamped and each takes its head off the grid.
 *
 *   WHERE THE HEAD TIMES COME FROM. The machine this models has no delay-time
 *   knob at all — it has THREE PLAYBACK HEADS at fixed distances down the tape
 *   and a twelve-position selector that switches between them and their
 *   combinations (four echo-only, seven echo-plus-reverb, one reverb alone). The
 *   spacing is roughly 1 : 2 : 3, and almost every echo anyone remembers off that
 *   box is one of those combinations at a different tape speed.
 *
 *   This has two heads rather than three — left and right — so a combination
 *   becomes a PAIR of head times, and the ratio between them is the thing worth
 *   copying:
 *
 *     1:1     both heads together. A single hard slap, mono-centred.
 *     1:1.5   the classic tape-echo spread. Wide, and the repeats interleave.
 *     1:2     ping-pong. Every other repeat lands on the other side.
 *     1:3     the widest the original could do, heads 1 and 3 together.
 *
 *   The four the units boot with (slap, tape, space, dub) keep their keys,
 *   because OA_DELAY_UNITS names them and a saved song can too.
 *
 *   Loaded before oaTapeDelay.js, which reads this at load time to build the
 *   four machines' starting state.
 */

window.OA_DELAY_PRESETS = {
    // ---- the four the machines boot with ----------------------------------
    slap:    { label: 'Slapback',      timeL: 0.085, timeR: 0.115, feedback: 0.18, drive: 1.6, wowRate: 0.7,  wowDepth: 0.0012, damp: 7000 },
    tape:    { label: 'Tape Echo',     timeL: 0.28,  timeR: 0.42,  feedback: 0.45, drive: 1.9, wowRate: 0.9,  wowDepth: 0.0030, damp: 5000 },
    space:   { label: 'Space',         timeL: 0.50,  timeR: 0.75,  feedback: 0.62, drive: 2.3, wowRate: 0.45, wowDepth: 0.0050, damp: 3400 },
    dub:     { label: 'Dub Sink',      timeL: 0.75,  timeR: 1.00,  feedback: 0.82, drive: 3.0, wowRate: 0.30, wowDepth: 0.0080, damp: 2200 },
    warble:  { label: 'Warble',        timeL: 0.20,  timeR: 0.20,  feedback: 0.30, drive: 2.6, wowRate: 3.40, wowDepth: 0.0120, damp: 4200 },
    oscillate:{label: 'Runaway',       timeL: 0.34,  timeR: 0.51,  feedback: 1.02, drive: 2.0, wowRate: 0.6,  wowDepth: 0.0040, damp: 3000 },

    // ---- the head combinations, at tape speed -----------------------------
    // Head 1 alone: the shortest tap on the machine. Doubling rather than echo.
    head1:   { label: 'Head 1',        timeL: 0.075, timeR: 0.075, feedback: 0.28, drive: 1.7, wowRate: 0.8,  wowDepth: 0.0018, damp: 6500 },
    // Heads 1+2 — the 1:2 spread that reads as ping-pong on a stereo return.
    head12:  { label: 'Heads 1+2',     timeL: 0.075, timeR: 0.150, feedback: 0.38, drive: 1.8, wowRate: 0.75, wowDepth: 0.0026, damp: 5600 },
    // Heads 2+3, the middle pair: longer, and closer together, so the repeats
    // bunch up rather than alternating.
    head23:  { label: 'Heads 2+3',     timeL: 0.150, timeR: 0.225, feedback: 0.46, drive: 2.0, wowRate: 0.6,  wowDepth: 0.0032, damp: 4600 },
    // All three: the widest ratio the box does, and the densest.
    head123: { label: 'All Three Heads',timeL: 0.075, timeR: 0.225, feedback: 0.54, drive: 2.2, wowRate: 0.55, wowDepth: 0.0038, damp: 4200 },

    // ---- short: doubling and slap -----------------------------------------
    // Under ~40ms the ear stops hearing a repeat and starts hearing one thicker
    // source. Feedback has to stay near zero or it combs.
    double:  { label: 'Doubler',       timeL: 0.028, timeR: 0.045, feedback: 0.05, drive: 1.4, wowRate: 0.85, wowDepth: 0.0008, damp: 9000 },
    rocka:   { label: 'Rockabilly Slap',timeL: 0.105,timeR: 0.105, feedback: 0.12, drive: 2.2, wowRate: 0.65, wowDepth: 0.0016, damp: 6000 },
    tight:   { label: 'Tight Room Slap',timeL: 0.055,timeR: 0.080, feedback: 0.22, drive: 1.5, wowRate: 1.10, wowDepth: 0.0010, damp: 8200 },

    // ---- mid: the working echoes ------------------------------------------
    pingpong:{ label: 'Ping Pong',     timeL: 0.250, timeR: 0.500, feedback: 0.50, drive: 1.8, wowRate: 0.5,  wowDepth: 0.0022, damp: 6000 },
    triplet: { label: 'Triplet Trail', timeL: 0.200, timeR: 0.300, feedback: 0.55, drive: 2.1, wowRate: 0.7,  wowDepth: 0.0034, damp: 4800 },
    bloom:   { label: 'Wide Bloom',    timeL: 0.380, timeR: 0.560, feedback: 0.60, drive: 2.4, wowRate: 0.4,  wowDepth: 0.0060, damp: 3800 },
    worn:    { label: 'Worn Tape',     timeL: 0.320, timeR: 0.470, feedback: 0.52, drive: 2.8, wowRate: 0.5,  wowDepth: 0.0090, damp: 2600 },

    // ---- long: the ones that become the arrangement ------------------------
    darkdub: { label: 'Dark Dub',      timeL: 0.600, timeR: 0.900, feedback: 0.78, drive: 3.2, wowRate: 0.25, wowDepth: 0.0075, damp: 1600 },
    wash:    { label: 'Ambient Wash',  timeL: 1.200, timeR: 1.600, feedback: 0.70, drive: 2.6, wowRate: 0.20, wowDepth: 0.0100, damp: 2000 },
    cavern:  { label: 'Long Bloom',    timeL: 1.500, timeR: 2.000, feedback: 0.68, drive: 2.4, wowRate: 0.15, wowDepth: 0.0110, damp: 2400 },

    // ---- broken on purpose -------------------------------------------------
    // Flutter deep enough and fast enough that the pitch of every repeat is
    // audibly wrong. The tape is not damaged; it is being driven at the end of
    // every control it has.
    wobble:  { label: 'Sci-Fi Wobble', timeL: 0.180, timeR: 0.260, feedback: 0.58, drive: 3.4, wowRate: 5.50, wowDepth: 0.0160, damp: 3600 },
    chew:    { label: 'Chewed Tape',   timeL: 0.240, timeR: 0.240, feedback: 0.66, drive: 4.2, wowRate: 7.20, wowDepth: 0.0190, damp: 1800 },
};
