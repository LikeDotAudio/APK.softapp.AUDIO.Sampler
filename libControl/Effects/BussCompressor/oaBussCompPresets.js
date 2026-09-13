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
 * Header: oaBussCompPresets.js
 * Purpose: The master buss compressor's factory settings, and nothing else.
 * Description: Data, kept out of oaBussComp.js.
 *
 *   READING THE NUMBERS. Four of these fields are POSITIONS on a stepped pot,
 *   not values, because that is what the hardware has. The tables they index
 *   live in oaBussComp.js; here is what the numbers mean:
 *
 *     ratio    0…10 →  1.3  1.5  2  3  4  5  10  20  -2.5  -1.5  -0.5
 *              Everything from 8 up is a NEGATIVE ratio: past the threshold the
 *              output goes DOWN as the input goes up. Two of the settings below
 *              use them on purpose.
 *
 *     attack   0…9  →  .1  .3  1  3  6  10  15  20  30  40   (ms)
 *              A LOW number is a FAST attack, which catches the transient and
 *              softens it. The punchy settings are all at the top of this list.
 *
 *     release  0…10 →  .05 .1 .15 .2 .3 .4 .6 .8 1.2  AUTO  AUTO 2
 *              9 is AUTO and is where most of these sit. It is two time
 *              constants at once — 100 ms for transients, 12 s for the bed
 *              underneath — which no single position can do.
 *
 *     sc       the side-chain high-pass, in Hz. 0 is OUT.
 *
 *   THE SETTINGS WORTH KNOWING, which most of these are built around:
 *
 *     THE CLASSIC is 4:1, attack slowish, release AUTO, threshold pulled down
 *     until the meter shows two or three dB. That is `glue`, and it is what
 *     "sounds like a record" means when people say it about this box. More than
 *     four dB on a mix bus is usually a decision rather than an accident.
 *
 *     A SLOW ATTACK IS WHAT MAKES IT PUNCHIER. Let the front of the hit through
 *     untouched and clamp only the body behind it, and the transient ends up
 *     LOUDER relative to everything else than it was before compression.
 *     `punch` and `smack` are that, at 30 and 40 ms.
 *
 *     THE SIDE-CHAIN FILTER IS NOT OPTIONAL ON MODERN MATERIAL. A record with
 *     real sub-bass drives a full-band detector from the kick alone, and the
 *     whole mix ducks in time with it. Every setting here that expects bass has
 *     `sc` up around 60–120 Hz.
 *
 *     NEGATIVE RATIOS are the modern addition. `pump` and `slam` use them: at
 *     -1.5:1 a signal over the threshold is pushed BELOW it, so loud material
 *     digs a hole in the mix and everything else swells into it. Musical on a
 *     dance record, a disaster on a ballad.
 *
 *   Loaded before oaBussComp.js.
 */

window.OA_BUSS_PRESETS = {
    // ---- glue: two or three dB, and the mix stops sounding like a stack ------
    glue:      { label: 'Mix Glue (4:1 auto)',    on: true,  thresh: -4,  ratio: 4,  attack: 8, release: 9,  makeup: 2,   sc: 60,  mix: 1,    trim: 0, rate: 20, dist: 5 },
    gentle:    { label: 'Gentle 2:1',             on: true,  thresh: -2,  ratio: 2,  attack: 5, release: 9,  makeup: 1.5, sc: 40,  mix: 1,    trim: 0, rate: 20, dist: 5 },
    softglue:  { label: 'Soft Glue (1.5:1)',      on: true,  thresh: -6,  ratio: 1,  attack: 6, release: 9,  makeup: 1,   sc: 60,  mix: 1,    trim: 0, rate: 20, dist: 5 },
    mastering: { label: 'Mastering Touch',        on: true,  thresh: 2,   ratio: 0,  attack: 8, release: 9,  makeup: 0.5, sc: 40,  mix: 1,    trim: 0, rate: 30, dist: 5, lowThd: true },

    // ---- punch: a slow attack lets the transient out in front ----------------
    punch:     { label: 'Punch (30ms attack)',    on: true,  thresh: -6,  ratio: 4,  attack: 8, release: 4,  makeup: 3,   sc: 80,  mix: 1,    trim: 0, rate: 20, dist: 5 },
    smack:     { label: 'Drum Bus Smack',         on: true,  thresh: -9,  ratio: 5,  attack: 9, release: 2,  makeup: 4,   sc: 100, mix: 1,    trim: 0, rate: 20, dist: 5 },
    snap:      { label: 'Snap (fast, 10:1)',      on: true,  thresh: -8,  ratio: 6,  attack: 0, release: 1,  makeup: 4,   sc: 90,  mix: 1,    trim: 0, rate: 20, dist: 5 },

    // ---- control: hold the peaks and nothing else ---------------------------
    grab:      { label: 'Grab It (10:1)',         on: true,  thresh: -10, ratio: 6,  attack: 0, release: 1,  makeup: 5,   sc: 100, mix: 1,    trim: 0, rate: 20, dist: 5 },
    ceiling:   { label: 'Ceiling (20:1)',         on: true,  thresh: -3,  ratio: 7,  attack: 0, release: 0,  makeup: 1,   sc: 120, mix: 1,    trim: 0, rate: 20, dist: 5 },

    // ---- parallel: peaks held, transients alive underneath ------------------
    parallel:  { label: 'Parallel Squash',        on: true,  thresh: -16, ratio: 7,  attack: 0, release: 0,  makeup: 0,   sc: 120, mix: 0.4,  trim: 0, rate: 20, dist: 5, parallel: true },
    nypar:     { label: 'New York Blend',         on: true,  thresh: -14, ratio: 6,  attack: 1, release: 1,  makeup: 2,   sc: 90,  mix: 0.55, trim: 0, rate: 20, dist: 5, parallel: true },

    // ---- character: the two switches the later revisions added -------------
    grit:      { label: '44K Grit',                on: true,  thresh: -5,  ratio: 4,  attack: 5, release: 10, makeup: 2,   sc: 50,  mix: 1,    trim: 0, rate: 20, dist: 7, fourK: true },
    thick:     { label: '44K Thickener',           on: true,  thresh: -3,  ratio: 3,  attack: 6, release: 9,  makeup: 1.5, sc: 60,  mix: 1,    trim: 0, rate: 20, dist: 4, fourK: true },
    relaxed:   { label: 'Relaxed (F/B)',          on: true,  thresh: -6,  ratio: 3,  attack: 6, release: 9,  makeup: 2,   sc: 70,  mix: 1,    trim: 0, rate: 20, dist: 5, fb: true, lowThd: true },
    clean:     { label: 'Clean Bottom (LOW THD)', on: true,  thresh: -7,  ratio: 4,  attack: 4, release: 1,  makeup: 2.5, sc: 30,  mix: 1,    trim: 0, rate: 20, dist: 5, lowThd: true },
    centre:    { label: 'Centre Focus (Σ S/C)',   on: true,  thresh: -6,  ratio: 4,  attack: 7, release: 9,  makeup: 2,   sc: 80,  mix: 1,    trim: 0, rate: 20, dist: 5, scSum: true },

    // ---- negative ratios: the output goes down as the input goes up ---------
    pump:      { label: 'Pump (-1.5:1)',          on: true,  thresh: -8,  ratio: 9,  attack: 2, release: 1,  makeup: 0,   sc: 90,  mix: 0.7,  trim: 0, rate: 20, dist: 5 },
    slam:      { label: 'Slam (-0.5:1)',          on: true,  thresh: -12, ratio: 10, attack: 0, release: 0,  makeup: 0,   sc: 110, mix: 0.5,  trim: 0, rate: 20, dist: 6, parallel: true },

    // ---- out ----------------------------------------------------------------
    bypass:    { label: 'Out Of Circuit',         on: false, thresh: 0,   ratio: 4,  attack: 5, release: 9,  makeup: 0,   sc: 0,   mix: 1,    trim: 0, rate: 20, dist: 5 },
};
