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
 * Header: oaReverbPrograms.js
 * Purpose: Every stored program for the VARC 444, and nothing else.
 * Description: Data, lifted out of oaReverb.js so the machine and its factory
 *   library can be changed independently. A program is nothing but a full set of
 *   the parameters declared in oaReverb.js — loading one overwrites every slider
 *   at once — so this file has no logic in it at all beyond the P() shorthand.
 *
 *   HOW THE LIBRARY IS ORGANISED, AND WHY IT IS SHAPED LIKE THIS. The machine is
 *   addressed the way its hardware ancestor is addressed: banks of up to TEN
 *   programs, loaded by number on a ten-key pad. That is the whole reason for the
 *   layout — the keypad has ten keys, so a bank holds ten programs, and a bank
 *   with four entries leaves six dead keys. The original shipped ten banks of
 *   ten; this now holds eleven, grouped the way that class of machine groups
 *   them: the algorithm first (rooms, plates, chambers, random spaces), then what
 *   the program is FOR (concert halls, post-production spaces, effects).
 *
 *   ORDER IS LOAD-BEARING, IN TWO PLACES.
 *
 *     A program is addressed by (bank, program) — a song file, a saved unit and
 *     the LEGACY table in oaReverb.js all store those two numbers. Reordering a
 *     bank, or inserting one before the end, silently repoints every session
 *     anyone has saved at a different room.
 *
 *     So: NEW PROGRAMS ARE APPENDED TO THE END OF THEIR BANK, AND NEW BANKS ARE
 *     APPENDED TO THE END OF THE LIST. The first seven banks below are in the
 *     order they shipped in, with their original programs first and the newer
 *     ones after; banks 8 to 11 are new.
 *
 *   Loaded before oaReverb.js, which reads OA_REVERB_BANKS at load time to build
 *   the two machines' starting state.
 */

/**
 * One program's parameters, in the order the sliders are laid out over the two
 * pages. Positional rather than named because a bank reads as a TABLE — the
 * columns line up down the file, and a program whose reverb time is out of
 * character with its neighbours is visible at a glance.
 *
 *   rtMid     reverb time, seconds        shape     buildup contour, 0-255
 *   spread    buildup length, 0-255       size      room dimension, 4-39 m
 *   hfCut     air absorption, Hz          preDelay  ms before the room answers
 *   diffusion smear, 0-255                rtLow     bass decay multiplier
 *   xover     bass/mid crossover, Hz      erLevel   early reflection level, 0-1
 *   erTime    early pattern stretch
 */
const P = function (rtMid, shape, spread, size, hfCut, preDelay, diffusion, rtLow, xover, erLevel, erTime) {
    return { rtMid, shape, spread, size, hfCut, preDelay, diffusion, rtLow, xover, erLevel, erTime };
};

window.OA_REVERB_BANKS = [
    {
        // Halls with random delay elements in the tail — the algorithm that made
        // this class of machine famous. Long, slightly unstable, never metallic.
        name: 'RANDOM HALLS',
        programs: [
            { name: 'SMALL RAND HALL',  p: P(1.30,  90, 100, 18,  6800,  12, 170, 1.20, 500, 0.34, 1.00) },
            { name: 'MEDIUM RAND HALL', p: P(2.065, 120, 127, 30,  3400,   0, 190, 1.35, 480, 0.30, 1.00) },
            { name: 'LARGE RAND HALL',  p: P(3.40,  150, 170, 38,  4200,  24, 210, 1.50, 420, 0.26, 1.20) },
            { name: 'RICH HALL',        p: P(2.80,  175, 190, 34,  5600,  32, 230, 1.60, 380, 0.22, 1.10) },
            { name: 'GOTHIC HALL',      p: P(5.60,  200, 220, 39,  2600,  40, 240, 1.90, 300, 0.18, 1.40) },
            { name: 'WARM RAND HALL',   p: P(2.40,  140, 150, 30,  3000,  20, 200, 1.55, 420, 0.28, 1.05) },
            { name: 'BRIGHT RAND HALL', p: P(2.20,  110, 120, 28,  9500,  16, 195, 1.10, 520, 0.32, 1.00) },
            { name: 'DEEP RAND HALL',   p: P(4.20,  165, 185, 36,  2400,  34, 220, 2.10, 300, 0.22, 1.30) },
            { name: 'SLOW SWELL HALL',  p: P(3.10,  235, 245, 34,  4600,  48, 225, 1.45, 380, 0.12, 1.60) },
            { name: 'VOCAL RAND HALL',  p: P(1.85,  125, 130, 26,  8200,  26, 205, 1.15, 500, 0.24, 0.95) },
        ],
    },
    {
        // Plain halls: the same shapes without the random element, so they sit
        // still. What you reach for when the tail must not draw attention.
        name: 'HALLS',
        programs: [
            { name: 'SMALL HALL',       p: P(1.10,  70,  70, 16,  8200,   8, 150, 1.10, 560, 0.40, 0.90) },
            { name: 'MEDIUM HALL',      p: P(1.90, 100, 110, 26,  6400,  18, 175, 1.25, 500, 0.34, 1.00) },
            { name: 'LARGE HALL',       p: P(2.90, 130, 150, 34,  5200,  28, 200, 1.40, 440, 0.28, 1.15) },
            { name: 'CONCERT HALL',     p: P(2.40, 145, 165, 32,  7000,  35, 215, 1.30, 420, 0.24, 1.10) },
            { name: 'CHURCH',           p: P(4.80, 185, 205, 39,  3200,  45, 235, 1.75, 340, 0.20, 1.30) },
            { name: 'VOCAL HALL',       p: P(1.70, 110, 120, 24,  9000,  22, 205, 1.05, 520, 0.26, 0.95) },
            { name: 'ORCHESTRA HALL',   p: P(2.60, 150, 160, 33,  6000,  30, 210, 1.35, 430, 0.26, 1.10) },
            { name: 'JAZZ HALL',        p: P(1.45,  95, 100, 22,  7400,  14, 185, 1.15, 520, 0.36, 0.95) },
            { name: 'RECITAL HALL',     p: P(2.10, 120, 125, 28,  8600,  20, 195, 1.20, 480, 0.30, 1.00) },
            { name: 'OPERA HOUSE',      p: P(3.20, 160, 175, 36,  5400,  34, 220, 1.45, 400, 0.24, 1.20) },
        ],
    },
    {
        // Denser algorithm, shorter times: four walls close enough that the early
        // reflections are most of what you hear.
        name: 'ROOMS',
        programs: [
            { name: 'SMALL ROOM',       p: P(0.42,  30,  25,  8, 10000,   4, 120, 0.90, 700, 0.62, 0.70) },
            { name: 'MEDIUM ROOM',      p: P(0.72,  50,  45, 13,  8600,   8, 145, 0.95, 640, 0.54, 0.80) },
            { name: 'LARGE ROOM',       p: P(1.15,  70,  70, 20,  7200,  14, 165, 1.05, 580, 0.46, 0.90) },
            { name: 'BRIGHT ROOM',      p: P(0.80,  45,  40, 14, 16000,   6, 150, 0.75, 700, 0.55, 0.80) },
            { name: 'DARK ROOM',        p: P(0.95,  60,  55, 16,  1800,  10, 160, 1.60, 400, 0.50, 0.85) },
            { name: 'TILED ROOM',       p: P(1.05,  25,  20, 12, 18000,   5,  70, 0.85, 700, 0.85, 0.65) },
            { name: 'WOOD ROOM',        p: P(0.85,  55,  50, 15,  6400,   9, 155, 1.15, 560, 0.58, 0.85) },
            { name: 'LIVE ROOM',        p: P(1.30,  75,  80, 22,  9000,  12, 170, 1.00, 600, 0.50, 0.95) },
            { name: 'STONE ROOM',       p: P(1.55,  65,  60, 24,  4200,  16, 130, 1.45, 460, 0.60, 1.00) },
            { name: 'DEAD ROOM',        p: P(0.30,  20,  18,  7,  5200,   3, 110, 0.85, 640, 0.68, 0.65) },
        ],
    },
    {
        // A steel plate has no walls, so there are no early reflections to speak
        // of and the diffusion is nearly total from the first millisecond. That
        // is why every program here runs erLevel low and diffusion near maximum.
        name: 'PLATES',
        programs: [
            { name: 'SMALL PLATE',      p: P(0.85,  10,   8, 10, 11000,   6, 245, 0.80, 700, 0.10, 0.60) },
            { name: 'MEDIUM PLATE',     p: P(1.60,  14,  12, 14, 10000,  10, 250, 0.85, 640, 0.08, 0.60) },
            { name: 'LARGE PLATE',      p: P(2.60,  18,  16, 18,  9000,  14, 252, 0.90, 600, 0.06, 0.65) },
            { name: 'VOCAL PLATE',      p: P(1.90,  20,  18, 15, 12000,  20, 250, 0.80, 620, 0.06, 0.60) },
            { name: 'DRUM PLATE',       p: P(1.20,   8,   6, 12,  7600,   2, 248, 0.95, 660, 0.14, 0.55) },
            { name: 'BRIGHT PLATE',     p: P(2.00,  16,  14, 16, 16000,   8, 251, 0.70, 700, 0.06, 0.60) },
            { name: 'DARK PLATE',       p: P(2.30,  16,  14, 17,  4200,  12, 250, 1.30, 520, 0.06, 0.60) },
            { name: 'SNARE PLATE',      p: P(1.05,   6,   5, 11,  8600,   4, 249, 0.90, 680, 0.12, 0.55) },
            { name: 'PERC PLATE',       p: P(0.70,   6,   4,  9, 12000,   2, 246, 0.80, 700, 0.16, 0.50) },
            { name: 'LONG PLATE',       p: P(4.50,  22,  20, 22,  7000,  18, 253, 0.95, 580, 0.05, 0.70) },
        ],
    },
    {
        // Spaces that could not be built. Sizes at the end stop, bass multiply
        // far past 1, and pre-delays long enough to hear as distance.
        name: 'WILD SPACES',
        programs: [
            { name: 'CANYON',           p: P(7.50, 210, 240, 39,  4000, 120, 180, 1.80, 320, 0.45, 2.60) },
            { name: 'CAVERN',           p: P(6.20, 230, 250, 39,  1600,  80, 215, 2.40, 260, 0.35, 2.00) },
            { name: 'TUNNEL',           p: P(3.60,  60,  90, 22,  2800,  30,  90, 2.00, 300, 0.72, 1.80) },
            { name: 'INSIDE A PIPE',    p: P(2.20,  20,  30, 10,  3600,   8,  40, 2.80, 280, 0.90, 0.90) },
            { name: 'THE ABYSS',        p: P(11.0, 250, 255, 39,  1200, 200, 250, 3.20, 220, 0.12, 3.00) },
            { name: 'STAIRWELL',        p: P(2.80,  40,  70, 16,  5200,  20, 120, 1.70, 380, 0.66, 1.40) },
            { name: 'GRAIN SILO',       p: P(5.40,  90, 140, 30,  2000,  45, 150, 2.60, 280, 0.55, 2.20) },
            { name: 'ICE CAVE',         p: P(4.60, 180, 200, 34, 12000,  60, 200, 1.20, 340, 0.30, 1.80) },
            { name: 'GLASS HALL',       p: P(3.20, 120, 130, 26, 18000,  24, 175, 0.70, 620, 0.40, 1.30) },
            { name: 'THE WELL',         p: P(6.80, 200, 230, 12,  1400,  90, 230, 3.00, 240, 0.28, 1.10) },
        ],
    },
    {
        // Short enough that you hear the SPACE without hearing a reverb. These
        // are the ones you print on a dry track to stop it sounding synthetic.
        name: 'AMBIENCE',
        programs: [
            { name: 'SMALL AMBIENCE',   p: P(0.28,  20,  14,  6, 13000,   2, 175, 0.85, 700, 0.70, 0.60) },
            { name: 'STUDIO',           p: P(0.45,  35,  28, 10, 11000,   5, 190, 0.90, 660, 0.60, 0.70) },
            { name: 'STAGE',            p: P(0.95,  80,  75, 20,  8000,  16, 200, 1.10, 560, 0.48, 1.00) },
            { name: 'DRUM BOOTH',       p: P(0.34,  15,  10,  7,  9500,   1, 140, 1.00, 700, 0.78, 0.55) },
            { name: 'TIGHT AMBIENCE',   p: P(0.22,  12,   8,  5, 14000,   1, 160, 0.80, 700, 0.80, 0.50) },
            { name: 'ROOM TONE',        p: P(0.38,  28,  22,  8, 10000,   3, 180, 0.90, 660, 0.66, 0.65) },
            { name: 'CLUB STAGE',       p: P(1.20,  90,  85, 22,  7000,  18, 195, 1.20, 540, 0.44, 1.05) },
            { name: 'ARENA AIR',        p: P(2.60, 140, 150, 34,  5000,  40, 210, 1.50, 420, 0.30, 1.50) },
            { name: 'CORRIDOR',         p: P(0.85,  45,  60, 14,  6000,  12, 120, 1.30, 500, 0.70, 1.20) },
            { name: 'VOCAL AIR',        p: P(0.55,  40,  34, 12, 13000,   6, 200, 0.85, 640, 0.52, 0.70) },
        ],
    },
    {
        // Programs that are not trying to be a room. Shape at the top of its
        // range inverts the envelope; diffusion at the bottom leaves bare slaps.
        name: 'EFFECTS',
        programs: [
            { name: 'GATED',            p: P(0.50, 255, 235, 22,  8500,   6, 240, 1.00, 600, 0.20, 0.90) },
            { name: 'REVERSE',          p: P(0.90, 255, 255, 28,  9500,  10, 250, 1.00, 560, 0.05, 1.00) },
            { name: 'NONLIN',           p: P(0.60, 240, 200, 18,  7000,   4, 230, 1.00, 600, 0.25, 0.80) },
            { name: 'SLAP CHAMBER',     p: P(1.10,  12,  60, 24,  6200,  70,  55, 1.10, 580, 0.95, 1.60) },
            { name: 'REVERSE LONG',     p: P(1.80, 255, 255, 34,  8000,  14, 250, 1.00, 520, 0.04, 1.40) },
            { name: 'SHORT GATE',       p: P(0.30, 255, 210, 16,  9000,   2, 235, 1.00, 640, 0.24, 0.70) },
            { name: 'SPRING',           p: P(1.60,  30,  45,  8,  4600,   4,  60, 0.60, 900, 0.80, 0.70) },
            { name: 'TIN CAN',          p: P(0.90,  15,  25,  6,  3200,   3,  35, 0.50, 1200, 0.95, 0.60) },
            { name: 'DOUBLER',          p: P(0.35,   8,  12, 10, 11000,  45,  45, 1.00, 700, 0.98, 0.90) },
            { name: 'INFINITE',         p: P(12.0, 200, 240, 39,  6000,  20, 252, 1.00, 500, 0.08, 1.60) },
        ],
    },
    {
        // A chamber is a real room built to be recorded in — hard walls, a
        // speaker at one end and a pair of mics at the other. Denser than a hall
        // and shorter, but with far more early energy than a plate.
        name: 'CHAMBERS',
        programs: [
            { name: 'SMALL CHAMBER',    p: P(0.90,  50,  45, 12,  7600,   8, 210, 1.05, 560, 0.44, 0.80) },
            { name: 'MEDIUM CHAMBER',   p: P(1.50,  70,  65, 18,  6800,  14, 225, 1.15, 520, 0.38, 0.90) },
            { name: 'LARGE CHAMBER',    p: P(2.30,  95,  90, 26,  5800,  20, 235, 1.25, 470, 0.32, 1.05) },
            { name: 'BRIGHT CHAMBER',   p: P(1.70,  65,  60, 20, 12000,  12, 230, 0.85, 620, 0.36, 0.90) },
            { name: 'DARK CHAMBER',     p: P(2.10,  80,  75, 24,  2800,  18, 232, 1.70, 380, 0.34, 1.00) },
            { name: 'VOCAL CHAMBER',    p: P(1.60,  75,  70, 19,  9000,  22, 238, 1.05, 540, 0.28, 0.95) },
            { name: 'DRUM CHAMBER',     p: P(1.10,  45,  40, 16,  7000,   5, 215, 1.10, 580, 0.52, 0.85) },
            { name: 'STONE CHAMBER',    p: P(2.80,  90,  85, 30,  4000,  24, 200, 1.60, 400, 0.42, 1.15) },
            { name: 'PLASTER CHAMBER',  p: P(2.00,  70,  68, 22, 10000,  16, 240, 0.95, 560, 0.34, 0.95) },
            { name: 'LIVE CHAMBER',     p: P(1.35,  55,  52, 17, 11000,  10, 220, 0.95, 600, 0.48, 0.85) },
        ],
    },
    {
        // The random algorithm again, but on spaces rather than halls: shorter,
        // stranger, and used as a texture rather than as a room.
        name: 'RANDOM SPACES',
        programs: [
            { name: 'SMALL RAND SPACE', p: P(0.80, 110, 120, 12,  8600,   8, 190, 1.05, 560, 0.40, 0.85) },
            { name: 'MED RAND SPACE',   p: P(1.60, 140, 150, 22,  7000,  14, 205, 1.20, 500, 0.32, 1.00) },
            { name: 'LARGE RAND SPACE', p: P(2.90, 175, 185, 32,  5600,  22, 220, 1.40, 440, 0.26, 1.20) },
            { name: 'SHIMMER SPACE',    p: P(3.60, 210, 225, 30, 13000,  30, 235, 0.80, 620, 0.16, 1.50) },
            { name: 'DRIFT SPACE',      p: P(4.40, 230, 240, 34,  4200,  55, 240, 1.60, 360, 0.14, 1.80) },
            { name: 'WIDE SPACE',       p: P(2.40, 160, 200, 36,  8000,  18, 215, 1.15, 520, 0.30, 1.60) },
            { name: 'DARK SPACE',       p: P(3.80, 190, 205, 33,  2200,  36, 228, 2.20, 300, 0.20, 1.40) },
            { name: 'SLOW SPACE',       p: P(5.20, 250, 250, 36,  5000,  70, 245, 1.50, 340, 0.10, 2.00) },
            { name: 'GLASS SPACE',      p: P(2.20, 150, 165, 24, 17000,  16, 200, 0.65, 660, 0.28, 1.10) },
            { name: 'DEEP SPACE',       p: P(9.00, 240, 250, 39,  1800, 120, 248, 2.80, 260, 0.12, 2.60) },
        ],
    },
    {
        // Halls sized and voiced for something being PLAYED in them rather than
        // sent to them: longer pre-delays, gentler top end, early reflections
        // kept low so the direct sound stays in front.
        name: 'CONCERT HALLS',
        programs: [
            { name: 'SMALL CONCERT',    p: P(1.70, 115, 120, 26,  7600,  20, 200, 1.20, 480, 0.30, 1.00) },
            { name: 'MEDIUM CONCERT',   p: P(2.30, 140, 145, 31,  6600,  26, 212, 1.30, 450, 0.26, 1.10) },
            { name: 'LARGE CONCERT',    p: P(3.10, 165, 175, 36,  5800,  32, 225, 1.40, 420, 0.22, 1.20) },
            { name: 'SYMPHONY',         p: P(3.60, 180, 190, 38,  5000,  38, 232, 1.50, 400, 0.20, 1.30) },
            { name: 'CATHEDRAL',        p: P(7.20, 205, 225, 39,  2600,  55, 242, 2.00, 300, 0.16, 1.60) },
            { name: 'BASILICA',         p: P(6.00, 195, 210, 39,  3400,  48, 238, 1.85, 320, 0.18, 1.50) },
            { name: 'WOOD HALL',        p: P(2.20, 130, 135, 29,  4800,  24, 205, 1.45, 430, 0.30, 1.05) },
            { name: 'MARBLE HALL',      p: P(4.00, 150, 160, 35,  9000,  30, 190, 1.25, 460, 0.36, 1.25) },
            { name: 'SCORING STAGE',    p: P(1.95, 125, 130, 30,  8000,  22, 208, 1.15, 500, 0.28, 1.05) },
            { name: 'GRAND HALL',       p: P(4.60, 185, 200, 39,  4400,  42, 235, 1.60, 380, 0.18, 1.40) },
        ],
    },
    {
        // Places, not reverbs. Every one of these is trying to sound like
        // somewhere a sound was recorded rather than somewhere it was sent —
        // early reflections high, tails short, top end wherever the surfaces put
        // it. The ones a drum machine gets the most out of.
        name: 'POST & FOLEY',
        programs: [
            { name: 'CAR INTERIOR',     p: P(0.18,  10,   8,  4,  2600,   1,  90, 1.40, 420, 0.85, 0.45) },
            { name: 'PHONE BOOTH',      p: P(0.35,  12,  10,  4,  4000,   2,  50, 1.10, 800, 0.95, 0.50) },
            { name: 'KITCHEN',          p: P(0.60,  25,  20,  9, 14000,   4, 100, 0.80, 700, 0.75, 0.70) },
            { name: 'HALLWAY',          p: P(1.00,  50,  65, 15,  6200,  10, 130, 1.25, 520, 0.72, 1.10) },
            { name: 'LOCKER ROOM',      p: P(1.90,  60,  70, 20,  5000,  14, 120, 1.50, 460, 0.68, 1.20) },
            { name: 'PARKING GARAGE',   p: P(3.40, 100, 130, 34,  2400,  30, 140, 2.20, 320, 0.60, 1.70) },
            { name: 'WAREHOUSE',        p: P(2.60,  90, 110, 32,  3600,  24, 160, 1.80, 380, 0.55, 1.50) },
            { name: 'SOUND STAGE',      p: P(0.80,  60,  55, 18,  9500,   8, 185, 1.00, 580, 0.50, 0.90) },
            { name: 'FOLEY PIT',        p: P(0.26,  15,  12,  6, 11000,   1, 150, 0.90, 660, 0.82, 0.55) },
            { name: 'STADIUM',          p: P(6.50, 170, 210, 39,  3000, 100, 175, 1.90, 340, 0.40, 2.40) },
        ],
    },
];
