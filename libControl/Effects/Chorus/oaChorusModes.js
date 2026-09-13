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
 * Header: oaChorusModes.js
 * Purpose: Every setting the width box has, and nothing else.
 * Description: Data, lifted out of oaChorus.js.
 *
 *   WHY THERE ARE TWELVE OF THEM AND STILL ONLY FOUR BUTTONS. The original has
 *   no knobs at all — four latching buttons and a bypass. What is easy to miss
 *   from photographs is that the buttons were meant to be pressed IN
 *   COMBINATION: singly they run from a gentle shimmer (1) to the deepest the
 *   box goes (4), and pressed together they add, giving a set of intermediate
 *   and extreme widths that no single button reaches. That is the whole reason a
 *   four-button box is worth twelve settings.
 *
 *   So a MODE here is a combination, and `buttons` lists which caps are down.
 *   The panel draws four buttons plus OFF, exactly as the hardware does, and
 *   pressing one toggles it into or out of the current combination — the table
 *   below is what that combination resolves to.
 *
 *   HOW THE COMBINATIONS ARE VOICED. Each button is a slightly different BBD
 *   delay and sweep. Pressing two together deepens the wet blend and widens the
 *   sweep without simply doubling either — two sweeps at different rates
 *   partially cancel, so the depth rises less than the sum and the RATE lands
 *   between the two. The values below follow that: the mix is roughly the larger
 *   plus half the smaller, the depth a little under the sum, and the rate the
 *   average pulled toward whichever button is deeper.
 *
 *   ORDER IS LOAD-BEARING. `unit.chorus` is stored per delay as an INDEX into
 *   this table, so entries 0 to 4 keep the meaning they shipped with — OFF and
 *   the four single buttons — and every combination is appended after them. A
 *   session saved on mode 3 still comes back on mode 3.
 *
 *   Loaded before oaChorus.js.
 */

window.OA_CHORUS_MODES = [
    // name/label as the panel shows them; `buttons` is which caps are down.
    // base   the nominal head distance (the BBD delay), seconds
    // rate   sweep speed, Hz          depth  peak sweep either side of base, s
    // mix    how much of the swept copy is cross-fed, and inverted on the right
    { name: 'OFF', label: 'Bypass', buttons: [],
      base: 0.0070, rate: 0,    depth: 0,       mix: 0 },

    // ---- the four buttons, alone -------------------------------------------
    { name: '1', label: 'Mode 1', buttons: [1],
      base: 0.0068, rate: 0.35, depth: 0.00018, mix: 0.32 },
    { name: '2', label: 'Mode 2', buttons: [2],
      base: 0.0072, rate: 0.42, depth: 0.00026, mix: 0.44 },
    { name: '3', label: 'Mode 3', buttons: [3],
      base: 0.0078, rate: 0.62, depth: 0.00040, mix: 0.58 },
    { name: '4', label: 'Mode 4', buttons: [4],
      base: 0.0085, rate: 0.88, depth: 0.00062, mix: 0.72 },

    // ---- pairs ---------------------------------------------------------------
    // 1+2: the two gentle ones. Wider than either, still nothing you can point
    // at — the setting to leave on a whole return and forget about.
    { name: '1+2', label: 'Modes 1+2', buttons: [1, 2],
      base: 0.0070, rate: 0.39, depth: 0.00034, mix: 0.53 },
    // 1+3: a shallow sweep under a deep one. The shallow copy fills the middle
    // the deep one leaves, so it reads as thickness rather than movement.
    { name: '1+3', label: 'Modes 1+3', buttons: [1, 3],
      base: 0.0074, rate: 0.52, depth: 0.00048, mix: 0.66 },
    // 1+4: the widest ratio available between two buttons.
    { name: '1+4', label: 'Modes 1+4', buttons: [1, 4],
      base: 0.0078, rate: 0.66, depth: 0.00070, mix: 0.78 },
    { name: '2+3', label: 'Modes 2+3', buttons: [2, 3],
      base: 0.0075, rate: 0.54, depth: 0.00054, mix: 0.72 },
    { name: '2+4', label: 'Modes 2+4', buttons: [2, 4],
      base: 0.0080, rate: 0.70, depth: 0.00076, mix: 0.84 },
    // 3+4: both deep buttons. As wide as a pair gets, and the point at which the
    // sweep starts to be audible AS a sweep on sustained material.
    { name: '3+4', label: 'Modes 3+4', buttons: [3, 4],
      base: 0.0083, rate: 0.78, depth: 0.00090, mix: 0.92 },

    // ---- three and four ------------------------------------------------------
    { name: '1+2+3', label: 'Modes 1+2+3', buttons: [1, 2, 3],
      base: 0.0074, rate: 0.50, depth: 0.00068, mix: 0.86 },
    { name: '2+3+4', label: 'Modes 2+3+4', buttons: [2, 3, 4],
      base: 0.0080, rate: 0.66, depth: 0.00098, mix: 0.96 },
    // Everything down. On the hardware this is the one that stops being width
    // and starts being an effect; the sweep is deep enough to hear as pitch on
    // anything held.
    { name: 'ALL', label: 'All Four', buttons: [1, 2, 3, 4],
      base: 0.0082, rate: 0.58, depth: 0.00120, mix: 1 },
];
