// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: deeplink.test.mjs
 * Purpose: `index.html#/<view>` (libControl/App/oaDeepLink.js) opens the panel
 *   it names. The AUDIO.* launcher pointer tiles link these addresses, so the
 *   list of views is a contract: a renamed key is a tile that opens nothing.
 * Description: the parser and the two events it raises, then the Mixer itself —
 *   rendered once, an `oa-open-fx` dispatched, rendered again — must draw the
 *   faceplate the link asked for.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createWarmWorld } from './harness.mjs';
import { makeReact } from './fakeReact.mjs';
import { ALL_SOURCES } from './bundleSources.mjs';

/** The views the launcher tiles link to. Removing one breaks a tile. */
// Declared in exports.json (bundles.app.deepLinks), the contract the tiles read.
import { readFileSync } from 'node:fs';
const LINKED = JSON.parse(readFileSync(new URL('../exports.json', import.meta.url), 'utf8')).bundles.app.deepLinks;

const open = async () => {
    const r = makeReact();
    const ReactDOM = { createPortal: (el) => el, render() {}, createRoot: () => ({ render() {} }) };
    const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React, ReactDOM });
    return { w, r };
};

/** Does the element tree contain an element of `type`? */
const contains = (node, type) => {
    if (node == null || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some((n) => contains(n, type));
    return node.type === type || (node.children || []).some((n) => contains(n, type));
};

describe('deep links (oaDeepLink.js)', () => {
    test('every linked view is declared, and the hash spellings all parse', async () => {
        const { w } = await open();
        const { window } = w;
        assert.deepEqual(LINKED.filter((v) => !window.OA_DEEP_LINKS[v]), []);
        assert.deepEqual(Object.keys(window.OA_DEEP_LINKS).sort(), [...LINKED].sort(), 'OA_DEEP_LINKS and exports.json deepLinks disagree');
        for (const h of ['#/mixer', '#mixer', '#/Mixer/', '#/mixer?x=1']) {
            assert.equal(window.oaParseDeepLink(h).view, 'mixer', h);
        }
        for (const h of ['', '#', '#/', '#/nowhere']) assert.equal(window.oaParseDeepLink(h), null, h);
        w.cleanup();
    });

    test('applying a link raises its tabs and asks for its faceplate', async () => {
        const { w } = await open();
        const { window } = w;
        const before = w.events.length;
        window.oaApplyDeepLink('#/reverb');
        const raised = w.events.slice(before);
        assert.deepEqual(raised.filter((e) => e.type === 'oa-open-tab').map((e) => e.detail.tab), ['MIXER']);
        assert.deepEqual(raised.filter((e) => e.type === 'oa-open-fx').map((e) => e.detail), [{ plugin: 'reverb', unit: 0 }]);
        assert.equal(window.oaApplyDeepLink('#/nowhere'), null);
        w.cleanup();
    });

    const FACEPLATE = {
        reverb: 'VarcRemote', tapedelay: 'TapeDelayEditor', chorus: 'ChorusEditor', buss: 'BussCompEditor',
        drumsynth: 'DrumSynthEditor', compressor: 'CompressorEditor', eq: 'EqEditor', gate: 'GateEditor',
        drive: 'DriveEditor',
    };
    for (const [view, editor] of Object.entries(FACEPLATE)) {
        test(`#/${view} opens ${editor} in the Mixer`, async () => {
            const { w, r } = await open();
            const { window } = w;
            const M = window.OA_PAD_MAX;
            const props = {
                bpm: 120, trackVol: new Array(M).fill(1), trackPan: new Array(M).fill(0),
                mutes: new Array(M).fill(false), solos: new Array(M).fill(false),
                setTrackVol() {}, setTrackPan() {}, setMutes() {}, setSolos() {},
                masterVol: 1, setMasterVol() {}, clickVol: 0.5, setClickVol() {}, onClose() {},
            };
            let out = r.render(window.Mixer, props);
            assert.equal(contains(out.tree, window[editor]), false, `${editor} was open before the link`);
            const cleanups = r.runEffects(out);
            window.oaApplyDeepLink(`#/${view}`);
            out = r.render(window.Mixer, props, out);
            assert.ok(contains(out.tree, window[editor]), `#/${view} did not open ${editor}`);
            cleanups.forEach((c) => c());
            w.cleanup();
        });
    }

    test('the page follows the hash on load (App.jsx)', async () => {
        const { bootFiles } = await import('./bootScripts.mjs');
        const r = makeReact();
        const mounted = [];
        const ReactDOM = { createPortal: (el) => el, render() {}, createRoot: () => ({ render(el) { mounted.push(el); } }) };
        const w = await bootFiles(['dist/app.js'], { React: r.React, ReactDOM,
            prepare: (win) => { win.location = { hash: '#/tapedelay', hostname: 'oa-test', pathname: '/' }; } });
        const app = mounted[0];
        const first = r.render(app.type, app.props);
        const before = w.events.length;
        r.runEffects(first);
        const raised = w.events.slice(before);
        assert.ok(raised.some((e) => e.type === 'oa-open-tab' && e.detail.tab === 'MIXER'), 'the hash raised no MIXER tab');
        assert.ok(raised.some((e) => e.type === 'oa-open-fx' && e.detail.plugin === 'delay'), 'the hash asked for no tape delay');
        w.cleanup();
    });
});
