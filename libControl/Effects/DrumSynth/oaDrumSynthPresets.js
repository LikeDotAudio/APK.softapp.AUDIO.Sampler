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
 * Header: oaDrumSynthPresets.js
 * Purpose: The voice library, and which voice each pad starts on.
 * Description: Data, lifted out of oaDrumSynthPatches.js. Two exports:
 *
 *     OA_SYNTH_LIBRARY   every ready-made voice, grouped, keyed and named. This
 *                        is what the editor's VOICE menu offers, and it is the
 *                        list to add to.
 *     OA_SYNTH_FACTORY   which library voice each pad comes up on. Twenty-five
 *                        entries — sixteen for a 4x4 grid, nine more for 5x5 —
 *                        each one just a key into the library above.
 *
 *   The factory used to BE the patches, so tuning a kick meant editing the kit
 *   and there was no way to offer a second kick without also assigning it to a
 *   pad. Separating them means the library can grow without the kit changing at
 *   all, and a pad can be pointed at any voice in it.
 *
 *   WHAT THE ENGINES CAN DO, which is what these are built out of:
 *
 *     membrane  a tuned body with a fast pitch drop. The DROP is the beater —
 *               start high, plummet to rest, and the ear hears a stick hitting
 *               a skin. Kicks, toms, congas.
 *     snare     two detuned oscillators for the shell plus filtered noise for
 *               the wires. The wires always outlast the shell.
 *     metal     six inharmonic square waves through a resonant filter. The
 *               ratios are deliberately non-integer, because integers would
 *               sound like a musical note instead of a lump of metal.
 *     clap      several noise bursts a few milliseconds apart, then one longer
 *               tail. The SPACING is the effect: it is many hands, not one.
 *     shaker    band-passed noise with a ramped attack. The ramp is the whole
 *               engine — seeds sliding rather than striking.
 *     click     a resonant body struck by a pulse. Claves, rims, blocks.
 *     fm        a modulator bending a carrier, with the modulation depth on its
 *               own envelope. Blips, lasers, rubbery percussion.
 *
 *   HOW THE CLASSIC MACHINES SIT IN THAT. The analogue boxes everyone knows
 *   were built from exactly these primitives, and the differences worth copying
 *   are mostly tuning and decay rather than topology:
 *
 *     The long-tailed 80s kick is a membrane with a low pitch end (~45Hz), a
 *     slow decay and hardly any beater. The punchy late-80s one is the same
 *     engine with a faster pitch drop, a shorter decay and the beater right up.
 *     Its hats are metal voices with the same six ratios and different filters —
 *     open and closed are ONE voice at two decay settings, which is why they
 *     sound like each other and like nothing else.
 *
 *   Loaded before oaDrumSynthEngines.js needs it — that is, before
 *   oaDrumSynthPatches.js, which resolves the factory list at load time.
 */

/**
 * Every voice, grouped the way a kit is laid out. `key` is stable and is what a
 * saved pad refers to; `name` is what the menu shows.
 *
 * A patch is exactly what an engine's render() takes, so an entry here is a
 * complete voice — no defaults are filled in later beyond what oaSynthPatch()
 * does for parameters an engine gained after the patch was written.
 */
window.OA_SYNTH_LIBRARY = [
    // ---- KICKS ---------------------------------------------------------------
    { key: 'kick.classic',  group: 'Kick', name: 'Classic Kick',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 190, pitchEnd: 48, pitchDecay: 22, decay: 340, click: 0.30, clickDecay: 7, drive: 0.20 } },
    { key: 'kick.long',     group: 'Kick', name: 'Long Sub Kick',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 165, pitchEnd: 42, pitchDecay: 30, decay: 900, click: 0.10, clickDecay: 6, drive: 0.10 } },
    { key: 'kick.tight',    group: 'Kick', name: 'Tight Kick',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 150, pitchEnd: 42, pitchDecay: 28, decay: 260, click: 0.45, clickDecay: 9, drive: 0.35 } },
    { key: 'kick.punch',    group: 'Kick', name: 'Punch Kick',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 240, pitchEnd: 55, pitchDecay: 14, decay: 300, click: 0.40, clickDecay: 6, drive: 0.30 } },
    { key: 'kick.click',    group: 'Kick', name: 'Click Kick',
      patch: { engine: 'membrane', wave: 'triangle', pitchStart: 210, pitchEnd: 50, pitchDecay: 12, decay: 220, click: 0.85, clickDecay: 4, drive: 0.25 } },
    { key: 'kick.deep',     group: 'Kick', name: 'Deep Round Kick',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 130, pitchEnd: 38, pitchDecay: 40, decay: 620, click: 0.06, clickDecay: 10, drive: 0.05 } },
    { key: 'kick.dirty',    group: 'Kick', name: 'Dirty Kick',
      patch: { engine: 'membrane', wave: 'triangle', pitchStart: 200, pitchEnd: 52, pitchDecay: 20, decay: 330, click: 0.35, clickDecay: 8, drive: 0.85 } },
    { key: 'kick.knock',    group: 'Kick', name: 'Knock',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 300, pitchEnd: 78, pitchDecay: 10, decay: 180, click: 0.55, clickDecay: 5, drive: 0.40 } },
    { key: 'kick.boom',     group: 'Kick', name: 'Boom',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 180, pitchEnd: 36, pitchDecay: 48, decay: 1100, click: 0.12, clickDecay: 9, drive: 0.15 } },
    { key: 'kick.fm',       group: 'Kick', name: 'FM Kick',
      patch: { engine: 'fm', carrier: 55, ratio: 3.2, index: 900, indexDecay: 35, pitchDrop: 0.5, decay: 380 } },
    { key: 'kick.gabber',   group: 'Kick', name: 'Overdriven Kick',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 260, pitchEnd: 46, pitchDecay: 18, decay: 420, click: 0.50, clickDecay: 7, drive: 1 } },
    { key: 'kick.soft',     group: 'Kick', name: 'Soft Beater',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 170, pitchEnd: 50, pitchDecay: 34, decay: 400, click: 0.04, clickDecay: 14, drive: 0 } },

    // ---- SNARES --------------------------------------------------------------
    { key: 'snare.classic', group: 'Snare', name: 'Classic Snare',
      patch: { engine: 'snare', tone1: 175, tone2: 235, pitchDrop: 0.30, toneDecay: 80, filterType: 'highpass', filterFreq: 1800, q: 1.2, noiseDecay: 260, mix: 0.60 } },
    { key: 'snare.high',    group: 'Snare', name: 'High Snare',
      patch: { engine: 'snare', tone1: 220, tone2: 300, pitchDrop: 0.25, toneDecay: 55, filterType: 'highpass', filterFreq: 2400, q: 1.1, noiseDecay: 170, mix: 0.55 } },
    { key: 'snare.fat',     group: 'Snare', name: 'Fat Snare',
      patch: { engine: 'snare', tone1: 150, tone2: 205, pitchDrop: 0.40, toneDecay: 120, filterType: 'highpass', filterFreq: 1200, q: 1.0, noiseDecay: 340, mix: 0.50 } },
    { key: 'snare.tight',   group: 'Snare', name: 'Tight Snare',
      patch: { engine: 'snare', tone1: 200, tone2: 265, pitchDrop: 0.20, toneDecay: 45, filterType: 'highpass', filterFreq: 2800, q: 1.4, noiseDecay: 120, mix: 0.62 } },
    { key: 'snare.wires',   group: 'Snare', name: 'Loose Wires',
      patch: { engine: 'snare', tone1: 165, tone2: 225, pitchDrop: 0.28, toneDecay: 70, filterType: 'highpass', filterFreq: 1500, q: 0.9, noiseDecay: 620, mix: 0.78 } },
    { key: 'snare.rim',     group: 'Snare', name: 'Rimshot',
      patch: { engine: 'snare', tone1: 320, tone2: 430, pitchDrop: 0.15, toneDecay: 35, filterType: 'bandpass', filterFreq: 2600, q: 3.0, noiseDecay: 90, mix: 0.45 } },
    { key: 'snare.brush',   group: 'Snare', name: 'Brush Sweep',
      patch: { engine: 'shaker', filterFreq: 3600, q: 1.6, attack: 46, decay: 300 } },
    { key: 'snare.piccolo', group: 'Snare', name: 'Piccolo',
      patch: { engine: 'snare', tone1: 260, tone2: 355, pitchDrop: 0.22, toneDecay: 40, filterType: 'highpass', filterFreq: 3200, q: 1.3, noiseDecay: 140, mix: 0.58 } },
    { key: 'snare.gated',   group: 'Snare', name: 'Gated Snare',
      patch: { engine: 'snare', tone1: 180, tone2: 245, pitchDrop: 0.35, toneDecay: 90, filterType: 'highpass', filterFreq: 1600, q: 1.1, noiseDecay: 200, mix: 0.72 } },
    { key: 'snare.noisy',   group: 'Snare', name: 'All Wires',
      patch: { engine: 'snare', tone1: 190, tone2: 250, pitchDrop: 0.30, toneDecay: 60, filterType: 'bandpass', filterFreq: 2200, q: 1.8, noiseDecay: 420, mix: 0.92 } },
    { key: 'snare.body',    group: 'Snare', name: 'All Shell',
      patch: { engine: 'snare', tone1: 170, tone2: 228, pitchDrop: 0.45, toneDecay: 150, filterType: 'highpass', filterFreq: 1400, q: 1.0, noiseDecay: 90, mix: 0.15 } },
    { key: 'snare.clapsn',  group: 'Snare', name: 'Clap Snare',
      patch: { engine: 'clap', bursts: 2, spacing: 7, filterFreq: 1800, q: 2.2, burstDecay: 11, tailDecay: 190 } },

    // ---- HATS ----------------------------------------------------------------
    // Closed and open are ONE voice at two decay settings, exactly as they are
    // on the machine this is built from — which is why they sound related.
    { key: 'hat.closed',    group: 'Hat', name: 'Closed Hat',
      patch: { engine: 'metal', base: 245, spread: 1.00, voices: 6, filterType: 'highpass', filterFreq: 8000, q: 2.0, noise: 0.12, decay: 75 } },
    { key: 'hat.open',      group: 'Hat', name: 'Open Hat',
      patch: { engine: 'metal', base: 245, spread: 1.00, voices: 6, filterType: 'highpass', filterFreq: 7000, q: 1.8, noise: 0.18, decay: 620 } },
    { key: 'hat.pedal',     group: 'Hat', name: 'Pedal Hat',
      patch: { engine: 'metal', base: 245, spread: 1.00, voices: 6, filterType: 'highpass', filterFreq: 6400, q: 2.2, noise: 0.10, decay: 130 } },
    { key: 'hat.tick',      group: 'Hat', name: 'Tick Hat',
      patch: { engine: 'metal', base: 320, spread: 1.20, voices: 4, filterType: 'highpass', filterFreq: 10000, q: 2.6, noise: 0.06, decay: 40 } },
    { key: 'hat.sizzle',    group: 'Hat', name: 'Sizzle Hat',
      patch: { engine: 'metal', base: 260, spread: 1.35, voices: 6, filterType: 'highpass', filterFreq: 9000, q: 1.4, noise: 0.45, decay: 300 } },
    { key: 'hat.dirty',     group: 'Hat', name: 'Dirty Hat',
      patch: { engine: 'metal', base: 210, spread: 0.75, voices: 5, filterType: 'bandpass', filterFreq: 5200, q: 3.2, noise: 0.30, decay: 110 } },
    { key: 'hat.noise',     group: 'Hat', name: 'Noise Hat',
      patch: { engine: 'shaker', filterFreq: 9500, q: 3.0, attack: 1, decay: 70 } },
    { key: 'hat.longopen',  group: 'Hat', name: 'Long Open Hat',
      patch: { engine: 'metal', base: 245, spread: 1.05, voices: 6, filterType: 'highpass', filterFreq: 6600, q: 1.6, noise: 0.22, decay: 1100 } },
    { key: 'hat.metalic',   group: 'Hat', name: 'Metallic Tick',
      patch: { engine: 'metal', base: 480, spread: 1.50, voices: 3, filterType: 'bandpass', filterFreq: 8200, q: 5.0, noise: 0.02, decay: 60 } },

    // ---- CYMBALS -------------------------------------------------------------
    { key: 'cym.crash',     group: 'Cymbal', name: 'Crash',
      patch: { engine: 'metal', base: 260, spread: 1.40, voices: 6, filterType: 'highpass', filterFreq: 4200, q: 1.2, noise: 0.40, decay: 2200 } },
    { key: 'cym.cymbal',    group: 'Cymbal', name: 'Cymbal',
      patch: { engine: 'metal', base: 300, spread: 1.25, voices: 6, filterType: 'highpass', filterFreq: 5500, q: 1.4, noise: 0.35, decay: 1600 } },
    { key: 'cym.ride',      group: 'Cymbal', name: 'Ride',
      patch: { engine: 'metal', base: 420, spread: 0.90, voices: 6, filterType: 'bandpass', filterFreq: 6000, q: 2.5, noise: 0.20, decay: 900 } },
    { key: 'cym.bell',      group: 'Cymbal', name: 'Ride Bell',
      patch: { engine: 'metal', base: 620, spread: 0.55, voices: 4, filterType: 'bandpass', filterFreq: 3400, q: 6.0, noise: 0.04, decay: 700 } },
    { key: 'cym.splash',    group: 'Cymbal', name: 'Splash',
      patch: { engine: 'metal', base: 380, spread: 1.50, voices: 6, filterType: 'highpass', filterFreq: 7500, q: 1.3, noise: 0.30, decay: 420 } },
    { key: 'cym.china',     group: 'Cymbal', name: 'China',
      patch: { engine: 'metal', base: 220, spread: 1.75, voices: 6, filterType: 'highpass', filterFreq: 3600, q: 1.0, noise: 0.50, decay: 1400 } },
    { key: 'cym.dark',      group: 'Cymbal', name: 'Dark Wash',
      patch: { engine: 'metal', base: 180, spread: 1.60, voices: 6, filterType: 'bandpass', filterFreq: 2600, q: 1.2, noise: 0.55, decay: 2500 } },
    { key: 'cym.triangle',  group: 'Cymbal', name: 'Triangle',
      patch: { engine: 'metal', base: 1100, spread: 0.18, voices: 3, filterType: 'bandpass', filterFreq: 5200, q: 6.0, noise: 0.01, decay: 1400 } },

    // ---- TOMS ----------------------------------------------------------------
    { key: 'tom.floor',     group: 'Tom', name: 'Floor Tom',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 160, pitchEnd: 62, pitchDecay: 46, decay: 620, click: 0.16, clickDecay: 8, drive: 0.10 } },
    { key: 'tom.low',       group: 'Tom', name: 'Low Tom',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 220, pitchEnd: 90, pitchDecay: 40, decay: 520, click: 0.18, clickDecay: 8, drive: 0.10 } },
    { key: 'tom.mid',       group: 'Tom', name: 'Mid Tom',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 300, pitchEnd: 140, pitchDecay: 36, decay: 440, click: 0.18, clickDecay: 8, drive: 0.10 } },
    { key: 'tom.high',      group: 'Tom', name: 'High Tom',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 420, pitchEnd: 210, pitchDecay: 32, decay: 380, click: 0.20, clickDecay: 7, drive: 0.10 } },
    { key: 'tom.rototom',   group: 'Tom', name: 'Roto Tom',
      patch: { engine: 'membrane', wave: 'triangle', pitchStart: 520, pitchEnd: 180, pitchDecay: 60, decay: 420, click: 0.24, clickDecay: 6, drive: 0.15 } },
    { key: 'tom.syn',       group: 'Tom', name: 'Synth Tom',
      patch: { engine: 'membrane', wave: 'triangle', pitchStart: 380, pitchEnd: 70, pitchDecay: 90, decay: 560, click: 0.10, clickDecay: 10, drive: 0.30 } },
    { key: 'tom.dry',       group: 'Tom', name: 'Dry Tom',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 260, pitchEnd: 130, pitchDecay: 24, decay: 220, click: 0.28, clickDecay: 6, drive: 0.05 } },
    { key: 'tom.deep',      group: 'Tom', name: 'Deep Tom',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 140, pitchEnd: 58, pitchDecay: 55, decay: 780, click: 0.12, clickDecay: 9, drive: 0.12 } },
    { key: 'tom.fm',        group: 'Tom', name: 'FM Tom',
      patch: { engine: 'fm', carrier: 140, ratio: 1.7, index: 500, indexDecay: 120, pitchDrop: 0.35, decay: 480 } },
    { key: 'tom.timbale',   group: 'Tom', name: 'Timbale',
      patch: { engine: 'membrane', wave: 'triangle', pitchStart: 620, pitchEnd: 380, pitchDecay: 18, decay: 240, click: 0.40, clickDecay: 5, drive: 0.20 } },

    // ---- PERCUSSION ----------------------------------------------------------
    { key: 'perc.clap',     group: 'Percussion', name: 'Clap',
      patch: { engine: 'clap', bursts: 3, spacing: 11, filterFreq: 1200, q: 3.0, burstDecay: 9, tailDecay: 220 } },
    { key: 'perc.bigclap',  group: 'Percussion', name: 'Big Clap',
      patch: { engine: 'clap', bursts: 5, spacing: 14, filterFreq: 1000, q: 2.4, burstDecay: 13, tailDecay: 380 } },
    { key: 'perc.handclap', group: 'Percussion', name: 'Single Hand',
      patch: { engine: 'clap', bursts: 1, spacing: 8, filterFreq: 1600, q: 4.0, burstDecay: 8, tailDecay: 120 } },
    { key: 'perc.rim',      group: 'Percussion', name: 'Rim',
      patch: { engine: 'click', freq: 1700, q: 16, decay: 30, noise: 0.60, wave: 'triangle' } },
    { key: 'perc.clave',    group: 'Percussion', name: 'Clave',
      patch: { engine: 'click', freq: 2450, q: 12, decay: 40, noise: 0.15, wave: 'sine' } },
    { key: 'perc.block',    group: 'Percussion', name: 'Woodblock',
      patch: { engine: 'click', freq: 1150, q: 20, decay: 26, noise: 0.08, wave: 'square' } },
    { key: 'perc.cowbell',  group: 'Percussion', name: 'Cowbell',
      patch: { engine: 'metal', base: 540, spread: 0.35, voices: 2, filterType: 'bandpass', filterFreq: 2600, q: 3.5, noise: 0.02, decay: 210 } },
    { key: 'perc.conga',    group: 'Percussion', name: 'Conga',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 360, pitchEnd: 195, pitchDecay: 28, decay: 480, click: 0.22, clickDecay: 6, drive: 0.05 } },
    { key: 'perc.bongo',    group: 'Percussion', name: 'Bongo',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 520, pitchEnd: 300, pitchDecay: 26, decay: 260, click: 0.24, clickDecay: 6, drive: 0.05 } },
    { key: 'perc.shaker',   group: 'Percussion', name: 'Shaker',
      patch: { engine: 'shaker', filterFreq: 7200, q: 2.5, attack: 20, decay: 130 } },
    { key: 'perc.maraca',   group: 'Percussion', name: 'Maraca',
      patch: { engine: 'shaker', filterFreq: 10000, q: 3.5, attack: 6, decay: 90 } },
    { key: 'perc.cabasa',   group: 'Percussion', name: 'Cabasa',
      patch: { engine: 'shaker', filterFreq: 5600, q: 2.0, attack: 30, decay: 180 } },
    { key: 'perc.tamb',     group: 'Percussion', name: 'Tambourine',
      patch: { engine: 'metal', base: 720, spread: 1.30, voices: 5, filterType: 'highpass', filterFreq: 8600, q: 1.6, noise: 0.60, decay: 260 } },
    { key: 'perc.agogo',    group: 'Percussion', name: 'Agogo',
      patch: { engine: 'metal', base: 780, spread: 0.30, voices: 2, filterType: 'bandpass', filterFreq: 3200, q: 5.0, noise: 0.01, decay: 320 } },
    { key: 'perc.guiro',    group: 'Percussion', name: 'Guiro',
      patch: { engine: 'shaker', filterFreq: 3200, q: 5.5, attack: 64, decay: 220 } },

    // ---- FX ------------------------------------------------------------------
    { key: 'fx.blip',       group: 'FX', name: 'FM Blip',
      patch: { engine: 'fm', carrier: 420, ratio: 3.1, index: 700, indexDecay: 45, pitchDrop: 0.20, decay: 160 } },
    { key: 'fx.laser',      group: 'FX', name: 'Laser Sweep',
      patch: { engine: 'fm', carrier: 220, ratio: 5.5, index: 1400, indexDecay: 220, pitchDrop: 0.60, decay: 600 } },
    { key: 'fx.zap',        group: 'FX', name: 'Zap',
      patch: { engine: 'fm', carrier: 900, ratio: 7.5, index: 1800, indexDecay: 30, pitchDrop: 0.80, decay: 140 } },
    { key: 'fx.rubber',     group: 'FX', name: 'Rubber Band',
      patch: { engine: 'fm', carrier: 180, ratio: 0.5, index: 1200, indexDecay: 180, pitchDrop: 0.10, decay: 520 } },
    { key: 'fx.metalhit',   group: 'FX', name: 'Metal Hit',
      patch: { engine: 'metal', base: 140, spread: 2.00, voices: 6, filterType: 'bandpass', filterFreq: 3000, q: 2.0, noise: 0.25, decay: 800 } },
    { key: 'fx.noiseburst', group: 'FX', name: 'Noise Burst',
      patch: { engine: 'shaker', filterFreq: 1400, q: 0.6, attack: 1, decay: 400 } },
    { key: 'fx.reverse',    group: 'FX', name: 'Reverse Swell',
      patch: { engine: 'shaker', filterFreq: 4200, q: 1.2, attack: 78, decay: 60 } },
    { key: 'fx.tick',       group: 'FX', name: 'Metronome Tick',
      patch: { engine: 'click', freq: 4200, q: 30, decay: 12, noise: 0.02, wave: 'square' } },
    { key: 'fx.thud',       group: 'FX', name: 'Thud',
      patch: { engine: 'membrane', wave: 'sine', pitchStart: 90, pitchEnd: 30, pitchDecay: 60, decay: 260, click: 0.02, clickDecay: 20, drive: 0 } },
    { key: 'fx.static',     group: 'FX', name: 'Static Hit',
      patch: { engine: 'clap', bursts: 6, spacing: 3, filterFreq: 4600, q: 1.0, burstDecay: 5, tailDecay: 60 } },
];

/**
 * Which library voice each pad starts on. Index is the pad; the value is a
 * library key. Sixteen for a 4x4 grid, then the nine a 5x5 adds — and past
 * twenty-five oaFactoryPatch() wraps, exactly as the kit's names do.
 */
window.OA_SYNTH_FACTORY_KEYS = [
    'kick.classic',   //  0 Kick
    'snare.classic',  //  1 Snare
    'hat.closed',     //  2 Hi-Hat
    'fx.blip',        //  3 Perc
    'perc.clap',      //  4 Clap
    'perc.rim',       //  5 Rim
    'tom.low',        //  6 Tom Lo
    'tom.mid',        //  7 Tom Mid
    'tom.high',       //  8 Tom Hi
    'cym.cymbal',     //  9 Cymbal
    'cym.ride',       // 10 Ride
    'perc.cowbell',   // 11 Cowbell
    'perc.conga',     // 12 Conga
    'perc.clave',     // 13 Clave
    'perc.shaker',    // 14 Shaker
    'fx.laser',       // 15 FX
    // --- the voices a 5 x 5 grid adds ---
    'kick.tight',     // 16 Kick 2
    'snare.high',     // 17 Snare 2
    'hat.open',       // 18 Open Hat
    'tom.floor',      // 19 Tom Fl
    'cym.crash',      // 20 Crash
    'cym.splash',     // 21 Splash
    'perc.block',     // 22 Block
    'cym.triangle',   // 23 Triangle
    'perc.bongo',     // 24 Bongo
];
