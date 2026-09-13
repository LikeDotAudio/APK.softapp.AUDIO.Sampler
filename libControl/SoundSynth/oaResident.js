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
 * Header: oaResident.js
 * Purpose: What the engine holds in RAM, so that playing a sound is never the
 *   moment it gets built.
 * Description: A sampler is judged on the gap between the hit and the sound.
 *   Everything that can be computed ahead of the hit therefore is, and what
 *   comes out of that computation stays resident:
 *
 *     SAMPLES   decoded once into OA_DRUM_SAMPLES, plus the pitched copy each
 *               pad actually plays (oaPrecachePad) and Tone Mode's per-semitone
 *               renders (oaPrecacheTones).
 *     SYNTH     every voice's patch is already a plain object in memory and on
 *               localStorage; its bounced waveform is rendered for all pads at
 *               startup instead of when a pad is first looked at.
 *     IRs       every impulse response the reverbs draw, kept under the settings
 *               that drew it, so recalling a program is a lookup and not the
 *               couple of million random numbers it was the first time.
 *
 *   Two things this file insists on, both learned the hard way in the Tone Mode
 *   cache above it:
 *
 *   A CACHE WITH NO CEILING IS A LEAK. Every store here is byte-budgeted with
 *   least-recently-used eviction. "Hold everything" and "hold what fits, drop
 *   the coldest" are the same thing right up until the machine starts swapping,
 *   and the second one keeps working after that.
 *
 *   WHAT IS RESIDENT MUST BE COUNTABLE. oaResidentReport() adds up every store
 *   by class, so "is it all in memory?" has an answer with a number in it
 *   instead of an opinion. The Mixer's diagnostic reads it.
 */

// Every cache built through oaBufferCache, for the report at the bottom.
const CACHES = [];

const bufBytes = function (b) {
    // Float32 per sample per channel — what an AudioBuffer actually costs.
    return b ? b.numberOfChannels * b.length * 4 : 0;
};

/**
 * A keyed AudioBuffer store with a budget.
 *
 * `budgetOf` is read on every put rather than captured, so a budget can be
 * raised or lowered at runtime and take effect on the next insert.
 *
 * A buffer bigger than the entire budget is handed straight back UNSTORED: the
 * alternative is evicting the whole cache to make room for one item that will
 * itself be evicted by the next one, which is a loop that only burns memory
 * bandwidth. The caller still gets its buffer; it just has to build it again
 * next time, which is the honest outcome when it does not fit.
 */
window.oaBufferCache = function (name, budgetOf) {
    const held = new Map();
    let clock = 0;
    let bytes = 0;

    const api = {
        name: name,
        hits: 0,
        misses: 0,
        evictions: 0,

        get: function (key) {
            const hit = held.get(key);
            if (!hit) { api.misses++; return null; }
            hit.used = ++clock;
            api.hits++;
            return hit.buffer;
        },

        /** Store and hand the buffer straight back, so callers can `return put(k, build())`. */
        put: function (key, buffer) {
            if (!buffer) return buffer;
            const size = bufBytes(buffer);
            const budget = Math.max(0, budgetOf() || 0);
            if (size > budget) return buffer;

            const old = held.get(key);
            if (old) bytes -= old.bytes;
            held.set(key, { buffer: buffer, bytes: size, used: ++clock });
            bytes += size;

            if (bytes > budget) {
                // Coldest first, and never the entry just asked for — evicting
                // that would mean the caller rebuilds what it just built.
                const order = Array.from(held.entries()).sort(function (a, b) { return a[1].used - b[1].used; });
                for (let i = 0; i < order.length && bytes > budget; i++) {
                    if (order[i][0] === key) continue;
                    bytes -= order[i][1].bytes;
                    held.delete(order[i][0]);
                    api.evictions++;
                }
            }
            return buffer;
        },

        drop: function (key) {
            const hit = held.get(key);
            if (hit) { bytes -= hit.bytes; held.delete(key); }
        },
        clear: function () { held.clear(); bytes = 0; },
        bytes: function () { return bytes; },
        entries: function () { return held.size; },
    };
    CACHES.push(api);
    return api;
};

// ---------------------------------------------------------------------------
// The warm-up.
//
// Run once, off the critical path, and again whenever the kit changes under it.
// Everything it touches is idempotent — a second call over a warm store is a
// handful of map lookups.
// ---------------------------------------------------------------------------

let warming = null;

/**
 * Build everything the next hit could possibly need.
 *
 * Deliberately NOT "render every reverb program": eleven banks of ten is over
 * a hundred responses, several megabytes and tens of milliseconds of arithmetic
 * each, and pre-building the hundred would cost half a gigabyte and a stalled
 * main thread to have 108 rooms nobody asked for. The two machines that exist
 * are warmed here; every other program becomes resident the first time it is
 * loaded and stays that way (oaBuildImpulse's cache), which makes the SECOND
 * recall of any room instant and the first one no slower than it was.
 */
window.oaWarmMemory = function () {
    if (warming) return warming;
    warming = (async function () {
        const ctx = window.oaAudioCtx ? window.oaAudioCtx() : null;
        if (!ctx) return null;

        // The kit this browser was left holding, straight back into RAM. First,
        // because everything below is about what the pads are going to play and
        // this is what decides what that is.
        if (window.oaRehydrateKit) { try { await window.oaRehydrateKit(); } catch (e) {} }

        // The rack: worklets registered, buses built, rooms drawn. Already the
        // first thing oaAudioCtx() kicks off; awaited here so what follows can
        // count on the graph existing.
        if (window.oaWarmFx) { try { await window.oaWarmFx(ctx); } catch (e) {} }

        // Both machines' current rooms, whether or not anything is sending to
        // them yet — a send knob turned up mid-take must not be the moment an
        // impulse response gets drawn.
        if (window.oaBuildImpulse && window.oaReverbUnit) {
            for (let u = 0; u < (window.OA_REVERB_COUNT || 0); u++) {
                try { window.oaBuildImpulse(ctx, window.oaReverbUnit(u)); } catch (e) {}
            }
        }

        // Every synth voice bounced, so a pad that has never been looked at
        // still draws instantly and its preview is not built during a take.
        if (window.oaRenderAllSynthVoices) { try { window.oaRenderAllSynthVoices(); } catch (e) {} }

        // Every loaded pad's playback buffer. oaSetDrumSample starts this on
        // load; this catches pads that arrived by some other road (a restored
        // kit, a set) and anything a pitch change invalidated.
        const samples = window.OA_DRUM_SAMPLES || {};
        for (const k in samples) {
            const entry = samples[k];
            if (entry && entry.buffer && !entry.cachedBuffer && window.oaPrecachePad) {
                try { await window.oaPrecachePad(entry); } catch (e) {}
            }
        }
        window.dispatchEvent(new CustomEvent('oa-memory-warm', { detail: window.oaResidentReport() }));
        return window.oaResidentReport();
    })().catch(function () { return null; }).then(function (r) { warming = null; return r; });
    return warming;
};

// ---------------------------------------------------------------------------
// The ledger.
// ---------------------------------------------------------------------------

/**
 * What is resident right now, by class, in bytes.
 *
 * `samples.missing` is the number that matters when the question is "is it all
 * in memory": pads the app knows about but has no audio for.
 */
window.oaResidentReport = function () {
    const samples = window.OA_DRUM_SAMPLES || {};
    let sampleBytes = 0, sampleCount = 0, pitchedBytes = 0, pitchedCount = 0, missing = 0;
    for (let i = 0; i < (window.OA_PAD_COUNT || 0); i++) {
        const entry = samples[i];
        if (!entry) continue;
        if (entry.buffer) { sampleBytes += bufBytes(entry.buffer); sampleCount++; }
        else { missing++; }
        // The pitched copy is the buffer that actually plays. When the pad is
        // at 1x it IS the original and must not be counted twice.
        if (entry.cachedBuffer && entry.cachedBuffer !== entry.buffer) {
            pitchedBytes += bufBytes(entry.cachedBuffer);
            pitchedCount++;
        }
    }

    const renders = window.OA_SYNTH_RENDER || {};
    let synthBytes = 0, synthCount = 0;
    for (const k in renders) {
        const r = renders[k];
        if (r && r.buffer) { synthBytes += bufBytes(r.buffer); synthCount++; }
    }

    const toneBytes = window.oaToneCacheBytes ? window.oaToneCacheBytes() : 0;

    const caches = CACHES.map(function (c) {
        return { name: c.name, bytes: c.bytes(), entries: c.entries(), hits: c.hits, misses: c.misses, evictions: c.evictions };
    });
    const cacheBytes = caches.reduce(function (a, c) { return a + c.bytes; }, 0);

    return {
        samples: { bytes: sampleBytes, count: sampleCount, missing: missing },
        pitched: { bytes: pitchedBytes, count: pitchedCount },
        tones: { bytes: toneBytes },
        synth: { bytes: synthBytes, count: synthCount, patches: Object.keys(window.OA_DRUM_SYNTH || {}).length },
        caches: caches,
        totalBytes: sampleBytes + pitchedBytes + toneBytes + synthBytes + cacheBytes,
    };
};

/** The report as one line, for a status readout or the console. */
window.oaResidentLine = function () {
    const r = window.oaResidentReport();
    const mb = function (b) { return (b / (1024 * 1024)).toFixed(1) + 'MB'; };
    const parts = [
        `${r.samples.count} samples ${mb(r.samples.bytes)}`,
        `pitched ${mb(r.pitched.bytes)}`,
        `tones ${mb(r.tones.bytes)}`,
        `${r.synth.count} synth ${mb(r.synth.bytes)}`,
    ];
    r.caches.forEach(function (c) { parts.push(`${c.entries} ${c.name} ${mb(c.bytes)}`); });
    return `resident ${mb(r.totalBytes)} — ${parts.join(' · ')}${r.samples.missing ? ` · ${r.samples.missing} pad(s) with no audio` : ''}`;
};

// ---------------------------------------------------------------------------
// Warm on the way in, and again whenever the kit changes.
//
// On idle rather than immediately: the first paint is a user watching a blank
// page, and the audio context has until the first hit — which cannot come
// before a gesture — to be ready. A kit change re-warms on the same idle terms.
// ---------------------------------------------------------------------------
const soon = function (fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 3000 });
    else setTimeout(fn, 1200);
};

// Only where there is a page to warm FOR. The test harness loads these modules
// into a fake window with no document lifecycle, and a warm-up firing on a
// timer after a test has finished is a stray context and a confusing failure.
if (typeof document !== 'undefined' && typeof document.readyState === 'string') {
    let kitDirty = null;
    window.addEventListener('oa-sample-changed', function () {
        if (kitDirty) clearTimeout(kitDirty);
        // A set load fires this once per pad; warm after the last, not 25 times.
        kitDirty = setTimeout(function () { kitDirty = null; soon(function () { window.oaWarmMemory(); }); }, 400);
    });

    const boot = function () { soon(function () { window.oaWarmMemory(); }); };
    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot, { once: true });
}
