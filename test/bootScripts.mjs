// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: bootScripts.mjs
 * Purpose: Run whole SCRIPT FILES (a built bundle, the page's script tags) into
 *   a fresh fake window, in order, the way a browser runs `<script src>`.
 * Description: `createWorld` loads individual sources; this loads what ships.
 *   Same window, same `with (window)` scope, same fakes — so a bundle that
 *   throws on load, or forgets to define a name another repo reads, fails
 *   here. Used by exports.test.mjs (the bundle contract) and page.test.mjs
 *   (index.html's own script chain).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './harness.mjs';
import { makeReact } from './fakeReact.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** The names in the same `with (window)` scope the harness gives a source. */
const PARAMS = ['window', 'self', 'localStorage', 'CustomEvent', 'Blob', 'URL',
    'AudioWorkletNode', 'AudioContext', 'OfflineAudioContext',
    'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'console', 'performance', 'React', 'ReactDOM',
    'document', 'navigator'];

/**
 * A fresh window with nothing of the Sampler's on it, then `files` run into it
 * in order, as script tags would. Returns the world, so the caller cleans up.
 * `opts.prepare(window)` runs first, for a test that needs more of a browser.
 */
export async function bootFiles(files, opts = {}) {
    const React = opts.React || makeReact().React;
    const ReactDOM = opts.ReactDOM || { render() {}, createRoot: () => ({ render() {}, unmount() {} }) };
    const w = await createWorld({ sources: [], React, ReactDOM });
    const win = w.window;
    win.React = React;
    win.ReactDOM = ReactDOM;
    if (opts.prepare) opts.prepare(win);
    for (const rel of files) {
        const fn = new Function(...PARAMS, `with (window) {\n${read(rel)}\n}\n//# sourceURL=${rel}`);
        fn(win, win, win.localStorage, win.CustomEvent, win.Blob, win.URL,
            win.AudioWorkletNode, win.AudioContext, win.OfflineAudioContext,
            win.requestAnimationFrame, win.cancelAnimationFrame, setTimeout, clearTimeout,
            setInterval, clearInterval, console, win.performance, React, ReactDOM,
            win.document, { userAgent: 'oa-test' });
    }
    return w;
}

