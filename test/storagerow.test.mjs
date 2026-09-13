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
 * Header: storagerow.test.mjs
 * Purpose: The Storage row's byline draws the number the browser reports, not
 *   its fallback string.
 * Description: `SeqControls` asks `navigator.storage.estimate()` how much this
 *   origin is holding so the ⟳ Clear Cache button can say whether it is worth
 *   pressing. The guard in front of that call tested `navigator.storageestimate`
 *   for eleven days — not an API, so the effect returned before it asked
 *   anything and the byline rendered its fallback on every visit ever made.
 *
 *   THE FAILURE MODE IS SILENCE, which is why this asserts the VALUE and not the
 *   code path. A reading drawn from a property that does not exist is
 *   `undefined`: nothing throws, no panel goes blank, no console line appears,
 *   and a test that only rendered the component passed throughout. So this
 *   hands the world a `navigator` whose `storage.estimate()` resolves a known
 *   number and then reads the byline text back out of the element tree.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from './harness.mjs';
import { makeReact } from './fakeReact.mjs';
import { ALL_SOURCES } from './bundleSources.mjs';

/** 14.2 MB, chosen so the rendered string is unambiguous at one decimal place. */
const USAGE_BYTES = 14_900_000;

/** Every string in an element tree, flattened, in render order. */
const textOf = (node, out = []) => {
    if (node == null || typeof node === 'boolean') return out;
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
    if (Array.isArray(node)) { node.forEach((n) => textOf(n, out)); return out; }
    if (typeof node === 'object') {
        if (node.props) Object.values(node.props).forEach((v) => {
            if (typeof v === 'string') out.push(v);
            else if (v && typeof v === 'object') textOf(v, out);
        });
        (node.children || []).forEach((n) => textOf(n, out));
    }
    return out;
};

/** The props SeqControls is opened with — the transport, not the storage row. */
const PROPS = {
    recording: false, toggleRecording() {},
    clickVol: 0.5, setClickVol() {},
    isPlaying: false, togglePlayback() {},
    bpm: 120, setBpm() {}, swing: 50, setSwing() {}, tapping: false, tapTempo() {},
    steps: 16, setSteps() {}, doubleTo() {},
    rendering: false, renderLoop() {},
    savePattern() {}, clearPattern() {},
    configOpen: false, setConfigOpen() {},
};

const ReactDOM = {
    // The transport lives in a footer portal. The storage row does not, but the
    // portal is rendered on the same pass, so it has to exist or the render
    // throws before the row is reached.
    createPortal: (children) => children,
    render() {}, createRoot: () => ({ render() {} }),
};

describe('the Storage row byline', () => {
    test('draws the usage navigator.storage.estimate reports', async () => {
        const r = makeReact();
        const w = await createWarmWorld({
            sources: ALL_SOURCES,
            React: r.React,
            ReactDOM,
            navigator: {
                userAgent: 'oa-test',
                storage: { estimate: async () => ({ usage: USAGE_BYTES, quota: 1e9 }) },
            },
        });

        const SeqControls = w.window.SeqControls;
        assert.ok(SeqControls, 'SeqControls did not load');

        const first = r.render(SeqControls, PROPS);
        const cleanups = r.runEffects(first);
        // The estimate is a promise. Wait on the clock, not on a turn count.
        await w.settle(() => r.render(SeqControls, PROPS, first).hooks.includes(USAGE_BYTES), 2000);

        const after = r.render(SeqControls, PROPS, first);
        const text = textOf(after.tree).join(' | ');

        assert.ok(
            text.includes('holding 14.2 MB'),
            'the byline never drew the number the browser reported — it rendered:\n  '
            + (text.split(' | ').find((s) => s.includes('clears the app files')) || '(no byline at all)'),
        );

        cleanups.forEach((c) => c());
        w.cleanup();
    });

    test('falls back to the plain string when the browser has no estimate API', async () => {
        // The other half of the same guard: an origin without the Storage API
        // must still draw a byline rather than a crash or an empty span.
        const r = makeReact();
        const w = await createWarmWorld({
            sources: ALL_SOURCES,
            React: r.React,
            ReactDOM,
            navigator: { userAgent: 'oa-test' },
        });

        const first = r.render(w.window.SeqControls, PROPS);
        const cleanups = r.runEffects(first);
        await w.flush();

        const text = textOf(r.render(w.window.SeqControls, PROPS, first).tree).join(' | ');
        assert.ok(
            text.includes('clears the app files only, your work is kept'),
            'no byline was drawn at all without the Storage API',
        );
        assert.ok(!text.includes('holding'), 'a number was drawn with nothing to draw it from');

        cleanups.forEach((c) => c());
        w.cleanup();
    });
});
