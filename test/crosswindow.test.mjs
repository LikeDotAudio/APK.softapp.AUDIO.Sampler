// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: crosswindow.test.mjs
 * Purpose: Hold the two roads by which one window of this origin hears another
 *   (ROAD-3699 — APK:OS opens Pads, Sequencer and the rest as separate pages).
 * Description: a `storage` event for a bound `mqtt_cache_<topic>` lands on the
 *   widget exactly as a broker write does, and is NOT published back; an
 *   unbound or foreign key is ignored. A pad another window kept is ignored by
 *   a page whose kit is not resident, and by the window that said it.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createWarmWorld } from './harness.mjs';
import { makeReact } from './fakeReact.mjs';
import { ALL_SOURCES } from './bundleSources.mjs';

const world = async () => {
    const r = makeReact();
    const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
    const { window } = w;
    const published = [];
    const handlers = {};
    const client = {
        connected: true,
        on(ev, fn) { handlers[ev] = fn; },
        publish(topic, text) { published.push({ topic, text }); },
        subscribe() {},
    };
    window.localStorage.setItem('oa_bus_url', 'ws://oa-test/mqtt');
    window.mqtt = { connect: () => client };
    window.oaConnectBus();
    handlers.connect();
    return { w, r, window, published };
};

const probe = (r, hook) => {
    const seen = {};
    const Probe = () => { seen.v = hook(); return null; };
    let state = r.render(Probe, {});
    r.runEffects(state);
    return { get: () => seen.v, rerender: () => { state = r.render(Probe, {}, state); return seen.v; } };
};

describe('one origin, many windows (ROAD-3699)', () => {
    test('a pattern written in another window lands here and is not published back', async () => {
        const { w, r, window, published } = await world();
        const seq = probe(r, () => window.useSeqState('Pattern Sequencer', 16, window.OA_DRUM_KIT || []));
        const topic = window.oaTopics.seq('Pattern Sequencer', 'pattern');
        const before = published.length;
        const theirs = { grid: [[1, 0, 1, 0]], bpm: 97, swing: 50, steps: 4, toneTrack: [], toneRoot: null };
        assert.equal(window.oaApplyStorageEvent('mqtt_cache_' + topic, JSON.stringify(theirs)), true);
        const s = seq.rerender();
        assert.equal(s.bpm, 97, 'the other window\'s tempo is this window\'s tempo');
        assert.equal(published.length, before, 'nothing is published back');
        w.cleanup();
    });

    test('a key nothing here is bound to, a foreign key, or junk changes nothing', async () => {
        const { w, window } = await world();
        assert.equal(window.oaApplyStorageEvent('mqtt_cache_APK.audio/Gui/Nobody/here', '{"a":1}'), false);
        assert.equal(window.oaApplyStorageEvent('oa_bus_url', 'ws://x'), false);
        assert.equal(window.oaApplyStorageEvent(null, null), false);
        w.cleanup();
    });

    test('a kept pad is not taken by a page whose kit is not resident, nor by the window that said it', async () => {
        const { w, window } = await world();
        assert.equal(await window.oaKitHeard({ from: 'elsewhere', op: 'kept', idx: 0 }), false);
        assert.equal(await window.oaKitHeard(null), false);
        w.cleanup();
    });
});
