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
 * Header: oaBussCompEngine.js
 * Purpose: The two engines the master bus can sit across — the AudioWorklet
 *   node and the native fallback — and the one function that resolves the
 *   panel into the values both of them read.
 * Description: Kept out of oaBussComp.js, which builds the bus around one of
 *   these (masterBus) and owns it. Shared through window.oaBussSettings,
 *   window.oaBussWorkletEngine and window.oaBussNativeEngine, called at build
 *   time rather than at load, so this file may sit on either side of it.
 */

/** Panel dB reference. 0 on the THRESHOLD collar is this many dBFS. */
const OA_BUSS_THRESH_REF = -18;

/**
 * The live values behind the panel, resolved through every switch. One place,
 * so the worklet and the native chain cannot drift apart.
 */
const bussSettings = function (u) {
    const on = !!u.on;
    const rel = window.oaBussRelease(u.release);
    // MIX IS DEPRECATED, and this is where it stopped applying.
    //
    // Parallel compression on the MASTER is a control with one right answer and
    // a lot of wrong ones: it is the last thing before the output, so any blend
    // below fully wet is a second, uncompressed copy of the whole record summed
    // back over itself. That is a phase problem before it is a taste problem —
    // the wet path has the compressor's own group delay, so the two copies do
    // not line up, and what sounds like "punch coming back" is a comb filter
    // across the mix. Where parallel belongs is a CHANNEL, and every channel
    // already has it: the strip compressor's BLEND knob.
    //
    // The field survives so that saved settings, songs and the factory presets
    // still load without a special case; it simply no longer reaches the DSP.
    // Fully wet, both laws, always.
    const wet = 1;
    const dry = 0;
    return {
        // Out of circuit, the trim goes with it: IN is a bypass of the whole
        // unit, not of the compression alone.
        trim: on ? Math.pow(10, u.trim / 20) : 1,
        thresh: u.thresh + OA_BUSS_THRESH_REF,
        ratio: window.oaBussRatio(u.ratio),
        attack: window.oaBussAttackTime(u.attack),
        release: rel.sec,
        relMode: rel.auto,
        makeup: on ? Math.pow(10, u.makeup / 20) : 1,
        // The switch and the blend knob are one lever as far as the DSP is
        // concerned: at wet 0 / dry 1 the output is the input, sample for sample.
        wet: on ? wet : 0,
        dry: on ? dry : 1,
        hpf: u.sc < 5 ? 0 : Math.round(u.sc / 10) * 10,
        fb: (on && u.fb) ? 1 : 0,
        lowThd: (on && u.lowThd) ? 1 : 0,
        fourK: (on && u.fourK) ? 1 : 0,
        dist: u.dist,
        scSum: u.scSum ? 1 : 0,
    };
};

/**
 * Which parameters may be SLID to their new value and which have to SNAP.
 *
 * A level can be walked across in twenty milliseconds and the ear hears a move
 * rather than a step. A stepped pot cannot: slide the ratio from 20:1 to -2.5:1
 * and it passes through 1:1 and then through ZERO on the way, and a ratio of
 * zero is a divide by nothing in the gain computer. The mode switches are worse
 * — a boolean that eases from 0 to 1 spends fifteen milliseconds being neither.
 *
 * So: the four continuous controls glide, and every detent and switch is set at
 * the instant it is pressed, which is also what the hardware does.
 */
const BUSS_GLIDE = { trim: 1, thresh: 1, makeup: 1, wet: 1, dry: 1 };

const workletEngine = function (ctx, u, bus) {
    const node = new AudioWorkletNode(ctx, 'oa-buss-comp', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
    });
    const s = bussSettings(u);
    Object.keys(s).forEach(function (k) {
        const p = node.parameters.get(k);
        if (p) p.value = s[k];
    });
    node.port.onmessage = function (e) { bus.gr = e.data; };

    return {
        input: node,
        output: node,
        full: true,
        apply: function (next) {
            const v = bussSettings(next);
            const t = ctx.currentTime;
            Object.keys(v).forEach(function (k) {
                const p = node.parameters.get(k);
                if (!p) return;
                // 20 ms: short enough to feel immediate, long enough that
                // dragging a knob is a slide rather than a staircase of zipper
                // noise. Everything else lands on the sample it was asked for.
                if (BUSS_GLIDE[k]) p.setTargetAtTime(v[k], t, 0.02);
                else p.setValueAtTime(v[k], t);
            });
        },
        gr: null,
    };
};

/**
 * The same shape from native nodes, for browsers without AudioWorklet.
 *
 * What survives: threshold, ratio, attack, release, knee, make-up, trim and the
 * mix blend. What cannot: the browser's compressor has no side-chain input, so
 * the S/C FILTER does nothing; its ratio is clamped at 1, so the three negative
 * positions land on 20:1; there is no way to feed its detector from its own
 * output, so F/B is out; and 44K's saturation and LOW THD's release cap both live
 * inside a per-sample loop that does not exist here. The panel greys those
 * switches out rather than pretending — see `oaBussFullDsp()`.
 */
const nativeEngine = function (ctx, u) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const pre = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const post = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();

    input.connect(pre);
    pre.connect(dry);
    dry.connect(output);
    pre.connect(comp);
    comp.connect(post);
    post.connect(wet);
    wet.connect(output);

    const apply = function (next) {
        const s = bussSettings(next);
        const t = ctx.currentTime;
        pre.gain.setTargetAtTime(s.trim, t, 0.02);
        post.gain.setTargetAtTime(s.makeup, t, 0.02);
        wet.gain.setTargetAtTime(s.wet, t, 0.02);
        dry.gain.setTargetAtTime(s.dry, t, 0.02);
        comp.threshold.setTargetAtTime(Math.max(-100, Math.min(0, s.thresh)), t, 0.02);
        comp.knee.setTargetAtTime(6, t, 0.02);
        // A native ratio cannot go below 1, so a negative position becomes the
        // hardest thing this node can do rather than silently becoming 1:1.
        comp.ratio.setTargetAtTime(s.ratio < 1 ? 20 : Math.min(20, s.ratio), t, 0.02);
        comp.attack.setTargetAtTime(Math.max(0, Math.min(1, s.attack)), t, 0.02);
        // AUTO has no native equivalent; its short stage is the closest honest
        // answer, and it is the stage that does most of the audible work.
        comp.release.setTargetAtTime(Math.max(0.01, Math.min(1, s.release)), t, 0.02);
    };
    apply(u);

    return {
        input: input, output: output, apply: apply, full: false,
        // No message port here — the meter reads the node's own reduction,
        // which the spec reports as a NEGATIVE number of dB.
        gr: function () { return -comp.reduction; },
    };
};

window.oaBussSettings = bussSettings;
window.oaBussWorkletEngine = workletEngine;
window.oaBussNativeEngine = nativeEngine;
