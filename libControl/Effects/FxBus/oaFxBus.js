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
 * Header: oaFxBus.js
 * Purpose: The one node a voice connects to — pan, dry path, and every send.
 * Description: Sits above oaReverb.js and oaTapeDelay.js and knows about both.
 *   A voice gets a panner (or a plain gain) that goes straight to the output,
 *   plus one send gain per effect bus that this channel feeds. Sends are read
 *   when the voice is built, so a knob move lands on the next hit rather than
 *   re-levelling notes that are already ringing.
 *
 *   The channel's DRIVE pedal (oaDrive.js) goes in FRONT of all of that, so the
 *   reverbs and tapes are fed the distorted signal — a pedal sits on the floor
 *   before the desk, not in the aux rack. On a clean channel it builds nothing.
 *
 *   The channel's COMPRESSOR (oaCompressor.js) goes on the END of the dry path,
 *   after the pan. Unlike everything else here it is built ONCE per channel and
 *   shared by every voice, because a compressor with no memory of the last hit
 *   is not a compressor. That placement also means the sends are tapped ahead of
 *   it: the reverbs and tapes hear the channel's natural dynamics while the
 *   direct sound is squashed, which is the more useful of the two orders — a
 *   compressed send makes the tail swell up behind every hit.
 */

window.OA_FX_SEND_EPSILON = 0.001;

// ---------------------------------------------------------------------------
// RECORD BYPASS
//
// While a take is being recorded, every effect in the rack comes out of the
// path. Not turned down — OUT, so that nothing between the pad and the speaker
// is doing work that costs time:
//
//   the DRIVE pedal      a WaveShaper at 4x oversampling, which resamples up and
//                        back down and carries the filters to do it
//   the CHANNEL STRIP    an AudioWorklet, so at least one 128-frame quantum
//   the SENDS            no latency on the dry path, but a convolver and four
//                        tape worklets running for a monitor nobody is listening
//                        to is CPU that a glitch-free take needs more
//   the BUSS COMPRESSOR  another worklet, on the one path everything shares
//
// What is left is source → pan → master fade → out. The fade and the meters
// stay: they are not effects, and a take with no metering is worse than a take
// with three milliseconds more latency.
//
// It is deliberately a BUILD-TIME decision, read when each voice is built, so
// arming record does not re-plumb voices that are already sounding — the tail
// of the last hit rings out through the rack it was born into, and the next hit
// is dry. The alternative is a click on every arm.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PRE-FADER AND POST-FADER SENDS
//
// A send is POST-fader when the channel fader is upstream of the tap: pull the
// fader down and the effect goes with it, which is what you want when the
// effect is part of that channel's sound. It is PRE-fader when the tap is
// upstream of the fader: the send holds its level whatever the fader does, and
// at fader zero the channel is silent in the mix while STILL feeding the
// effect. That is how a headphone feed works, and how you get a reverb with no
// dry signal at all.
//
// Every send used to be post-fader, and not by decision: the channel fader was
// multiplied into each voice's own gain BEFORE the voice reached this file, so
// there was nowhere upstream of it to tap. The fader is a node in the chain
// now, which is what makes the distinction possible at all.
//
// WHICH IS WHICH is a property of the send, declared here, so the mixer's
// labels and the node graph cannot disagree — the panel reads this table to
// draw its PRE / POST headings. It is the LEFT COLUMN of the send grid that is
// pre-fader, which is why the flags alternate.
// ---------------------------------------------------------------------------

window.OA_FX_PRE = {
    rv: [true, false],                    // RV A pre, RV B post
    dl: [true, false, true, false],       // DLY 1 and 3 pre, DLY 2 and 4 post
};

/** Is this send tapped ahead of the channel fader? */
window.oaSendIsPre = function (kind, i) {
    const list = window.OA_FX_PRE[kind] || [];
    return !!list[i];
};

// ---------------------------------------------------------------------------
// The channel faders, as the audio layer sees them.
//
// They live in React state (and travel over MQTT), so this is a mirror the
// Mixer keeps current. It exists because a voice is built here, not there: the
// fader has to be a gain node between the pre-fader taps and the post-fader
// ones, and nothing on the audio side knew what the fader was set to.
//
// A side effect worth having: pad hits never applied the channel fader at all —
// only sequenced hits did, because only the sequencer multiplied it in — and an
// offline bounce ignored it too. One fader node in one place fixes all three.
// ---------------------------------------------------------------------------

window.OA_TRACK_FADER = [];

/** The Mixer hands over the whole row whenever it changes. */
window.oaSetTrackFader = function (list) {
    window.OA_TRACK_FADER = Array.isArray(list) ? list.slice() : [];
};

/** This channel's fader, 0..1+. Unity when nothing has said otherwise. */
window.oaTrackFader = function (idx) {
    const v = window.OA_TRACK_FADER[idx];
    return (typeof v === 'number' && isFinite(v)) ? Math.max(0, v) : 1;
};

window.OA_FX_BYPASS = false;

/** Is the rack out of the path right now? */
window.oaFxBypassed = function () { return !!window.OA_FX_BYPASS; };

/**
 * Take the whole rack out of circuit, or put it back. The master is told
 * separately because it owns its own routing — this file does not know what a
 * buss compressor is made of, only that it has a way to stand aside.
 */
window.oaSetFxBypass = function (on) {
    const next = !!on;
    if (next === window.OA_FX_BYPASS) return;
    window.OA_FX_BYPASS = next;
    if (window.oaSetMasterBypass) window.oaSetMasterBypass(next);
    window.dispatchEvent(new CustomEvent('oa-fx-bypass', { detail: { on: next } }));
};

// ---------------------------------------------------------------------------
// Voice retirement
//
// Everything oaVoiceOut() builds is PER HIT: a panner, a send gain for each bus
// this channel feeds, and — on a driven channel — a whole pedal, waveshaper and
// all. At sixteenth notes across a full grid that is a few hundred nodes a
// second being wired into a graph that reaches the destination.
//
// The spec says a node with no references and no live input is collectable, and
// the browser does eventually collect them. "Eventually" is the problem: the
// collector runs when IT decides to, the pause lands wherever it lands, and a
// pause during playback is heard. Cutting each chain loose the moment its voice
// is done turns an unbounded pile of maybe-collectable nodes into a bounded one
// that is definitely gone, and moves the cost off the audio thread's back.
//
// Retirement is swept, not timed. A setTimeout per voice would be one timer per
// hit — the same churn in a different currency.
// ---------------------------------------------------------------------------

/** Disconnect every chain whose voice has finished. Cheap, and runs per hit. */
const sweep = function (ctx) {
    const q = ctx.__oaRetire;
    if (!q || !q.length) return;
    const now = ctx.currentTime;
    let keep = 0;
    for (let i = 0; i < q.length; i++) {
        if (q[i].at > now) {
            q[keep++] = q[i];
            continue;
        }
        const chain = q[i].chain;
        for (let n = 0; n < chain.length; n++) {
            try { chain[n].disconnect(); } catch (e) {}
        }
    }
    q.length = keep;
};

/**
 * Hand a voice's chain back once it has stopped sounding. `at` is the context
 * time the voice goes quiet; the chain is held until then and dropped after.
 */
window.oaRetireVoice = function (ctx, node, at) {
    const chain = node && node.__oaChain;
    if (!chain || !chain.length) return;
    const q = ctx.__oaRetire || (ctx.__oaRetire = []);
    // A tail longer than the voice: the reverb and delay sends are still being
    // fed for as long as the note rings, and cutting them at the note's end
    // would clip the send rather than the sound.
    q.push({ chain: chain, at: (at || ctx.currentTime) + 0.25 });
    node.__oaChain = null;
    sweep(ctx);
};

/** How many chains are waiting to be released. Flat means nothing is leaking. */
window.oaPendingVoices = function (ctx) {
    return (ctx && ctx.__oaRetire) ? ctx.__oaRetire.length : 0;
};

/**
 * Run the sweep without building a voice. Playing normally there is always a
 * next hit to carry it, but the last voice of a session has nothing behind it —
 * so the meter pump calls this, and so do the tests, which is how the queue is
 * observed draining to zero rather than assumed to.
 */
window.oaSweepVoices = function (ctx) { if (ctx) sweep(ctx); };

/**
 * The node a voice should connect to. Handles panning, the dry path to the
 * output, and this channel's reverb + delay sends. Returns the input node.
 *
 * Every node built here is recorded on `__oaChain` so oaRetireVoice() can let
 * go of the whole thing in one move when the voice is done.
 */
window.oaVoiceOut = function (ctx, idx, pan) {
    sweep(ctx);

    const chain = [];

    // Read ONCE, here, so a voice is built entirely in or entirely out of the
    // rack — never half of each because the flag moved mid-construction.
    const bypass = !!window.OA_FX_BYPASS;


    // THE FADER, as a node. Everything tapped before it is pre-fader and
    // everything after it is post-fader — that is the whole mechanism.
    //
    // It doubles as the pan-less output node, so a channel that is not panned
    // costs exactly what it always did: one gain. Read once at build time, like
    // the sends, so moving a fader lands on the next hit rather than re-levelling
    // notes that are already ringing.
    const fader = ctx.createGain();
    fader.gain.value = bypass ? 1 : window.oaTrackFader(idx);
    chain.push(fader);

    let node = fader;
    if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        fader.connect(p);
        node = p;
        chain.push(p);
    }

    // Only a channel that actually has a pre-fader send open pays for the extra
    // node in front of the fader. Everything else plays straight into it.
    const wantsPre = !bypass && (
        window.OA_REVERB_COUNT > 0 || window.OA_DELAY_COUNT > 0
    ) && (function () {
        for (let r = 0; r < window.OA_REVERB_COUNT; r++) {
            if (window.oaSendIsPre('rv', r) && window.oaReverbSend(r, idx) > window.OA_FX_SEND_EPSILON) return true;
        }
        for (let d = 0; d < window.OA_DELAY_COUNT; d++) {
            if (window.oaSendIsPre('dl', d) && window.oaDelaySend(d, idx) > window.OA_FX_SEND_EPSILON) return true;
        }
        return false;
    })();

    let preTap = fader;
    if (wantsPre) {
        preTap = ctx.createGain();
        preTap.connect(fader);
        chain.push(preTap);
    }

    // Null on a channel that has never been compressed, and the pan goes
    // straight on to the master bus. An INPUT PORT, not a strip object: this
    // file no longer knows what a compressor is made of.
    const compIn = (!bypass && window.oaCompInput) ? window.oaCompInput(ctx, idx) : null;
    // …and on to the MASTER BUS, which is where every audible path in the app
    // now ends up. Guarded, because a test that loads a subset of the backend
    // still has to be able to make a sound.
    const chanOut = compIn || (window.oaMasterInput ? window.oaMasterInput(ctx) : ctx.destination);

    // The GATE goes in front of the compressor, and that order is the router's
    // business rather than either unit's: gate then compress is the console
    // order, because a compressor in front of a gate spends its time lifting
    // the noise floor the gate was about to remove and then the gate is chasing
    // a threshold that moves with the programme.
    //
    // Like the compressor it is ONE STRIP PER CHANNEL, shared by every voice —
    // so unlike the pedal and the EQ it is not built into `chain` and not
    // retired with the voice. Its destination is therefore fixed at build time
    // and passed here, which is why oaGateInput takes one.
    const gateIn = (!bypass && window.oaGateInput) ? window.oaGateInput(ctx, idx, chanOut) : null;
    node.connect(gateIn || chanOut);

    const tap = function (amount, target, from) {
        if (!(amount > window.OA_FX_SEND_EPSILON)) return;
        const sg = ctx.createGain();
        sg.gain.value = amount;
        (from || node).connect(sg);
        sg.connect(target);
        chain.push(sg);
    };

    // Each module answers for its own send level and hands back its own input
    // port. This loop used to read OA_REVERB.units[r].sends[idx] and reach into
    // the returned bus object for `.input` — so the router knew the shape of
    // another module's settings AND the shape of its node graph.
    if (!bypass) {
        // A pre-fader send hangs off `preTap`, which is upstream of the fader;
        // a post-fader one off `node`, which is downstream of it (and of the
        // pan). oaSendIsPre() is the single source of that decision — the
        // Mixer's PRE/POST headings read the same table.
        for (let r = 0; r < window.OA_REVERB_COUNT; r++) {
            const amount = window.oaReverbSend(r, idx);
            if (amount > window.OA_FX_SEND_EPSILON) {
                tap(amount, window.oaReverbInput(ctx, r),
                    window.oaSendIsPre('rv', r) ? preTap : node);
            }
        }

        for (let d = 0; d < window.OA_DELAY_COUNT; d++) {
            const amount = window.oaDelaySend(d, idx);
            if (amount > window.OA_FX_SEND_EPSILON) {
                tap(amount, window.oaDelayInput(ctx, d),
                    window.oaSendIsPre('dl', d) ? preTap : node);
            }
        }
    }

    // Returns null on a clean channel, and the voice connects straight to the
    // pan the way it always did — bit for bit, not "distortion turned down".
    const drive = (!bypass && window.oaDriveNode) ? window.oaDriveNode(ctx, idx, preTap, chain) : null;

    // The EQ sits AHEAD of the pedal, which is the console order and not an
    // accident: an equaliser in front of a distortion decides what gets
    // distorted, and the pedal already carries its own post-shaper `tone`
    // lowpass for taming what comes out. Putting the EQ after the drive would
    // give the channel two tone controls doing the same job and none doing the
    // one a channel strip is for. Same all-or-nothing contract as the pedal:
    // flat builds nothing and this is the pedal's input, or the pan, unchanged.
    const eqDest = drive || preTap;
    const eq = (!bypass && window.oaEqNode) ? window.oaEqNode(ctx, idx, eqDest, chain) : null;
    const head = eq || eqDest;
    head.__oaChain = chain;
    return head;
};

/**
 * Build every bus a channel actually sends to, ahead of time. The live context
 * calls this on the first user gesture so the tape worklet is loaded before the
 * first hit; the offline renderer awaits it so its buses exist synchronously
 * while the pattern is being scheduled.
 */
window.oaWarmFx = async function (ctx) {
    await window.oaPrepareFx(ctx);
    // Each module builds what IT decides is in use, now that the answer about
    // worklets is in. Order still matters and is the only thing left here that
    // is genuinely the router's business: the MASTER BUS first, because
    // everything below connects INTO it and a bus built lazily by the first
    // sender would be a second summing point for anything already wired; then
    // strips (left until the first voice, one would be built while the module
    // was still registering and would take the native fallback for the whole
    // session), then rooms, then tapes — a tape wires its own throw into a room
    // as it is built.
    if (window.oaMasterWarm) window.oaMasterWarm(ctx);
    if (window.oaCompWarm) window.oaCompWarm(ctx);
    // The gate AFTER the compressor, because it connects INTO the compressor's
    // input port and a strip built before that port exists would wire itself
    // straight to the master and stay there for the session.
    if (window.oaGateWarm) {
        window.oaGateWarm(ctx, function (i) {
            return (window.oaCompInput && window.oaCompInput(ctx, i))
                || (window.oaMasterInput ? window.oaMasterInput(ctx) : ctx.destination);
        });
    }
    if (window.oaReverbWarm) window.oaReverbWarm(ctx);
    if (window.oaDelayWarm) window.oaDelayWarm(ctx);
};

/**
 * Cut every voice loose at once, and take the effects rack down with it. Used
 * when a context is abandoned, and by the leak tests as the last step before
 * asking the graph what is left.
 */
window.oaDisposeVoices = function (ctx) {
    if (!ctx) return;
    // Every sounding source, stopped and disconnected. A looping pad that was
    // never toggled off is exactly the voice this has to catch.
    (window.OA_LIVE_VOICES || []).slice().forEach(function (src) {
        try { src.stop(); } catch (e) {}
        try { src.disconnect(); } catch (e) {}
    });
    if (window.OA_LIVE_VOICES) window.OA_LIVE_VOICES.length = 0;
    Object.keys(window.OA_DRUM_LOOPS || {}).forEach(function (k) { window.OA_DRUM_LOOPS[k] = null; });

    const q = ctx.__oaRetire;
    if (q) {
        q.forEach(function (entry) {
            entry.chain.forEach(function (n) { try { n.disconnect(); } catch (e) {} });
        });
        q.length = 0;
    }
};

// ---------------------------------------------------------------------------
// The voice counter, as a plugin.
//
// This one has no panel of its own and no sound. It exists because the failure
// that started all of this — the app getting slower and dirtier the longer it
// ran — was completely invisible while it was happening. Every number that
// would have shown it is published here, in the same binary frame as everything
// else, so a display can put it on screen and the tests can assert on it.
//
// If VOICES or PENDING climbs and does not come back down while nothing is
// playing, something is holding on. That is the whole diagnostic.
// ---------------------------------------------------------------------------

window.oaRegisterPlugin({
    id: 'voices',
    label: 'Voices',
    units: function () { return 1; },
    params: [],

    slots: window.OA_SLOT.USER + 4,
    layout: {
        /** Sources sounding right now. */
        VOICES: window.OA_SLOT.USER,
        /** Voice chains built and waiting to be released. Should stay small. */
        PENDING: window.OA_SLOT.USER + 1,
        /** Megabytes held by the Tone Mode pre-render cache. */
        CACHE_MB: window.OA_SLOT.USER + 2,
        /** Effect buses currently built: reverbs + delays + compressor strips. */
        BUSES: window.OA_SLOT.USER + 3,
    },

    read: function (ctx, i, frame) {
        const S = window.OA_SLOT;
        // The last voice of a run has no next hit to carry the sweep, so the
        // pump does it. One pass over a short queue, once a frame.
        window.oaSweepVoices(ctx);
        const live = (window.OA_LIVE_VOICES || []).length;
        frame[S.ACTIVE] = live > 0 ? 1 : 0;
        frame[S.PEAK_L] = 0;
        frame[S.PEAK_R] = 0;
        frame[S.USER] = live;
        frame[S.USER + 1] = window.oaPendingVoices(ctx);
        frame[S.USER + 2] = window.oaToneCacheBytes
            ? window.oaToneCacheBytes() / (1024 * 1024)
            : 0;
        // Each module counts its own buses. Reading ctx.__oaReverbs /
        // __oaDelays / __oaComps from here meant the one file that is supposed
        // to know nothing about how the effects are built was the file that
        // knew where all three of them keep their nodes.
        const built = function (fn) { return fn ? fn(ctx) : 0; };
        frame[S.USER + 3] = built(window.oaReverbBusCount)
            + built(window.oaDelayBusCount)
            + built(window.oaCompStripCount)
            + built(window.oaMasterBusCount);
    },

    dispose: window.oaDisposeVoices,
});
