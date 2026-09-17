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
 * Header: oaReverb.js
 * Purpose: Two shared reverb machines for the whole kit, driven from a VARC.
 * Description: Every voice splits into a dry path straight to the output and a
 *   per-channel send into one of two reverbs. The tape delays (oaTapeDelay.js)
 *   feed them too — see `toRv` there.
 *
 *   The two units used to be a pair of dropdowns: pick a "tone" and a "size"
 *   from four fixed choices. They are now a parameter set modelled on the
 *   VARC 444V, addressed the way that machine is addressed — banks of
 *   programs loaded by number, and six sliders per page editing whatever the
 *   program loaded. See VarcRemote.jsx for the front panel.
 *
 *   WHY THE PARAMETERS LIVE IN THE IMPULSE RESPONSE. A 444V is a feedback delay
 *   network: a tank of delay lines with the output folded back into the input,
 *   processed sample by sample. This is a CONVOLUTION reverb — the room is
 *   precomputed as an impulse response and the browser convolves the audio
 *   against it. That sounds like a compromise, and for some parameters it is,
 *   but for the two that make a 444V sound like a 444V it is arguably the more
 *   direct route:
 *
 *     SHAPE and SPREAD are envelope controls. On the real machine they shape
 *     how energy BUILDS before it decays — the swell that makes a big hall read
 *     as big rather than merely long. In an FDN that has to be imposed on the
 *     tank from outside. In an impulse response the envelope IS the thing being
 *     drawn, so shape and spread are not approximated here at all: they are the
 *     literal curve of the tail.
 *
 *   What convolution genuinely costs us is that a parameter change means
 *   rebuilding the response rather than turning a knob on a running network,
 *   which takes a few milliseconds of arithmetic. Hence the debounce in
 *   oaRefreshReverb(). The real machine has the same tell for the same reason:
 *   the manual notes that changing SIZE briefly mutes the audio while it
 *   re-allocates its delay memory.
 *
 *   The response is built in oaBuildImpulse() below, in the order sound
 *   actually arrives: pre-delay, then discrete early reflections off the walls,
 *   then the diffuse late tail with its own two-band decay.
 */

// Every parameter the machine has, in VARC page order — six to a page, because
// there are six sliders. `fmt` renders the value the way the red LED readout
// does: 2.065, 120, 30M, 3.40K, 0MS.
const kHz = function (v) {
    return v >= 1000 ? (v / 1000).toFixed(2) + 'K' : Math.round(v) + '';
};

window.OA_REVERB_PARAMS = [
    // ---- PAGE 1: the six on the front of the manual ----
    { key: 'rtMid', kind: 'continuous', short: 'RTM', name: 'Reverb Time', page: 0, min: 0.15, max: 12, step: 0.005,
      fmt: (v) => v.toFixed(3),
      hint: 'How long the tail takes to fall 60dB. The single biggest decision.' },
    { key: 'shape', kind: 'continuous', short: 'SHP', name: 'Shape', page: 0, min: 0, max: 255, step: 1,
      fmt: (v) => String(Math.round(v)),
      hint: 'The CONTOUR of the buildup. Low is an immediate hit that decays; high swells in before it falls.' },
    { key: 'spread', kind: 'continuous', short: 'SPR', name: 'Spread', page: 0, min: 0, max: 255, step: 1,
      fmt: (v) => String(Math.round(v)),
      hint: 'How LONG the buildup lasts. Shape draws the curve, spread stretches it.' },
    { key: 'size', kind: 'continuous', short: 'SIZ', name: 'Size', page: 0, min: 4, max: 39, step: 1,
      fmt: (v) => Math.round(v) + 'M',
      hint: 'Room dimension in metres. Sets the spacing of the early reflections, and scales spread with it.' },
    { key: 'hfCut', kind: 'continuous', short: 'HFC', name: 'HF Cutoff', page: 0, min: 500, max: 20000, step: 10,
      fmt: kHz,
      hint: 'Air and soft walls eat the top end as the tail ages. Lower is a darker, more distant room.' },
    { key: 'preDelay', kind: 'continuous', short: 'PDL', name: 'Pre Delay', page: 0, min: 0, max: 250, step: 1,
      fmt: (v) => Math.round(v) + 'MS',
      hint: 'Silence before the room answers. A few milliseconds keeps the dry hit clear of the tail.' },

    // ---- PAGE 2 ----
    { key: 'diffusion', kind: 'continuous', short: 'DIF', name: 'Diffusion', page: 1, min: 0, max: 255, step: 1,
      fmt: (v) => String(Math.round(v)),
      hint: 'How smeared the early part is. Low leaves discrete slapping echoes; high is a smooth wash.' },
    { key: 'rtLow', kind: 'continuous', short: 'RTL', name: 'Bass Multiply', page: 1, min: 0.2, max: 4, step: 0.05,
      fmt: (v) => v.toFixed(2) + 'X',
      hint: 'Low-frequency decay as a multiple of reverb time. Above 1 the bottom rings on after the top has gone.' },
    { key: 'xover', kind: 'continuous', short: 'XOV', name: 'Crossover', page: 1, min: 80, max: 2000, step: 10,
      fmt: kHz,
      hint: 'Where bass multiply stops applying and reverb time takes over.' },
    { key: 'erLevel', kind: 'continuous', short: 'ERL', name: 'Early Level', page: 1, min: 0, max: 1, step: 0.01,
      fmt: (v) => String(Math.round(v * 100)),
      hint: 'Loudness of the discrete wall bounces against the diffuse tail.' },
    { key: 'erTime', kind: 'continuous', short: 'ERT', name: 'Early Time', page: 1, min: 0.2, max: 3, step: 0.02,
      fmt: (v) => v.toFixed(2) + 'X',
      hint: 'Stretches or compresses the early reflection pattern without moving the room size.' },
    { key: 'ret', kind: 'continuous', short: 'LVL', name: 'Return Level', page: 1, min: 0, max: 1, step: 0.01,
      fmt: (v) => String(Math.round(v * 100)),
      hint: 'How much of this machine comes back into the mix. The return fader on the strip is the same control.' },
];

window.OA_REVERB_PAGES = 2;

window.oaReverbParam = function (key) {
    return window.OA_REVERB_PARAMS.find(function (p) { return p.key === key; });
};
// The six that page `n` puts under the sliders, left to right.
window.oaReverbPageParams = function (page) {
    return window.OA_REVERB_PARAMS.filter(function (p) { return p.page === (page | 0); });
};

// ---------------------------------------------------------------------------
// The programs live in oaReverbPrograms.js — eleven banks of ten, loaded before
// this file because the two machines below are built from them. Only the way
// they are ADDRESSED is here.
// ---------------------------------------------------------------------------
window.oaReverbBank = function (b) {
    return window.OA_REVERB_BANKS[Math.max(0, Math.min(window.OA_REVERB_BANKS.length - 1, b | 0))];
};
window.oaReverbProgram = function (b, pr) {
    const bank = window.oaReverbBank(b);
    return bank.programs[Math.max(0, Math.min(bank.programs.length - 1, pr | 0))];
};

// Two machines. A comes up as the general-purpose hall, B as the long dark
// space, so the pair is useful before anyone touches a slider.
window.OA_REVERB_UNITS = [
    { name: 'RV A', color: '#5f9ea0', bank: 0, prog: 1, ret: 0.4 },
    { name: 'RV B', color: '#4a7fb0', bank: 4, prog: 1, ret: 0.4 },
];
window.OA_REVERB_COUNT = window.OA_REVERB_UNITS.length;

// The four sizes and two tones the old dropdowns offered, mapped onto the
// nearest program so a machine that was set up before this existed comes back
// recognisably rather than snapping to a default.
const LEGACY = {
    'short|bright':     [2, 0], 'short|dull':     [2, 4],
    'medium|bright':    [1, 1], 'medium|dull':    [2, 4],
    'long|bright':      [1, 2], 'long|dull':      [1, 4],
    'extralong|bright': [0, 4], 'extralong|dull': [4, 1],
};

const rvUnit = function (saved, i) {
    const d = window.OA_REVERB_UNITS[i];
    const s = saved || {};
    let bank = d.bank, prog = d.prog;

    // A pre-VARC unit stored size/tone as strings. Nothing else did.
    if (typeof s.size === 'string') {
        const hit = LEGACY[s.size + '|' + s.tone] || [d.bank, d.prog];
        bank = hit[0];
        prog = hit[1];
    } else if (typeof s.bank === 'number') {
        bank = s.bank;
        prog = s.prog;
    }
    bank = Math.max(0, Math.min(window.OA_REVERB_BANKS.length - 1, bank | 0));
    prog = Math.max(0, Math.min(window.oaReverbBank(bank).programs.length - 1, prog | 0));

    const unit = {
        sends: window.oaFxSendArray(s.sends),
        bank: bank, prog: prog,
        // Which page the VARC was left on, and whether the program has been
        // edited away from its stored values (the machine shows a dot for this).
        page: Math.max(0, Math.min(window.OA_REVERB_PAGES - 1, Number(s.page) || 0)),
        edited: !!s.edited,
        standby: !!s.standby,
        ret: typeof s.ret === 'number' ? s.ret : d.ret,
    };
    // Start from the program, then let anything explicitly saved override it —
    // so an edited machine reloads edited, and a new parameter added later
    // arrives at its program value rather than undefined.
    const base = window.oaReverbProgram(bank, prog).p;
    window.OA_REVERB_PARAMS.forEach(function (p) {
        if (p.key === 'ret') return;
        const v = Number(s[p.key]);
        unit[p.key] = isFinite(v) && s[p.key] !== undefined
            ? Math.max(p.min, Math.min(p.max, v))
            : base[p.key];
    });
    return unit;
};

window.OA_REVERB = (function () {
    let saved = null;
    try { saved = JSON.parse(window.localStorage.getItem('oaReverb')); } catch (e) {}
    const units = (saved && Array.isArray(saved.units)) ? saved.units : [saved];
    return { units: window.OA_REVERB_UNITS.map((d, i) => rvUnit(units[i], i)) };
})();

window.oaReverbUnit = function (u) {
    return window.OA_REVERB.units[u] || window.OA_REVERB.units[0];
};

window.oaSaveReverb = function () {
    try { window.localStorage.setItem('oaReverb', JSON.stringify(window.OA_REVERB)); } catch (e) {}
};

/** The name the VARC shows on its top line, with the edit dot. */
window.oaReverbProgramName = function (u) {
    const unit = window.oaReverbUnit(u);
    return window.oaReverbProgram(unit.bank, unit.prog).name;
};

// ---------------------------------------------------------------------------
// THE ROOM ITSELF
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Every room that has been drawn, kept under the settings that drew it.
//
// Drawing a response is a couple of million random numbers and an exp() every
// 256 of them, on the main thread, and it happens on the trailing edge of every
// slider move and every program recall. That is milliseconds of arithmetic in
// the same thread that has to hand the audio device its next block — which is
// exactly what a dropout is made of.
//
// So a room, once drawn, stays. Recalling a program you have used before, or
// walking a slider back to where it was, is now a map lookup. It also means a
// recalled program comes back as the SAME room: the build is full of
// Math.random(), so rebuilding it gave a different set of reflections every
// time, and A/B-ing two settings was never quite comparing like with like.
//
// The key carries the sample rate because the response is drawn for a rate, and
// nothing else about the context: an AudioBuffer is PCM data, not a node, so
// the offline renderer at the same rate can and should share these.
// ---------------------------------------------------------------------------
window.OA_IR_CACHE_BUDGET = window.OA_IR_CACHE_BUDGET || 96 * 1024 * 1024;
const irCache = window.oaBufferCache
    ? window.oaBufferCache('rooms', function () { return window.OA_IR_CACHE_BUDGET; })
    : null;

const irKey = function (rate, unit) {
    // Every declared parameter except the return fader, which is a gain on the
    // way out and changes nothing about the room. Taken from the table rather
    // than listed by hand so a parameter added later cannot quietly start
    // sharing another room's response.
    const parts = [rate];
    window.OA_REVERB_PARAMS.forEach(function (p) {
        if (p.key !== 'ret') parts.push(unit[p.key]);
    });
    return parts.join('|');
};

/** Drop every drawn room. For the leak tests and a hard reset. */
window.oaClearImpulseCache = function () { if (irCache) irCache.clear(); };

/**
 * Draw the impulse response for one machine.
 *
 * Read top to bottom and it is the life of a single handclap in the room: it
 * leaves the source (pre-delay), it hits the walls a few times and comes back
 * as distinct slaps (early reflections), and those slaps multiply into a wash
 * that swells and then dies (the late tail).
 */
// PURE, and on purpose: no `window`, no context, nothing from this file's
// scope. It is the one function that runs in two places — here, when there is
// no Worker (an offline render, a test), and inside a Worker made from its own
// source text when there is one — so it takes the rate and the settings and
// hands back two channels of samples. `irSeconds` is restated inside for the
// same reason. PLAN-3315.01.
const drawImpulseChannels = function (rate, unit) {
    // How long a response has to be to hold everything the parameters ask for:
    // the silence in front, the swell, and the tail's fall to silence. Capped
    // so a runaway setting cannot ask for a hundred megabytes of buffer.
    const irSeconds = function (u) {
        const build = (u.spread / 255) * (0.03 + (u.size / 39) * 0.5);
        const tail = u.rtMid * Math.max(1, u.rtLow) * 1.15;
        return Math.min(14, u.preDelay / 1000 + build + tail + 0.05);
    };
    const len = Math.max(1, Math.floor(rate * irSeconds(unit)));
    const channels = [new Float32Array(len), new Float32Array(len)];

    const preS = Math.floor((unit.preDelay / 1000) * rate);
    const diff = unit.diffusion / 255;
    const shape = unit.shape / 255;
    const buildS = Math.max(1, Math.floor(((unit.spread / 255) * (0.03 + (unit.size / 39) * 0.5)) * rate));

    // Decay as a per-sample multiplier rather than a pow() per sample: a 60dB
    // fall over rtMid seconds is exp(-6.9078 t / rt), and exp(a+b) = exp(a)exp(b),
    // so the whole envelope is one multiply in the inner loop.
    const decMulHi = Math.exp(-6.907755 / Math.max(0.05, unit.rtMid) / rate);
    const decMulLo = Math.exp(-6.907755 / Math.max(0.05, unit.rtMid * unit.rtLow) / rate);

    // The buildup contour. Low shape is a near-instant onset, high shape swells
    // in slowly — this exponent IS the SHAPE slider.
    const shapeExp = 0.12 + shape * 4.0;

    // Air and soft walls take the top off as the tail ages: the response starts
    // at HF CUTOFF and closes toward a third of it by the end.
    const lpAt = function (frac) {
        const hz = unit.hfCut * (1 - 0.66 * frac);
        return Math.exp(-2 * Math.PI * Math.max(200, hz) / rate);
    };
    // The crossover one-pole that splits the tail into the two decay bands.
    const xoCoef = Math.exp(-2 * Math.PI * unit.xover / rate);

    // Early reflections. Spacing follows the room: sound covers `size` metres in
    // size/343 seconds, and each bounce is a little later and a little quieter.
    // Low diffusion leaves them as bare slaps, high diffusion smears each one
    // into a burst so they melt into the tail.
    const baseTap = (unit.size / 343) * unit.erTime;
    const smear = Math.max(1, Math.floor(diff * 0.012 * rate));
    const TAPS = 18;

    for (let ch = 0; ch < 2; ch++) {
        const d = channels[ch];

        // --- the discrete bounces ---
        // The two sides get their own irrational spacing so the pattern never
        // lines up between them; identical taps would collapse the room to a
        // point between the speakers.
        const skew = ch === 0 ? 1 : 1.037;
        for (let t = 1; t <= TAPS; t++) {
            // Irrational-ish stepping so the taps never fall into a rhythm,
            // which would ring as a pitch rather than read as a room.
            const when = baseTap * skew * (t * 0.61803 + Math.sin(t * 2.4) * 0.17 + 0.25);
            const at = preS + Math.floor(when * rate);
            if (at >= len) break;
            const amp = unit.erLevel * Math.pow(0.82, t) * (ch === 0 ? 1 : 0.93);
            // A bare tap at low diffusion, a short burst of noise at high.
            const n = Math.max(1, Math.floor(smear * (0.4 + 0.6 * Math.random())));
            for (let k = 0; k < n && at + k < len; k++) {
                const w = 1 - k / n;
                d[at + k] += amp * w * (n === 1 ? 1 : (Math.random() * 2 - 1));
            }
        }

        // --- the diffuse tail ---
        let lp = 0, prev = 0, low = 0;
        let decHi = 1, decLo = 1;
        let coef = lpAt(0);
        const lateStart = preS;
        for (let i = lateStart; i < len; i++) {
            const age = (i - lateStart);

            // Refresh the damping every 256 samples. Recomputing an exp() per
            // sample doubles the cost of the whole build for a curve that moves
            // far too slowly to hear the steps.
            if ((age & 255) === 0) coef = lpAt(age / (len - lateStart));

            const white = Math.random() * 2 - 1;
            lp = white * (1 - coef) + lp * coef;

            // Split into two bands so bass multiply can give the bottom its own
            // decay — a real hall's low end always outlasts its top.
            low = lp * (1 - xoCoef) + low * xoCoef;
            const high = lp - low;

            decHi *= decMulHi;
            decLo *= decMulLo;

            // The swell. Below the build length the energy is still arriving,
            // and shapeExp decides how abruptly.
            const build = age < buildS ? Math.pow(age / buildS, shapeExp) : 1;

            const v = (high * decHi + low * decLo) * build;
            // Sparse at low diffusion: only a fraction of samples carry energy,
            // which is what leaves a tail sounding grainy and discrete.
            d[i] += (diff > 0.9 || Math.random() < 0.25 + diff * 0.75) ? v : v * 0.25;
            prev = lp;
        }
    }
    return channels;
};

const impulseBuffer = function (ctx, rate, channels) {
    const buf = ctx.createBuffer(2, channels[0].length, rate);
    // copyToChannel where it exists; a fake context in the tests hands back
    // plain arrays from getChannelData, so the fallback is a copy by hand.
    for (let ch = 0; ch < 2; ch++) {
        if (buf.copyToChannel) buf.copyToChannel(channels[ch], ch);
        else buf.getChannelData(ch).set(channels[ch]);
    }
    return buf;
};

const drawImpulse = function (ctx, unit) {
    // Through oaSampleRate() rather than ctx.sampleRate: the response is built
    // for whichever context asked, but a missing context must not turn every
    // coefficient below into NaN and hand the convolver a buffer of silence.
    const rate = window.oaSampleRate(ctx);
    return impulseBuffer(ctx, rate, drawImpulseChannels(rate, unit));
};

// ---------------------------------------------------------------------------
// OFF THE MAIN THREAD. PLAN-3315.01.
//
// The cache above made a room you have heard before free. A room you have NOT
// heard before is still a couple of million random numbers, and a fourteen
// second tail is long enough to hold the page's main thread past a block — so
// on a live context it is drawn in a Worker and handed to the convolver when it
// arrives. The old room keeps sounding until then, which is what a hardware
// unit does while it recomputes. An OfflineAudioContext, or a page with no
// Worker, draws it inline exactly as before: an offline render must not
// schedule the room it is about to render.
// ---------------------------------------------------------------------------
let irWorker = null;
let irWorkerDead = false;
let irNext = 1;
const irWaiting = new Map();

const impulseWorker = function () {
    if (irWorker || irWorkerDead) return irWorker;
    if (typeof Worker === 'undefined' || !window.Blob || !window.URL) { irWorkerDead = true; return null; }
    try {
        const src = 'const drawImpulseChannels = ' + drawImpulseChannels.toString() + ';\n'
            + 'self.onmessage = function (e) {\n'
            + '  const ch = drawImpulseChannels(e.data.rate, e.data.unit);\n'
            + '  self.postMessage({ id: e.data.id, channels: ch }, [ch[0].buffer, ch[1].buffer]);\n'
            + '};\n';
        irWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
        irWorker.onmessage = function (e) {
            const job = irWaiting.get(e.data.id);
            if (!job) return;
            irWaiting.delete(e.data.id);
            job(e.data.channels);
        };
        irWorker.onerror = function () {
            // A worker that cannot run is not a reason to have no reverb.
            irWorkerDead = true;
            irWorker = null;
            const jobs = Array.from(irWaiting.values());
            irWaiting.clear();
            jobs.forEach(function (job) { job(null); });
        };
    } catch (e) {
        irWorkerDead = true;
        irWorker = null;
    }
    return irWorker;
};

/**
 * The room for these settings, handed to `apply` — at once if it is cached or
 * the context is offline, from a Worker if it has to be drawn on a live one.
 */
window.oaBuildImpulseLive = function (ctx, unit, apply) {
    const rate = window.oaSampleRate(ctx);
    const key = irCache ? irKey(rate, unit) : null;
    const hit = key && irCache.get(key);
    if (hit) { apply(hit); return; }

    const worker = !ctx.startRendering ? impulseWorker() : null;
    if (!worker) { apply(window.oaBuildImpulse(ctx, unit)); return; }

    const id = irNext++;
    irWaiting.set(id, function (channels) {
        const buf = channels ? impulseBuffer(ctx, rate, channels) : drawImpulse(ctx, unit);
        apply(key ? irCache.put(key, buf) : buf);
    });
    worker.postMessage({ id: id, rate: rate, unit: JSON.parse(JSON.stringify(unit)) });
};

/**
 * The room for these settings — drawn if it is new, handed back if it is not.
 * Same name and signature it always had; every caller gets the cache for free.
 */
window.oaBuildImpulse = function (ctx, unit) {
    if (!irCache) return drawImpulse(ctx, unit);
    const key = irKey(window.oaSampleRate(ctx), unit);
    return irCache.get(key) || irCache.put(key, drawImpulse(ctx, unit));
};

// Kept under its old name and signature: the offline renderer and anything else
// that only knows "give me a room" still works.
window.oaMakeImpulse = function (ctx, u) {
    return window.oaBuildImpulse(ctx, window.oaReverbUnit(u | 0));
};

// ---------------------------------------------------------------------------
// THE AUDIO PORTS.
//
// Everything below this line that builds or holds a node is FILE-LOCAL. The
// only way another module reaches this reverb's audio is oaReverbInput(), which
// hands back one node to connect into and says nothing about what is behind it.
//
// It used to be oaReverbBus(ctx, r).input, called from two other files. That
// published the whole bus object — convolver, return fader, analysers — so
// re-plumbing the machine meant re-plumbing its callers, and the tape delay
// could (and did) reach past the input into the same object's internals.
// ---------------------------------------------------------------------------

// One set of buses per AudioContext — the offline renderer gets its own.
const reverbBus = function (ctx, u) {
    const idx = Math.max(0, Math.min(window.OA_REVERB_COUNT - 1, u | 0));
    const buses = ctx.__oaReverbs || (ctx.__oaReverbs = []);
    if (!buses[idx]) {
        const unit = window.oaReverbUnit(idx);
        const input = ctx.createGain();          // everything sends in here
        const convolver = ctx.createConvolver();
        const ret = ctx.createGain();
        convolver.normalize = true;
        window.oaBuildImpulseLive(ctx, unit, function (buf) { convolver.buffer = buf; });
        ret.gain.value = unit.standby ? 0 : unit.ret;
        input.connect(convolver);
        convolver.connect(ret);
        // The return is part of the mix, so it lands on the MASTER BUS with
        // everything else — a bus compressor that could not hear the reverb
        // would let the tails swell up every time the dry signal ducked.
        ret.connect(window.oaMasterInput ? window.oaMasterInput(ctx) : ctx.destination);

        // Tap the wet output per side so the return strip and the VARC's own
        // meter can show what is actually ringing, rather than guessing from
        // the send levels.
        let analysers = null;
        if (ctx.createAnalyser && ctx.createChannelSplitter) {
            const split = ctx.createChannelSplitter(2);
            ret.connect(split);
            analysers = [0, 1].map((ch) => {
                const a = ctx.createAnalyser();
                a.fftSize = 1024;
                split.connect(a, ch);
                return a;
            });
        }
        buses[idx] = { input: input, convolver: convolver, ret: ret, analysers: analysers, muted: false };
    }
    return buses[idx];
};

/**
 * THE INPUT PORT: the node a sender connects to, built on first ask. This is the
 * whole of this machine's public audio surface — a caller gets somewhere to send
 * and nothing it could reach through.
 */
window.oaReverbInput = function (ctx, u) {
    return reverbBus(ctx, u).input;
};

/** Is any channel feeding machine `u`? Asked by the warm-up, answered here. */
window.oaReverbIsFed = function (u) {
    const unit = window.oaReverbUnit(u);
    const eps = window.OA_FX_SEND_EPSILON || 0.001;
    return !!(unit && unit.sends && unit.sends.some(function (v) { return v > eps; }));
};

/** This channel's send into machine `u`, 0..1. */
window.oaReverbSend = function (u, idx) {
    const unit = window.oaReverbUnit(u);
    return (unit && unit.sends && unit.sends[idx]) || 0;
};

/**
 * Build every machine anything actually sends to. Called by oaWarmFx() — which
 * used to loop over OA_REVERB.units itself, reading a send array belonging to
 * this file and deciding on its behalf what "in use" meant.
 */
window.oaReverbWarm = function (ctx) {
    for (let r = 0; r < window.OA_REVERB_COUNT; r++) {
        if (window.oaReverbIsFed(r)) reverbBus(ctx, r);
    }
};

/** How many reverb buses exist on this context — for the voice diagnostic. */
window.oaReverbBusCount = function (ctx) {
    return ((ctx && ctx.__oaReverbs) || []).filter(Boolean).length;
};

// Rebuilding a response is milliseconds of arithmetic, and a slider drag fires
// dozens of changes a second. The level is applied at once because it is just a
// gain; the room is redrawn on a trailing edge once the hand stops.
const pending = {};
window.oaRefreshReverb = function (u, immediate) {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaReverbs && ctx.__oaReverbs[u];
    if (!bus) return;
    const unit = window.oaReverbUnit(u);
    bus.ret.gain.value = window.oaReverbGain(u, bus);

    if (pending[u]) clearTimeout(pending[u]);
    const build = function () {
        pending[u] = null;
        window.oaBuildImpulseLive(ctx, window.oaReverbUnit(u), function (buf) {
            bus.convolver.buffer = buf;
            window.dispatchEvent(new CustomEvent('oa-reverb-rebuilt', { detail: { unit: u } }));
        });
    };
    if (immediate) build();
    else pending[u] = setTimeout(build, 90);
};

window.oaSetReverb = function (u, key, value) {
    const unit = window.oaReverbUnit(u);
    const p = window.oaReverbParam(key);
    if (p) {
        unit[key] = Math.max(p.min, Math.min(p.max, Number(value) || 0));
        // Anything the sliders touch takes the machine off its stored program.
        if (key !== 'ret') unit.edited = true;
    } else {
        // page, and the legacy 'tone'/'size' a very old song file still carries.
        if (key === 'page') unit.page = Math.max(0, Math.min(window.OA_REVERB_PAGES - 1, value | 0));
        else if (key === 'tone' || key === 'size') {
            // A pre-VARC song file sets these two separately, as strings. Note
            // whichever arrived under its own name — `size` is a number now and
            // writing 'medium' over it would break the room — and map the pair
            // onto the nearest program as soon as one lands.
            unit['__' + key] = value;
            const hit = LEGACY[(unit.__size || 'medium') + '|' + (unit.__tone || 'bright')];
            if (hit) window.oaLoadReverbProgram(u, hit[0], hit[1]);
            return;
        } else unit[key] = value;
    }
    window.oaSaveReverb();
    // The return level is a gain, not a geometry change — never rebuild for it.
    if (key === 'ret' || key === 'page') {
        const ctx = window.OA_AUDIO_CTX;
        const bus = ctx && ctx.__oaReverbs && ctx.__oaReverbs[u];
        if (bus && key === 'ret') bus.ret.gain.value = window.oaReverbGain(u, bus);
    } else {
        window.oaRefreshReverb(u);
    }
    window.dispatchEvent(new CustomEvent('oa-reverb-changed', { detail: { unit: u, key: key } }));
};

/** Load a stored program: every slider moves at once and the edit dot clears. */
window.oaLoadReverbProgram = function (u, bank, prog) {
    const unit = window.oaReverbUnit(u);
    const b = Math.max(0, Math.min(window.OA_REVERB_BANKS.length - 1, bank | 0));
    const pr = Math.max(0, Math.min(window.oaReverbBank(b).programs.length - 1, prog | 0));
    const src = window.oaReverbProgram(b, pr).p;
    unit.bank = b;
    unit.prog = pr;
    unit.edited = false;
    window.OA_REVERB_PARAMS.forEach(function (p) {
        if (p.key === 'ret') return;                 // the return fader is the user's, not the program's
        if (typeof src[p.key] === 'number') unit[p.key] = Math.max(p.min, Math.min(p.max, src[p.key]));
    });
    window.oaSaveReverb();
    window.oaRefreshReverb(u, true);
    window.dispatchEvent(new CustomEvent('oa-reverb-changed', { detail: { unit: u, program: pr, bank: b } }));
};

// Two separate ways for a machine to go quiet, and they must not fight: MUTE is
// momentary and lives on the bus, POWER is a persistent standby and lives on
// the unit so it survives a reload. Either one alone silences the return.
const rvGain = function (u, bus) {
    const unit = window.oaReverbUnit(u);
    return (bus.muted || unit.standby) ? 0 : unit.ret;
};
window.oaReverbGain = rvGain;

/** Is this machine killed right now? A display asks; the flag lives on the bus. */
window.oaReverbMuted = function (u) {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaReverbs && ctx.__oaReverbs[u];
    return !!(bus && bus.muted);
};

/** MUTE on the VARC: drops the return for exactly as long as it is held. */
window.oaMuteReverb = function (u, on) {
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaReverbs && ctx.__oaReverbs[u];
    if (!bus) return;
    bus.muted = !!on;
    bus.ret.gain.setTargetAtTime(rvGain(u, bus), ctx.currentTime, 0.01);
    window.dispatchEvent(new CustomEvent('oa-reverb-changed', { detail: { unit: u, mute: !!on } }));
};

/** POWER on the VARC: takes the machine out of circuit until it is pressed again. */
window.oaSetReverbStandby = function (u, on) {
    const unit = window.oaReverbUnit(u);
    unit.standby = !!on;
    window.oaSaveReverb();
    const ctx = window.OA_AUDIO_CTX;
    const bus = ctx && ctx.__oaReverbs && ctx.__oaReverbs[u];
    if (bus) bus.ret.gain.setTargetAtTime(rvGain(u, bus), ctx.currentTime, 0.02);
    window.dispatchEvent(new CustomEvent('oa-reverb-changed', { detail: { unit: u, standby: !!on } }));
};

window.oaSetReverbSend = function (u, idx, value) {
    const unit = window.oaReverbUnit(u);
    const sends = unit.sends.slice();
    sends[idx] = Math.max(0, Math.min(1, value));
    unit.sends = sends;
    window.oaSaveReverb();
    window.dispatchEvent(new CustomEvent('oa-reverb-changed', { detail: { unit: u, idx: idx } }));
};

/**
 * Take both machines out of a context. The convolver holds an impulse response
 * — seconds of stereo float, the largest single allocation in the effects rack
 * — so dropping the buffer matters as much as dropping the node.
 */
window.oaDisposeReverb = function (ctx) {
    const buses = ctx && ctx.__oaReverbs;
    if (!buses) return;
    Object.keys(pending).forEach(function (u) {
        // A rebuild still on the debounce would fire into a bus that no longer
        // exists and build a fresh impulse for nobody.
        if (pending[u]) clearTimeout(pending[u]);
        pending[u] = null;
    });
    buses.forEach(function (bus) {
        if (!bus) return;
        window.oaDisconnectAll([bus.input, bus.convolver, bus.ret].concat(bus.analysers || []));
        bus.convolver.buffer = null;
    });
    buses.length = 0;
};

// ---------------------------------------------------------------------------
// The back end, as the VARC sees it.
// ---------------------------------------------------------------------------

// The tail, downsampled to something a panel can plot. Rebuilt only when the
// room is — a display asking sixty times a second gets the same array back.
const RV_CURVE_LEN = 256;
const rvCurves = [];
const rvCurveKey = [];

window.oaRegisterPlugin({
    id: 'reverb',
    label: 'Reverb',
    event: 'oa-reverb-changed',
    units: function () { return window.OA_REVERB_COUNT; },
    params: window.OA_REVERB_PARAMS,

    // Every stored program, flattened to one map so a generic panel can load
    // one by name. The VARC still addresses them by bank and number, which is
    // how the machine it copies works — oaLoadReverbProgram is unchanged.
    presets: (function () {
        const out = {};
        window.OA_REVERB_BANKS.forEach(function (bank, b) {
            bank.programs.forEach(function (prog, p) {
                out[b + ':' + p] = { label: bank.name + ' — ' + prog.name, bank: b, prog: p };
            });
        });
        return out;
    })(),

    state: function (i) { return window.oaReverbUnit(i); },
    set: function (i, key, value) { window.oaSetReverb(i, key, value); },
    preset: function (i, name) {
        const p = window.oaPluginPresets('reverb')[name];
        if (p) window.oaLoadReverbProgram(i, p.bank, p.prog);
    },

    slots: window.OA_SLOT.USER + 2,
    layout: {
        /** 1 while the machine is in standby or muted — the panel's POWER lamp. */
        SILENT: window.OA_SLOT.USER,
        /** Return level actually in force, after mute and standby. */
        RETURN: window.OA_SLOT.USER + 1,
    },

    read: function (ctx, i, frame) {
        const S = window.OA_SLOT;
        const unit = window.oaReverbUnit(i);
        const bus = ctx && ctx.__oaReverbs && ctx.__oaReverbs[i];
        frame[S.ACTIVE] = bus && !unit.standby ? 1 : 0;
        frame[S.USER] = (unit.standby || (bus && bus.muted)) ? 1 : 0;
        frame[S.USER + 1] = bus ? window.oaReverbGain(i, bus) : 0;
        if (!bus || !bus.analysers) {
            frame[S.PEAK_L] = 0;
            frame[S.PEAK_R] = 0;
            return;
        }
        window.oaWritePeak(frame, S.PEAK_L, window.oaAnalyserPeak(bus.analysers[0]));
        window.oaWritePeak(frame, S.PEAK_R, window.oaAnalyserPeak(bus.analysers[1]));
    },

    /**
     * The shape of the tail, as an envelope of 256 points, 0..1. This is what a
     * display draws when it draws a reverb — and it comes from the impulse the
     * convolver is ACTUALLY running, not from a second guess at the maths.
     */
    curve: function (i) {
        const unit = window.oaReverbUnit(i);
        const key = window.OA_REVERB_PARAMS.map(function (p) { return unit[p.key]; }).join('|');
        if (rvCurveKey[i] === key && rvCurves[i]) return rvCurves[i];

        const ctx = window.OA_AUDIO_CTX;
        const bus = ctx && ctx.__oaReverbs && ctx.__oaReverbs[i];
        const buf = bus && bus.convolver && bus.convolver.buffer;
        if (!buf) return rvCurves[i] || null;

        const d = buf.getChannelData(0);
        const out = rvCurves[i] || (rvCurves[i] = new Float32Array(RV_CURVE_LEN));
        const per = Math.max(1, Math.floor(d.length / RV_CURVE_LEN));
        let top = 1e-9;
        for (let k = 0; k < RV_CURVE_LEN; k++) {
            let peak = 0;
            const start = k * per;
            for (let j = 0; j < per && start + j < d.length; j++) {
                const a = d[start + j] < 0 ? -d[start + j] : d[start + j];
                if (a > peak) peak = a;
            }
            out[k] = peak;
            if (peak > top) top = peak;
        }
        // Normalised, because a panel plots a shape and the absolute level of an
        // impulse response is a property of the convolver's own normalisation.
        for (let k = 0; k < RV_CURVE_LEN; k++) out[k] /= top;
        rvCurveKey[i] = key;
        return out;
    },

    dispose: window.oaDisposeReverb,

    /** Both machines, whole. */
    save: function () { return { units: window.OA_REVERB.units }; },

    /**
     * Put them back. The ORDER here is the whole of it: a program load
     * overwrites every slider, so it has to happen FIRST and the saved
     * parameters go on top of it — otherwise an edited machine comes back as
     * the program it started from and every edit is silently lost.
     *
     * A v1 song carried one flat reverb rather than a list; it lands on unit A.
     */
    load: function (data) {
        const units = Array.isArray(data && data.units) ? data.units : [data];
        units.slice(0, window.OA_REVERB_COUNT).forEach(function (rv, u) {
            if (!rv) return;
            if (Array.isArray(rv.sends)) {
                rv.sends.forEach(function (v, i) { window.oaSetReverbSend(u, i, v); });
            }
            if (typeof rv.bank === 'number' && typeof rv.prog === 'number') {
                window.oaLoadReverbProgram(u, rv.bank, rv.prog);
            }
            window.OA_REVERB_PARAMS.forEach(function (p) {
                if (rv[p.key] !== undefined) window.oaSetReverb(u, p.key, rv[p.key]);
            });
            // A pre-VARC song carries these two as STRINGS instead of a program
            // number; oaSetReverb maps the pair onto the nearest program.
            if (typeof rv.size === 'string') window.oaSetReverb(u, 'size', rv.size);
            if (typeof rv.tone === 'string') window.oaSetReverb(u, 'tone', rv.tone);
            if (rv.ret !== undefined) window.oaSetReverb(u, 'ret', rv.ret);
            if (rv.standby !== undefined) window.oaSetReverbStandby(u, !!rv.standby);
        });
    },
});
