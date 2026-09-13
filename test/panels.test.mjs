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
 * Header: panels.test.mjs
 * Purpose: Every effect panel opens, draws, and cleans up after itself.
 * Description: Babel checks that these files parse. Nothing checked that they
 *   RUN — so a renamed variable, a hook after an early return, or a prop that
 *   moved on one side of a call and not the other stayed invisible until the
 *   panel was opened, in a browser, by hand.
 *
 *   Each panel here is rendered twice, its effects are run, and its cleanups are
 *   called. That covers the three things that actually break:
 *
 *     OPENING     the render throws, and the panel is a blank rectangle.
 *     UPDATING    the second render calls a different number of hooks, which
 *                 React punishes by returning the wrong state to the wrong
 *                 variable — the bug that looks like a knob controlling its
 *                 neighbour.
 *     CLOSING     the cleanup does not detach, so the meter pump keeps running
 *                 and the panel it belonged to cannot be collected. That one is
 *                 a leak, which is where this whole exercise started.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from './harness.mjs';
import { makeReact, countNodes } from './fakeReact.mjs';

// The display layer needs the whole app loaded. Both lists come from
// `bundleSources.mjs`, which owns the one answer to "which files, in which
// order"; ALL_SOURCES is everything except the mount point.
import { ALL_SOURCES, BUNDLE_SOURCES } from './bundleSources.mjs';

/** The panels, and the props each is opened with. */
const PANELS = [
    { name: 'CompressorEditor', props: { idx: 0, name: 'Kick', onClose() {} } },
    { name: 'BussCompEditor', props: { onClose() {} } },
    { name: 'DriveEditor', props: { idx: 0, name: 'Kick', onClose() {} } },
    { name: 'TapeDelayEditor', props: { u: 0, bpm: 120, onClose() {} } },
    { name: 'ChorusEditor', props: { u: 0, onClose() {} } },
    { name: 'DrumSynthEditor', props: { idx: 0, name: 'Kick', onClose() {} } },
    { name: 'VarcRemote', props: { onClose() {} } },
    // The two panels drawn by the generic console surface. They were left off
    // this list while it named only the hand-built faceplates, which is how
    // EqEditor's blank curve survived: nothing rendered it. Both call
    // useOaFrame, and calling it wrongly is a hook that never attaches.
    { name: 'EqEditor', props: { idx: 0, name: 'Kick', onClose() {} } },
    { name: 'GateEditor', props: { idx: 0, name: 'Kick', onClose() {} } },
];

const openWorld = async () => {
    const r = makeReact();
    const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
    return { w, r };
};

describe('effect panels', () => {
    for (const panel of PANELS) {
        test(`${panel.name} opens, redraws and closes`, async () => {
            const { w, r } = await openWorld();
            const Component = w.window[panel.name];
            assert.ok(typeof Component === 'function', `${panel.name} is not defined`);

            let first;
            assert.doesNotThrow(() => { first = r.render(Component, panel.props); },
                `${panel.name} threw while opening`);
            assert.ok(countNodes(first.tree) > 5, `${panel.name} rendered almost nothing`);

            const cleanups = r.runEffects(first);

            // The second pass reuses the first pass's hook slots, exactly as
            // React does. A different count here means the hooks are behind a
            // condition and the state will be handed to the wrong variables.
            let second;
            assert.doesNotThrow(() => { second = r.render(Component, panel.props, first); },
                `${panel.name} threw on its second render`);
            assert.equal(
                second.hookCount, first.hookCount,
                `${panel.name} called ${second.hookCount} hooks on redraw and ${first.hookCount} on open`,
            );

            assert.doesNotThrow(() => cleanups.forEach((c) => c()),
                `${panel.name} threw while closing`);

            w.cleanup();
        });
    }

    test('every panel opens and greys while the rack is bypassed', async () => {
        // A panel that throws only when record is armed is a panel that throws
        // exactly when someone is trying to capture a take.
        const { w, r } = await openWorld();
        w.window.oaSetFxBypass(true);

        for (const panel of PANELS) {
            let first, second;
            assert.doesNotThrow(() => { first = r.render(w.window[panel.name], panel.props); },
                `${panel.name} threw while opening with the rack bypassed`);
            const cleanups = r.runEffects(first);
            assert.doesNotThrow(() => { second = r.render(w.window[panel.name], panel.props, first); },
                `${panel.name} threw on its second bypassed render`);
            // The bypass adds a hook. It must add the SAME one every pass, or
            // React hands the wrong state to the wrong variable.
            assert.equal(second.hookCount, first.hookCount,
                `${panel.name} called a different number of hooks on redraw while bypassed`);
            cleanups.forEach((c) => c());
        }

        w.window.oaSetFxBypass(false);
        w.cleanup();
    });

    test('arming record is ONE fact the whole desk agrees on', async () => {
        // THE REGRESSION THIS EXISTS FOR.
        //
        // `recording` was React.useState INSIDE useSeqState, while every other
        // piece of transport state in that hook goes through the shared store.
        // So every component calling it got its OWN copy: the Sequencer armed
        // one, the Mixer read another that never moved, and the Mixer was where
        // the rack was told to come out of circuit. The button lit, the take
        // recorded, and every effect went on processing — audible, and invisible
        // to every test, because each half worked perfectly on its own.
        //
        // Two probes, standing in for the two panels that disagreed.
        const { w, r } = await openWorld();
        const { window } = w;

        const seen = {};
        const makeProbe = (who) => function Probe() {
            seen[who] = window.useSeqState('Pattern Sequencer', 16, window.OA_DRUM_KIT || []);
            return null;
        };

        const a = r.render(makeProbe('a'), {});
        r.runEffects(a);
        const b = r.render(makeProbe('b'), {});
        r.runEffects(b);

        assert.equal(seen.a.recording, false, 'a fresh desk came up armed');
        assert.equal(seen.b.recording, false);

        // Arm from the FIRST probe — the one with the button, in the real app.
        seen.a.toggleRecording();

        assert.equal(
            window.oaFxBypassed(), true,
            'arming record did not take the rack out of the signal path',
        );

        // …and the SECOND probe, which never touched the button, has to agree.
        r.render(makeProbe('a'), {}, a);
        r.render(makeProbe('b'), {}, b);
        assert.equal(seen.b.recording, true,
            'one panel armed record and another still believes it is disarmed');

        // And it comes back. A bypass that latched would be worse than one that
        // never engaged: every take after it would be dry with nothing saying why.
        seen.b.toggleRecording();
        assert.equal(window.oaFxBypassed(), false, 'disarming did not put the rack back');
        r.render(makeProbe('a'), {}, a);
        assert.equal(seen.a.recording, false, 'the other panel is still armed');

        w.cleanup();
    });

    test('closing every panel leaves the meter pump stopped', async () => {
        const { w, r } = await openWorld();
        const { window } = w;

        assert.equal(window.oaPluginAttachCount(), 0, 'something was already attached');

        const cleanups = [];
        for (const panel of PANELS) {
            const result = r.render(window[panel.name], panel.props);
            cleanups.push(...r.runEffects(result));
        }

        // Panels that meter have attached; the rest have not, and either is
        // fine. What matters is that the count comes back to zero.
        const open = window.oaPluginAttachCount();
        assert.ok(open > 0, 'no panel attached to the pump at all');

        cleanups.forEach((c) => c());
        assert.equal(
            window.oaPluginAttachCount(), 0,
            `${window.oaPluginAttachCount()} panels are still attached after every one was closed — the pump will run forever`,
        );

        w.cleanup();
    });

    test('a panel draws from the frame without allocating', async () => {
        const { w, r } = await openWorld();
        const { window } = w;

        // Open the compressor panel and let its meter loop start.
        const result = r.render(window.CompressorEditor, { idx: 0, name: 'Kick', onClose() {} });
        const cleanups = r.runEffects(result);

        const frame = window.oaPluginFrame('comp', 0);
        // Drive the loop the way a browser frame would, a hundred times over.
        for (let i = 0; i < 100; i++) {
            window.oaPumpPluginsOnce();
            w.tick();
        }

        assert.equal(
            window.oaPluginFrame('comp', 0), frame,
            'a hundred frames replaced the array the panel is reading',
        );
        assert.ok(
            frame[window.OA_SLOT.SEQ] >= 100,
            `the pump ran ${frame[window.OA_SLOT.SEQ]} times, not 100`,
        );

        cleanups.forEach((c) => c());
        w.cleanup();
    });

    test('the whole app boots', async () => {
        // Everything the browser loads, including the mount point — the one
        // check that says the bundle as a whole executes rather than each
        // panel in isolation. A file that throws on load takes every file after
        // it with it, and this is the only test that would notice.
        const r = makeReact();
        const mounted = [];
        const ReactDOM = {
            render(element, container) { mounted.push({ element, container }); },
            createRoot(container) {
                return { render(element) { mounted.push({ element, container }); } };
            },
        };

        let w;
        await assert.doesNotReject(
            async () => {
                w = await createWarmWorld({ sources: BUNDLE_SOURCES, React: r.React, ReactDOM });
            },
            'the bundle threw while loading',
        );

        assert.ok(w.window.Mixer, 'the app loaded but defined no Mixer');
        assert.ok(w.window.oaPluginIds().length >= 7, 'the plugins did not all register');
        w.cleanup();
    });

    test('the Mixer opens with the full rack behind it', async () => {
        const { w, r } = await openWorld();
        const { window } = w;

        // The Mixer is the one panel that meters every plugin at once, so it is
        // the one most likely to be broken by a layout change in any of them.
        const props = {
            bpm: 120,
            trackVol: new Array(window.OA_PAD_MAX).fill(1),
            trackPan: new Array(window.OA_PAD_MAX).fill(0),
            mutes: new Array(window.OA_PAD_MAX).fill(false),
            solos: new Array(window.OA_PAD_MAX).fill(false),
            setTrackVol() {}, setTrackPan() {}, setMutes() {}, setSolos() {},
            masterVol: 1, setMasterVol() {},
            clickVol: 0.5, setClickVol() {},
            onClose() {},
        };

        let out;
        assert.doesNotThrow(() => { out = r.render(window.Mixer, props); }, 'the Mixer threw while opening');
        assert.ok(countNodes(out.tree) > 20, 'the Mixer rendered almost nothing');

        const cleanups = r.runEffects(out);
        for (let i = 0; i < 10; i++) { window.oaPumpPluginsOnce(); w.tick(); }
        assert.doesNotThrow(() => cleanups.forEach((c) => c()), 'the Mixer threw while closing');
        assert.equal(window.oaPluginAttachCount(), 0, 'the Mixer left the pump running');

        w.cleanup();
    });
});
