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
 * Header: oaDrumSynthEngines.js
 * Purpose: The drum synthesis engine — every kit voice built from scratch.
 * Description: Acoustic percussion stripped to its physics: an impact
 *   (transient), a vibrating body (tonal component) and rattle/air friction
 *   (noise component). Six engines cover the kit; each declares its own
 *   parameter schema so the editor UI is generated rather than hand-written.
 *
 * Plain JS (not JSX) so it loads before the babel component scripts.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// A short white-noise buffer, made once and reused — allocating one per hit is
// the single most expensive thing a drum synth can do.
window.oaNoiseBuffer = function (ctx, seconds) {
    const dur = seconds || 2;
    // Keyed on the rate so a context running at a different one cannot be handed
    // a buffer built for another. With every context now built at the app rate
    // (oaAudioRate.js) this holds across the live context and every offline
    // render, so the buffer really is made once for the session.
    const rate = window.oaSampleRate(ctx);
    if (!window.OA_NOISE_BUF || window.OA_NOISE_BUF.sampleRate !== rate) {
        const buf = ctx.createBuffer(1, Math.ceil(rate * dur), rate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        window.OA_NOISE_BUF = buf;
    }
    return window.OA_NOISE_BUF;
};

const ms = (v) => Math.max(0.001, (v || 0) / 1000);

// Exponential ramps can never reach zero, so decay to a floor instead.
const decayTo0 = (param, time, dur) => {
    param.setValueAtTime(Math.max(0.0001, param.value), time);
    param.exponentialRampToValueAtTime(0.0001, time + dur);
};

const makeNoise = (ctx, time, dur) => {
    const src = ctx.createBufferSource();
    src.buffer = window.oaNoiseBuffer(ctx);
    src.loop = true;
    src.start(time);
    src.stop(time + dur + 0.05);
    return src;
};

// ---------------------------------------------------------------------------
// Engines. Each: { label, params: {...schema}, render(ctx, p, time, vol, out) }
// A param is { label, min, max, step, def, unit } or { label, options, def }.
// render() returns the voice's total duration in seconds.
// ---------------------------------------------------------------------------

window.OA_SYNTH_ENGINES = {

    // ---- 1. Pitched & membrane drums: kick, toms, conga ------------------
    membrane: {
        label: 'Membrane',
        blurb: 'Sine/triangle body with a fast pitch drop for the beater thump.',
        params: {
            wave:       { label: 'Wave', options: ['sine', 'triangle'], def: 'sine' },
            pitchStart: { label: 'Pitch Start', min: 60, max: 800, step: 1, def: 180, unit: 'Hz' },
            pitchEnd:   { label: 'Pitch End', min: 20, max: 400, step: 1, def: 55, unit: 'Hz' },
            pitchDecay: { label: 'Pitch Drop', min: 3, max: 200, step: 1, def: 25, unit: 'ms' },
            decay:      { label: 'Decay', min: 40, max: 1200, step: 10, def: 300, unit: 'ms' },
            click:      { label: 'Beater', min: 0, max: 1, step: 0.01, def: 0.25 },
            clickDecay: { label: 'Beater Len', min: 2, max: 40, step: 1, def: 8, unit: 'ms' },
            drive:      { label: 'Drive', min: 0, max: 1, step: 0.01, def: 0.15 },
        },
        render(ctx, p, time, vol, out) {
            const dur = ms(p.decay);
            const osc = ctx.createOscillator();
            osc.type = p.wave;
            const g = ctx.createGain();

            // The pitch envelope IS the thump: start high, plummet to rest.
            osc.frequency.setValueAtTime(p.pitchStart, time);
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, p.pitchEnd), time + ms(p.pitchDecay));

            g.gain.setValueAtTime(vol, time);
            g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            let node = g;
            if (p.drive > 0.01) {
                const shaper = ctx.createWaveShaper();
                shaper.curve = drumDriveCurve(p.drive);
                // Drive adds gain as well as harmonics; trim it back so turning
                // the knob up changes the tone, not the level.
                const trim = ctx.createGain();
                trim.gain.value = 1 / (1 + p.drive * 1.6);
                g.connect(shaper); shaper.connect(trim);
                node = trim;
            }
            osc.connect(g);
            node.connect(out);
            osc.start(time);
            osc.stop(time + dur + 0.02);

            // Beater transient — a noise blip only over the first few ms.
            if (p.click > 0.01) {
                const cd = ms(p.clickDecay);
                const n = makeNoise(ctx, time, cd);
                const ng = ctx.createGain();
                const hp = ctx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 1200;
                ng.gain.setValueAtTime(vol * p.click, time);
                ng.gain.exponentialRampToValueAtTime(0.0001, time + cd);
                n.connect(hp); hp.connect(ng); ng.connect(out);
            }
            return dur;
        }
    },

    // ---- 2. Snares & rimshots --------------------------------------------
    snare: {
        label: 'Snare',
        blurb: 'Two detuned tone oscillators for the shell, filtered noise for the wires.',
        params: {
            tone1:      { label: 'Shell 1', min: 80, max: 400, step: 1, def: 175, unit: 'Hz' },
            tone2:      { label: 'Shell 2', min: 80, max: 500, step: 1, def: 235, unit: 'Hz' },
            pitchDrop:  { label: 'Shell Drop', min: 0, max: 1, step: 0.01, def: 0.3 },
            toneDecay:  { label: 'Shell Decay', min: 20, max: 300, step: 5, def: 80, unit: 'ms' },
            filterType: { label: 'Wire Filter', options: ['highpass', 'bandpass'], def: 'highpass' },
            filterFreq: { label: 'Wire Freq', min: 400, max: 8000, step: 50, def: 1800, unit: 'Hz' },
            q:          { label: 'Wire Q', min: 0.3, max: 20, step: 0.1, def: 1.2 },
            noiseDecay: { label: 'Wire Decay', min: 40, max: 900, step: 10, def: 280, unit: 'ms' },
            mix:        { label: 'Wire Mix', min: 0, max: 1, step: 0.01, def: 0.6 },
        },
        render(ctx, p, time, vol, out) {
            const tDur = ms(p.toneDecay);
            const nDur = ms(p.noiseDecay);
            const toneVol = vol * (1 - p.mix);

            [p.tone1, p.tone2].forEach((f) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f * (1 + p.pitchDrop), time);
                osc.frequency.exponentialRampToValueAtTime(f, time + tDur * 0.5);
                g.gain.setValueAtTime(toneVol * 0.5, time);
                g.gain.exponentialRampToValueAtTime(0.0001, time + tDur);
                osc.connect(g); g.connect(out);
                osc.start(time); osc.stop(time + tDur + 0.02);
            });

            // The wires rattle on well after the shell has stopped.
            const n = makeNoise(ctx, time, nDur);
            const f = ctx.createBiquadFilter();
            f.type = p.filterType;
            f.frequency.value = p.filterFreq;
            f.Q.value = p.q;
            const ng = ctx.createGain();
            ng.gain.setValueAtTime(vol * p.mix, time);
            ng.gain.exponentialRampToValueAtTime(0.0001, time + nDur);
            n.connect(f); f.connect(ng); ng.connect(out);
            return Math.max(tDur, nDur);
        }
    },

    // ---- 3. Metallic percussion: hats, cymbal, ride, cowbell -------------
    metal: {
        label: 'Metallic',
        blurb: 'Six inharmonic square waves through a resonant filter — the 808 paradigm.',
        params: {
            base:    { label: 'Base Freq', min: 60, max: 1200, step: 1, def: 245, unit: 'Hz' },
            spread:  { label: 'Inharmonic', min: 0, max: 2, step: 0.01, def: 1 },
            voices:  { label: 'Oscillators', min: 2, max: 6, step: 1, def: 6 },
            filterType: { label: 'Filter', options: ['highpass', 'bandpass'], def: 'highpass' },
            filterFreq: { label: 'Filter Freq', min: 500, max: 12000, step: 50, def: 7000, unit: 'Hz' },
            q:       { label: 'Resonance', min: 0.3, max: 20, step: 0.1, def: 2 },
            noise:   { label: 'Sizzle', min: 0, max: 1, step: 0.01, def: 0.15 },
            decay:   { label: 'Decay', min: 20, max: 2500, step: 10, def: 90, unit: 'ms' },
        },
        render(ctx, p, time, vol, out) {
            const dur = ms(p.decay);
            vol *= 1.95;  // summing N oscillators at 1/N then filtering costs level
            const f = ctx.createBiquadFilter();
            f.type = p.filterType;
            f.frequency.value = p.filterFreq;
            f.Q.value = p.q;
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, time);
            g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
            f.connect(g); g.connect(out);

            // Non-integer ratios — integers would sound like a musical note.
            const RATIOS = [1, 1.4471, 1.6170, 1.9265, 2.5028, 2.6637];
            const n = Math.round(p.voices);
            for (let i = 0; i < n; i++) {
                const osc = ctx.createOscillator();
                osc.type = 'square';
                const ratio = 1 + (RATIOS[i] - 1) * p.spread;
                osc.frequency.value = p.base * ratio;
                const og = ctx.createGain();
                og.gain.value = 1 / n;
                osc.connect(og); og.connect(f);
                osc.start(time); osc.stop(time + dur + 0.02);
            }

            // Noise fills the gaps between the metallic grains.
            if (p.noise > 0.01) {
                const nz = makeNoise(ctx, time, dur);
                const ng = ctx.createGain();
                ng.gain.value = p.noise * 0.6;
                nz.connect(ng); ng.connect(f);
            }
            return dur;
        }
    },

    // ---- 4a. Claps --------------------------------------------------------
    clap: {
        label: 'Clap',
        blurb: 'Several noise bursts slightly out of sync, then one decaying tail.',
        params: {
            bursts:     { label: 'Hands', min: 1, max: 6, step: 1, def: 3 },
            spacing:    { label: 'Spread', min: 3, max: 40, step: 1, def: 11, unit: 'ms' },
            filterFreq: { label: 'Filter Freq', min: 400, max: 6000, step: 50, def: 1200, unit: 'Hz' },
            q:          { label: 'Resonance', min: 0.3, max: 20, step: 0.1, def: 3 },
            burstDecay: { label: 'Burst Len', min: 2, max: 40, step: 1, def: 9, unit: 'ms' },
            tailDecay:  { label: 'Tail', min: 40, max: 800, step: 10, def: 220, unit: 'ms' },
        },
        render(ctx, p, time, vol, out) {
            const tail = ms(p.tailDecay);
            vol *= 4;   // a narrow band-pass throws most of the noise away
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.value = p.filterFreq;
            f.Q.value = p.q;
            f.connect(out);

            const bd = ms(p.burstDecay);
            const gap = ms(p.spacing);
            const n = Math.round(p.bursts);
            for (let i = 0; i < n; i++) {
                const t = time + i * gap;
                const nz = makeNoise(ctx, t, bd);
                const g = ctx.createGain();
                g.gain.setValueAtTime(vol, t);
                g.gain.exponentialRampToValueAtTime(0.0001, t + bd);
                nz.connect(g); g.connect(f);
            }
            // The final, longer body of the clap.
            const tStart = time + n * gap;
            const nz = makeNoise(ctx, tStart, tail);
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol * 0.8, tStart);
            g.gain.exponentialRampToValueAtTime(0.0001, tStart + tail);
            nz.connect(g); g.connect(f);
            return n * gap + tail;
        }
    },

    // ---- 4b. Shakers ------------------------------------------------------
    shaker: {
        label: 'Shaker',
        blurb: 'Band-passed noise with a ramped attack — seeds sliding, not striking.',
        params: {
            filterFreq: { label: 'Filter Freq', min: 1000, max: 14000, step: 100, def: 7000, unit: 'Hz' },
            q:          { label: 'Resonance', min: 0.3, max: 20, step: 0.1, def: 2.5 },
            attack:     { label: 'Attack', min: 1, max: 80, step: 1, def: 18, unit: 'ms' },
            decay:      { label: 'Decay', min: 40, max: 700, step: 10, def: 140, unit: 'ms' },
        },
        render(ctx, p, time, vol, out) {
            const a = ms(p.attack);
            const d = ms(p.decay);
            vol *= 1.8;   // band-passed noise needs the make-up gain
            const nz = makeNoise(ctx, time, a + d);
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.value = p.filterFreq;
            f.Q.value = p.q;
            const g = ctx.createGain();
            // Ramp up, don't snap — that's what separates a shake from a hit.
            g.gain.setValueAtTime(0.0001, time);
            g.gain.linearRampToValueAtTime(vol, time + a);
            g.gain.exponentialRampToValueAtTime(0.0001, time + a + d);
            nz.connect(f); f.connect(g); g.connect(out);
            return a + d;
        }
    },

    // ---- 5a. Clave / rim: pure brief resonance ---------------------------
    click: {
        label: 'Clave / Rim',
        blurb: 'A resonant body struck by a sharp pulse. Near-instant decay.',
        params: {
            freq:   { label: 'Pitch', min: 200, max: 5000, step: 10, def: 2400, unit: 'Hz' },
            q:      { label: 'Resonance', min: 1, max: 40, step: 0.5, def: 14 },
            decay:  { label: 'Decay', min: 5, max: 300, step: 1, def: 42, unit: 'ms' },
            noise:  { label: 'Wood/Metal', min: 0, max: 1, step: 0.01, def: 0.3 },
            wave:   { label: 'Wave', options: ['sine', 'triangle', 'square'], def: 'sine' },
        },
        render(ctx, p, time, vol, out) {
            const d = ms(p.decay);
            const osc = ctx.createOscillator();
            osc.type = p.wave;
            osc.frequency.value = p.freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol * (1 - p.noise * 0.5), time);
            g.gain.exponentialRampToValueAtTime(0.0001, time + d);
            osc.connect(g); g.connect(out);
            osc.start(time); osc.stop(time + d + 0.02);

            // A resonant band-pass excited by noise gives the rim its wooden crack.
            if (p.noise > 0.01) {
                const nz = makeNoise(ctx, time, d);
                const f = ctx.createBiquadFilter();
                f.type = 'bandpass';
                f.frequency.value = p.freq;
                f.Q.value = p.q;
                const ng = ctx.createGain();
                ng.gain.setValueAtTime(vol * p.noise, time);
                ng.gain.exponentialRampToValueAtTime(0.0001, time + d);
                nz.connect(f); f.connect(ng); ng.connect(out);
            }
            return d;
        }
    },

    // ---- 5b. FM: metallic, rubbery, laser-like textures -------------------
    fm: {
        label: 'FM',
        blurb: 'A modulator bends the carrier — complex sidebands from two oscillators.',
        params: {
            carrier:    { label: 'Carrier', min: 40, max: 3000, step: 5, def: 320, unit: 'Hz' },
            ratio:      { label: 'Mod Ratio', min: 0.1, max: 12, step: 0.05, def: 2.4 },
            index:      { label: 'Mod Depth', min: 0, max: 2000, step: 10, def: 600 },
            indexDecay: { label: 'Depth Decay', min: 5, max: 800, step: 5, def: 90, unit: 'ms' },
            pitchDrop:  { label: 'Pitch Drop', min: 0, max: 1, step: 0.01, def: 0 },
            decay:      { label: 'Decay', min: 30, max: 2000, step: 10, def: 260, unit: 'ms' },
        },
        render(ctx, p, time, vol, out) {
            const d = ms(p.decay);
            const carrier = ctx.createOscillator();
            carrier.type = 'sine';
            carrier.frequency.setValueAtTime(p.carrier * (1 + p.pitchDrop * 2), time);
            carrier.frequency.exponentialRampToValueAtTime(p.carrier, time + d * 0.4);

            const mod = ctx.createOscillator();
            mod.type = 'sine';
            mod.frequency.value = p.carrier * p.ratio;
            const modGain = ctx.createGain();
            modGain.gain.setValueAtTime(p.index, time);
            modGain.gain.exponentialRampToValueAtTime(0.01, time + ms(p.indexDecay));
            mod.connect(modGain);
            modGain.connect(carrier.frequency);

            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, time);
            g.gain.exponentialRampToValueAtTime(0.0001, time + d);
            carrier.connect(g); g.connect(out);

            mod.start(time); mod.stop(time + d + 0.02);
            carrier.start(time); carrier.stop(time + d + 0.02);
            return d;
        }
    },
};

// Soft-clip curve for the membrane engine's drive control.
// The point count is ODD so the middle sample lands exactly on x=0 and maps to
// 0. With an even count the curve is sampled either side of zero, and silence
// comes out as a constant DC offset that never decays.
//
// FILE-LOCAL ON PURPOSE. This used to be window.oaDriveCurve, which is also the
// name the DRIVE pedal (oaDrive.js) uses for its own curve baker — and that file
// loads later, so it silently replaced this one. The two take different
// arguments: this wants a 0..1 knob amount, the pedal's wants a whole unit
// object. Every membrane hit with drive above 0.01 then called the pedal's
// version with a number and threw. Each source gets its own scope from
// build.mjs, so keeping it local here means the collision cannot come back.
const drumDriveCurve = (function () {
    const cache = {};
    return function (amount) {
        const key = Math.round(amount * 100);
        if (cache[key]) return cache[key];
        const n = 1025;
        const curve = new Float32Array(n);
        const k = amount * 60;
        for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * 2 - 1;
            curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        cache[key] = curve;
        return curve;
    };
})();

// Fill in any parameter the stored patch is missing, so adding a new knob to an
// engine never breaks a patch someone already saved.
window.oaSynthDefaults = function (engineName) {
    const eng = window.OA_SYNTH_ENGINES[engineName];
    if (!eng) return {};
    const out = { engine: engineName };
    Object.keys(eng.params).forEach((k) => { out[k] = eng.params[k].def; });
    return out;
};

window.oaSynthPatch = function (patch) {
    const engine = window.OA_SYNTH_ENGINES[patch && patch.engine] ? patch.engine : 'membrane';
    const out = Object.assign(window.oaSynthDefaults(engine), patch || {}, { engine });
    // This is the LOAD path — a saved patch out of localStorage, a patch out of
    // a song file, a patch out of a build that had different ranges. Held to
    // what the engine can actually do, on the way in, once. Without this a
    // corrupt stored value goes straight onto an AudioParam at the next hit,
    // and no amount of clamping in the setter helps: nothing was ever set.
    const spec = window.OA_SYNTH_ENGINES[engine].params;
    Object.keys(spec).forEach((k) => {
        const s = spec[k];
        if (s.options) {
            if (s.options.indexOf(out[k]) < 0) out[k] = s.def;
        } else {
            const v = Number(out[k]);
            out[k] = isFinite(v) ? Math.max(s.min, Math.min(s.max, v)) : s.def;
        }
    });
    return out;
};
