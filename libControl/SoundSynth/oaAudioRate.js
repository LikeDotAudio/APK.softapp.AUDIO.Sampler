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
 * Header: oaAudioRate.js
 * Purpose: ONE sample rate for the whole app, and the two constructors that
 *   guarantee every context actually runs at it.
 * Description: Every DSP module here turns seconds into samples somewhere — the
 *   reverb's decay multipliers, the tape's circular buffer length, the
 *   compressor's attack coefficients, the drum synth's bounced previews. Each
 *   used to answer "how many samples is that?" for itself, from whatever context
 *   it happened to be handed, with its own fallback when there was none:
 *
 *     oaDrumSynthPatches.js   OA_AUDIO_CTX.sampleRate || 44100
 *     useSeqRenderer.js       OA_AUDIO_CTX.sampleRate || 44100
 *     SoundRecorder.jsx       ctx.sampleRate || 48000
 *
 *   Three fallbacks, two of them disagreeing with the fake used by the tests and
 *   with the 48kHz most devices actually come up at. Nothing sounded broken,
 *   because a wrong rate is not a crash: it is a preview bounced at 44.1k being
 *   drawn against a tail computed at 48k, an offline render printing a tape echo
 *   whose head spacing is 8.8% off the one being monitored, and a recording
 *   written into a WAV header that says something the samples do not.
 *
 *   THE INVARIANT. `OA_SAMPLE_RATE` is the rate every context in this app runs
 *   at — live, offline preview, offline bounce, test harness. It is seeded at
 *   48000 and RECONCILED to the live device the first time a live context is
 *   built, because that is the one rate nothing here gets to choose: a browser
 *   may refuse the requested rate, and if it does, the device wins and every
 *   offline context must follow it rather than the other way round.
 *
 *   Ask through oaSampleRate(ctx) rather than reading ctx.sampleRate, and build
 *   contexts through the two helpers below rather than with `new`. Then there is
 *   exactly one number, and a module that converts seconds to samples cannot
 *   convert them against a different clock than its neighbour.
 *
 *   THE ONE DELIBERATE EXCEPTION is offline processing of an ALREADY DECODED
 *   buffer — trimming, fading and pitching a loaded sample in oaDrumkitSynth.js.
 *   Those render at the source buffer's own rate on purpose: re-rendering a
 *   44.1k sample at 48k to trim 20ms off its head would resample the whole thing
 *   for nothing. The rate here is the rate the app SYNTHESISES and MIXES at.
 */

/**
 * The app's sample rate. Read it through oaSampleRate() — this is reconciled to
 * the live device on first use, so a module that caches the value at load time
 * can be holding the wrong one.
 */
window.OA_SAMPLE_RATE = 48000;

/**
 * The rate `ctx` is running at, or the app's rate when there is no context yet.
 *
 * A context always wins over the constant: an OfflineAudioContext built by
 * something outside this app, or a device that refused the requested rate, is
 * still the clock its own nodes are counting on.
 */
window.oaSampleRate = function (ctx) {
    const r = ctx && ctx.sampleRate;
    return (typeof r === 'number' && r > 0) ? r : window.OA_SAMPLE_RATE;
};

/**
 * A live AudioContext pinned to the app rate.
 *
 * The `sampleRate` option is honoured by every current browser and throws
 * NotSupportedError on some older ones, so a failure falls back to the device
 * default — and then the device's rate is adopted as the app's, which is what
 * keeps the invariant true even when the request was refused.
 */
window.oaNewAudioContext = function () {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    let ctx = null;
    try {
        ctx = new Ctor({ sampleRate: window.OA_SAMPLE_RATE });
    } catch (e) {
        ctx = new Ctor();
    }
    return window.oaAdoptSampleRate(ctx);
};

/**
 * Take `ctx`'s rate as the app's. Called for the live context only: an offline
 * context is built AT the app rate and has nothing to teach it.
 */
window.oaAdoptSampleRate = function (ctx) {
    const r = ctx && ctx.sampleRate;
    if (typeof r === 'number' && r > 0) window.OA_SAMPLE_RATE = r;
    return ctx;
};

/**
 * An OfflineAudioContext at the app rate, sized in SECONDS rather than frames —
 * every caller was doing the same Math.ceil(seconds * rate) and it is the step
 * where a stray rate slips in.
 *
 * Returns null where the browser has no offline rendering at all, which the
 * callers already handle by simply not drawing a preview.
 */
window.oaOfflineContext = function (channels, seconds, rate) {
    const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctor) return null;
    const r = rate || window.oaSampleRate();
    const frames = Math.max(1, Math.ceil(Math.max(0, seconds) * r));
    return new Ctor(Math.max(1, channels | 0), frames, r);
};
