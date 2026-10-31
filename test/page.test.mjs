// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: page.test.mjs
 * Purpose: Load index.html the way a browser does — its own script tags, in
 *   order — and fail on a script error, or on a page that never mounts.
 * Description: The deploy smoke checks that index.html answers 200; it never
 *   runs it, so a bundle that throws on load would still pass. This runs the
 *   page's script chain headless, in the suite's fake window:
 *
 *     · every `<script src>` in index.html, in document order, read from this
 *       tree — except the vendored React UMD files (the fake React stands in,
 *       because the real one needs a real DOM) and the files declared in
 *       exports.json `consumes` (APK:OS's, absent when the page runs alone,
 *       which is the case the published site is);
 *     · then asserts the bundle reached `ReactDOM.createRoot(#root).render`
 *       with the App component, and that the App's first render does not throw.
 *
 *   What it does not do: run a real browser. Layout, CSS and the service
 *   worker on the published origin stay outside this suite.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { bootFiles } from './bootScripts.mjs';
import { makeReact } from './fakeReact.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const EXPORTS = JSON.parse(read('exports.json'));

const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
const fromOs = (src) => Object.keys(EXPORTS.consumes).some((c) => src.endsWith(c));
const isVendorReact = (src) => /vendor\/react(-dom)?\.production\.min\.js$/.test(src);

describe('index.html, run headless', () => {
    test('every script the page loads is in this tree, or declared as the OS\'s', () => {
        const missing = srcs.filter((s) => !fromOs(s) && !existsSync(join(ROOT, s)));
        assert.deepEqual(missing, [], `index.html loads files that are not here: ${missing.join(', ')}`);
        assert.ok(srcs.some((s) => s.endsWith('dist/app.js')), 'index.html no longer loads dist/app.js');
    });

    test('the script chain runs without a throw and mounts the App into #root', async () => {
        const r = makeReact();
        const mounted = [];
        const ReactDOM = {
            render(el) { mounted.push(el); },
            createRoot: (node) => {
                assert.ok(node, 'createRoot was handed no #root');
                return { render(el) { mounted.push(el); }, unmount() {} };
            },
        };
        const own = srcs.filter((s) => !fromOs(s) && !isVendorReact(s)).map((s) => s.replace(/^\.\//, ''));
        let w;
        await assert.doesNotReject(async () => {
            w = await bootFiles(own, { React: r.React, ReactDOM });
        }, 'a script on the page threw while loading');
        assert.equal(mounted.length, 1, 'the page did not render exactly once into #root');
        const app = mounted[0];
        // App is local to App.jsx's scope (it is the mount, not an export).
        assert.equal(typeof (app && app.type), 'function', 'what was mounted is not a component');
        assert.equal(app.type.name, 'App', `mounted ${app.type.name}, not App`);
        let first;
        assert.doesNotThrow(() => { first = r.render(app.type, app.props); }, 'the App threw on its first render');
        assert.ok(first.tree, 'the App rendered nothing');
        w.cleanup();
    });
});
