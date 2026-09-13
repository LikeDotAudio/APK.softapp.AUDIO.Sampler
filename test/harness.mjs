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
 * Header: harness.mjs
 * Purpose: Load the real plugin sources into a fake browser so the tests drive
 *   the shipping code, not a copy of it.
 * Description: build.mjs concatenates every source into one bundle, each file
 *   wrapped in its own IIFE so top-level `const`s in different files cannot
 *   collide, and cross-file sharing happens through window.* alone. This does
 *   exactly the same thing with `new Function`, one file at a time, against a
 *   window object the test owns.
 *
 *   `new Function` rather than node:vm ON PURPOSE. A vm context is a separate
 *   realm with its own intrinsics, so a Float32Array built inside it fails
 *   `instanceof Float32Array` out here — and half of what these plugins hand
 *   around is Float32Array. Same realm, same intrinsics, no surprises.
 *
 *   THE WORKLET TRICK. A plugin ships its DSP as a source string and registers
 *   it from a Blob URL, because the whole app is one bundle and a worklet module
 *   has to be separately fetchable. That means the source passes through
 *   URL.createObjectURL on its way — so the fake URL here keeps the text, and
 *   addModule() can EVALUATE it against a fake AudioWorkletProcessor. The tests
 *   then run the actual process() function over actual arrays. The compressor's
 *   ballistics are tested for real, not asserted about.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    FakeAudioContext,
    FakeOfflineAudioContext,
    FakeWorkletNode,
} from './fakeAudio.mjs';
import { BACKEND_SOURCES, BUNDLE_SOURCES, HARNESS_EXCLUDES } from './bundleSources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The audio layer, DERIVED from `sources.json` rather than listed here.
 *
 * It was a literal array until 2026-09-07, and it had drifted to 28 of the 57
 * `.js` entries — so the window these tests drove was half the one the browser
 * builds, and a global could resolve to a twin `build.mjs` overwrites. See
 * `bundleSources.mjs`, which owns the rule and the exclusions; `globals.test.mjs`
 * holds the gap at zero.
 */
export { BACKEND_SOURCES, BUNDLE_SOURCES, HARNESS_EXCLUDES };

// ---------------------------------------------------------------------------
// The bits of a browser these modules actually touch
// ---------------------------------------------------------------------------

class FakeCustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
        this.defaultPrevented = false;
    }
    preventDefault() { this.defaultPrevented = true; }
}

class FakeBlob {
    constructor(parts, opts = {}) {
        this.__text = (parts || []).join('');
        this.type = opts.type || '';
        this.size = this.__text.length;
    }
    text() { return Promise.resolve(this.__text); }
}

const makeLocalStorage = () => {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
        clear: () => map.clear(),
        key: (i) => Array.from(map.keys())[i] ?? null,
        get length() { return map.size; },
        __map: map,
    };
};

/**
 * A fake AudioWorkletGlobalScope. Runs a processor's source for real and keeps
 * the class, so a test can instantiate it and call process() over live arrays.
 */
const evaluateWorklet = (source, sampleRate) => {
    const registered = new Map();

    class AudioWorkletProcessor {
        constructor() {
            this.port = {
                onmessage: null,
                __sent: [],
                postMessage(m) { this.__sent.push(m); },
            };
        }
    }
    const registerProcessor = (name, cls) => { registered.set(name, cls); };

    const fn = new Function(
        'AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'currentTime',
        `"use strict";\n${source}`,
    );
    fn(AudioWorkletProcessor, registerProcessor, sampleRate, 0);
    return registered;
};

// ---------------------------------------------------------------------------
// The plain loader — the one that is NOT a browser
// ---------------------------------------------------------------------------

/**
 * Evaluate ONE source file with a bare `new Function('window', src)`.
 *
 * NAMED FOR WHAT IT IS NOT. This is not `createWorld` and must not be reached
 * for where `createWorld` was meant: there is no fake DOM, no audio context, no
 * event log, no `flush()`, and above all no `with (window)`. It exists for one
 * job — a REAL wall-clock number for a self-contained function — and every other
 * job in this suite belongs to `createWorld`.
 *
 * WHY IT HAD TO BE AN EXPORT. `createWorld`'s own doc comment says to measure a
 * CPU-bound loop outside it, and until now offered no way to. Three sessions
 * hand-rolled three private `new Function` calls to obey it — PLAN-801.01 after
 * losing an hour to a number that disagreed with itself by 16x, PLAN-965.01
 * twice more while pinning the gap. This is that loader, once. PLAN-1078.01.
 *
 * WHAT IT MUST NOT BE USED FOR: any source that reads another file's bare,
 * `window`-assigned export. `with (window)` is what makes `SvgFader` resolve
 * across files the way a browser resolves it, and without it that name is simply
 * not in scope. Such a source throws a plain `ReferenceError` here and passes
 * under `createWorld`.
 *
 * AND THAT IS THE SAFE DIRECTION FOR IT TO FAIL IN, which is the whole reason
 * this loader is allowed to be narrower than the real one. The failure is loud,
 * immediate, and names the identifier. The alternative — keeping `with` here so
 * nothing can throw — reintroduces exactly the tax being measured, and hands
 * back a number that is 14–16x the truth with nothing on screen to say so. A
 * test that cannot load is a test somebody fixes; a timing that is quietly wrong
 * by an order of magnitude is an hour somebody loses.
 *
 * `window` is a plain object with nothing on it. A DSP primitive reaches for
 * `Float32Array` and `Math`, which are realm intrinsics and already in scope —
 * the same-realm argument that keeps this off `node:vm` applies here too.
 *
 * @param {string} rel  Source path, relative to this package root, as
 *                      `createWorld`'s `sources` are.
 * @returns {object}    The `window` the source assigned itself onto.
 */
export function loadSourcePlain(rel) {
    const code = readFileSync(join(ROOT, rel), 'utf8');
    const window = {};
    new Function('window', `${code}\n//# sourceURL=${rel}`)(window);
    return window;
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

/**
 * Build a fresh fake browser and load `sources` into it.
 *
 * Returns everything a test needs to poke at:
 *   window     the shared global the plugins hang themselves off
 *   ctx        a live FakeAudioContext, already set as window.OA_AUDIO_CTX
 *   events     every CustomEvent dispatched, in order
 *   processors name -> the real worklet class, once addModule has run
 *   flush()    drain pending microtasks and timers
 *
 * A TIMING TAKEN THROUGH THIS IS NOT THE BROWSER'S, AND NOT A PLAIN SCRIPT'S,
 * FOR A FUNCTION WHOSE HOT LOOP READS A GLOBAL. The loader below wraps every
 * source in `with (window) { … }` so a bare cross-file identifier resolves
 * the way it does in a real browser, where `window` IS the global object —
 * that is the point of it, and the fix is not to remove it. The cost is that
 * `with` forces the engine to treat every name as possibly shadowed by a
 * `window` property, so a loop that reads `Math.cos`/`Math.sin` (or any other
 * global) once per iteration pays for that check on every read, while the
 * long named-parameter list `new Function` also takes here costs nothing
 * measurable on its own. Bisected and reproduced in
 * `test/harness-cost.test.mjs`: 14–16x slower through `createWorld` than
 * under a plain `new Function` on the identical source, for the pre-Goertzel
 * chromagram that first exposed it; a loop with no global read in its body
 * shows no such gap. Measure a CPU-bound loop OUTSIDE `createWorld` — the way
 * PLAN-801.01 ultimately did — and never report a `createWorld` wall-clock
 * number as a browser or plain-script cost. PLAN-965.01.
 */
export async function createWorld(opts = {}) {
    const sources = opts.sources || BACKEND_SOURCES;
    const sampleRate = opts.sampleRate || 48000;

    // The `navigator` the sources see. A bare userAgent was enough while nothing
    // under test asked the browser a question, but a feature guard reads
    // properties off this object and takes the early return when they are
    // absent -- and an early return renders as a blank byline rather than as a
    // throw, so a test that never supplies the API cannot tell a working guard
    // from a broken one. `opts.navigator` is how a test hands it the API.
    const navigatorStub = opts.navigator || { userAgent: 'oa-test' };

    const events = [];
    const listeners = new Map();
    const processors = new Map();
    const timers = new Set();

    // Blob URL -> source text, so addModule can find the processor it was given.
    const blobs = new Map();
    let blobSeq = 0;

    // Every `<a download>` this world clicked, in order — the file the app meant
    // to write, and what was in it.
    const downloads = [];

    const FakeURL = {
        createObjectURL(blob) {
            const url = `blob:oa-test/${++blobSeq}`;
            blobs.set(url, blob && blob.__text ? blob.__text : '');
            return url;
        },
        revokeObjectURL(url) { blobs.delete(url); },
    };

    const window = {
        // Filled in by the sources themselves as they load.
    };

    window.window = window;
    window.self = window;
    window.localStorage = makeLocalStorage();
    window.CustomEvent = FakeCustomEvent;
    window.Blob = FakeBlob;
    window.URL = FakeURL;
    window.AudioWorkletNode = null;   // set below, needs ctx-aware construction
    window.performance = { now: () => 0 };
    // WebCrypto, because a scan hashes its own decoded samples. Node's global
    // `crypto` is the same interface a page gets on a secure origin; a test that
    // left it off would exercise only the `null` arm of oaPcmSha256, which is
    // the arm an insecure origin takes and not the one anybody ships.
    window.crypto = globalThis.crypto;
    // The IMPORT side of a sidecar, which had no world to run in until
    // PLAN-1067.01. `handleImportFile` in `LensesView.jsx` is
    // `new FileReader()` + `readAsText` + a bare `alert`, and every source is
    // evaluated in `with (window) { … }`, so both resolve here. Without them a
    // round-trip test can only assert what the EXPORT wrote — which is exactly
    // half of a round trip, and the half that cannot notice a renamed key.
    //
    // Synchronous on purpose: a real FileReader fires `onload` on a later task,
    // and a test awaiting it would be awaiting a timer this world controls
    // anyway. The callback runs on the same stack so the assertion after
    // `onChange` reads settled state.
    window.FileReader = class {
        constructor() { this.onload = null; this.onerror = null; this.result = null; }
        readAsText(file) {
            this.result = (file && file.__text) || '';
            if (this.onload) this.onload({ target: { result: this.result } });
        }
    };
    // Every `alert()` the app raised, in order — recorded rather than swallowed,
    // because "Imported metadata sidecar successfully" IS the app's report that
    // the import path completed, and a test that ignored it could not tell a
    // successful import from a silently caught parse error.
    const alerts = [];
    window.alert = (message) => { alerts.push(String(message)); };
    window.innerWidth = 1280;
    window.innerHeight = 900;
    window.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });

    // Just enough DOM for the mount point to find a container and for a panel
    // to set a style on a ref. Nothing here lays anything out — a panel that
    // depends on a measured size is asking a question this cannot answer, and
    // should be reading it from a frame instead.
    const makeElement = (tag) => ({
        tagName: (tag || 'div').toUpperCase(),
        style: {},
        dataset: {},
        children: [],
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        textContent: '',
        offsetHeight: 0,
        offsetWidth: 0,
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
        setAttribute() {},
        getAttribute: () => null,
        addEventListener() {},
        removeEventListener() {},
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100 }),
        // A download is `document.createElement('a')`, `.href = blobURL`,
        // `.download = name`, `.click()`. The click is recorded rather than
        // ignored so a test can assert the file was written AND what it was
        // called — PLAN-573.01 set out to assert three download filenames and
        // could not, because reaching them threw.
        __clicks: 0,
        click() {
            this.__clicks++;
            if (this.download != null) {
                // The blob is revoked on the line after the click, so its text is
                // taken NOW rather than looked up later.
                downloads.push({ name: this.download, text: blobs.get(this.href) ?? null });
            }
        },
        // Enough of a canvas for a view that draws a timeline. Nothing here
        // measures anything; it records that the draw ran without throwing.
        getContext: () => ({
            fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
            fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
            stroke() {}, fill() {}, fillText() {}, closePath() {}, arc() {},
            save() {}, restore() {}, translate() {}, scale() {},
        }),
    });
    window.document = {
        documentElement: makeElement('html'),
        body: makeElement('body'),
        createElement: makeElement,
        getElementById: () => makeElement('div'),
        querySelector: () => makeElement('div'),
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
    };

    window.addEventListener = (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
    };
    window.removeEventListener = (type, fn) => {
        const l = listeners.get(type);
        if (l) listeners.set(type, l.filter((f) => f !== fn));
    };
    window.dispatchEvent = (ev) => {
        events.push(ev);
        (listeners.get(ev.type) || []).slice().forEach((f) => f(ev));
        return true;
    };

    // The app's meter pump asks for frames; tests drive it by hand instead, so
    // the callback is recorded and never fires on its own.
    const frames = [];
    window.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
    window.cancelAnimationFrame = (id) => { frames[id - 1] = null; };

    const setTimeoutShim = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.add(id);
        return id;
    };
    const clearTimeoutShim = (id) => { timers.delete(id); clearTimeout(id); };

    // -- the audio side -----------------------------------------------------

    // Every context built in this world, so a test can inspect an offline one
    // the plugin made on its own.
    const contexts = [];

    const wireContext = (c) => {
        contexts.push(c);
        const addModule = c.audioWorklet.addModule.bind(c.audioWorklet);
        c.audioWorklet.addModule = async (url) => {
            const src = blobs.get(url);
            if (src == null) throw new Error(`addModule: unknown URL ${url}`);
            const registered = evaluateWorklet(src, c.sampleRate);
            registered.forEach((cls, name) => {
                processors.set(name, cls);
                // parameterDescriptors is a static getter on the real class —
                // read it once so FakeWorkletNode can build matching params.
                const descriptors = (cls.parameterDescriptors || []);
                c.__modules.set(name, descriptors);
            });
            return undefined;
        };
        return c;
    };

    class TestAudioContext extends FakeAudioContext {
        constructor(o) { super(Object.assign({ sampleRate }, o)); wireContext(this); }
    }
    class TestOfflineAudioContext extends FakeOfflineAudioContext {
        constructor(ch, len, rate) { super(ch, len, rate); wireContext(this); }
    }

    window.AudioContext = TestAudioContext;
    window.webkitAudioContext = TestAudioContext;
    window.OfflineAudioContext = TestOfflineAudioContext;
    window.webkitOfflineAudioContext = TestOfflineAudioContext;
    window.AudioWorkletNode = FakeWorkletNode;

    // -- load the sources ---------------------------------------------------

    for (const rel of sources) {
        let code = readFileSync(join(ROOT, rel), 'utf8');
        // The display sources are JSX, so they need the same Babel pass the
        // bundle gets before `new Function` will look at them. Loaded lazily so
        // a backend-only test never pays for it.
        if (rel.endsWith('.jsx')) {
            const { transformSync } = await import('@babel/core');
            code = transformSync(code, {
                filename: rel,
                presets: [['@babel/preset-react', { runtime: 'classic' }]],
                compact: false,
                babelrc: false,
                configFile: false,
            }).code;
        }
        let fn;
        try {
            fn = new Function(
                'window', 'self', 'localStorage', 'CustomEvent', 'Blob', 'URL',
                'AudioWorkletNode', 'AudioContext', 'OfflineAudioContext',
                'requestAnimationFrame', 'cancelAnimationFrame',
                'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
                'console', 'performance', 'React', 'ReactDOM', 'document', 'navigator',
                // `with (window)` because that is genuinely how the bundle
                // resolves names in a browser, and nothing else reproduces it.
                //
                // build.mjs gives each source its own IIFE, so a component
                // declared `const SvgFader = …` in one file is NOT in lexical
                // scope in another. The files export by assigning window.X, and
                // the browser then resolves a bare `SvgFader` elsewhere by
                // walking the scope chain out to the real global object — where
                // window.X is a property, because in a browser window IS the
                // global. Here `window` is an ordinary object, so that last hop
                // does not exist and every cross-file reference would fail.
                //
                // `with` puts it back exactly. The cost is that this cannot be
                // strict-mode code; the alternative is node:vm, which is a
                // separate realm and would break `instanceof Float32Array` on
                // every array these modules hand around — a far worse trade for
                // an audio codebase.
                `with (window) {\n${code}\n}\n//# sourceURL=${rel}`,
            );
        } catch (e) {
            throw new Error(`${rel}: failed to parse — ${e.message}`);
        }
        try {
            fn(
                window, window, window.localStorage, FakeCustomEvent, FakeBlob, FakeURL,
                FakeWorkletNode, TestAudioContext, TestOfflineAudioContext,
                window.requestAnimationFrame, window.cancelAnimationFrame,
                setTimeoutShim, clearTimeoutShim, setInterval, clearInterval,
                console, window.performance, opts.React || null, opts.ReactDOM || null, window.document, navigatorStub,
            );
        } catch (e) {
            throw new Error(`${rel}: threw while loading — ${e.stack}`);
        }
    }

    const ctx = new TestAudioContext();
    window.OA_AUDIO_CTX = ctx;

    const flush = async () => {
        // Two turns: one for the addModule promise chain, one for whatever it
        // scheduled on resolution.
        await Promise.resolve();
        await new Promise((r) => setImmediate(r));
        await Promise.resolve();
    };

    /**
     * Wait until `predicate()` is true, or give up after `timeoutMs` and say so.
     *
     * NOT A COUNT OF TURNS, and that distinction cost a red suite. `flush()`
     * drains the microtask queue and returns in microseconds, so a loop of two
     * hundred of them is not two hundred milliseconds of patience — it is under
     * one, and a promise resolved off Node's threadpool (a WebCrypto digest of a
     * megabyte of PCM, say) lands after all of them. Measured 2026-09-07: a scan
     * that settles in about a millisecond of WALL time settled in ONE of six
     * runs of a 200-turn flush loop. This waits on the clock instead.
     */
    const settle = async (predicate, timeoutMs = 5000) => {
        const deadline = Date.now() + timeoutMs;
        while (!predicate()) {
            if (Date.now() > deadline) return false;
            await new Promise((r) => setTimeout(r, 1));
        }
        return true;
    };

    return {
        window,
        ctx,
        contexts,
        events,
        processors,
        frames,
        blobs,
        downloads,
        alerts,
        flush,
        settle,
        /** Run every pending rAF callback once, the way a browser frame would. */
        tick() {
            const due = frames.splice(0, frames.length).filter(Boolean);
            due.forEach((f) => f(0));
            return due.length;
        },
        /** Events of one type, newest last. */
        eventsOf(type) { return events.filter((e) => e.type === type); },
        cleanup() {
            timers.forEach((t) => clearTimeout(t));
            timers.clear();
        },
    };
}

/**
 * The common opening move: a world with the effects warmed up, so the worklets
 * are registered and every bus exists before the first voice.
 */
export async function createWarmWorld(opts = {}) {
    const w = await createWorld(opts);
    if (w.window.oaWarmFx) await w.window.oaWarmFx(w.ctx);
    await w.flush();
    return w;
}
