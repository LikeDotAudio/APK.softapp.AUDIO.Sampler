// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: payloads.test.mjs
 * Purpose: Hold what this app PUTS ON THE BUS to the shapes declared in
 *   `libControl/App/oaTopics.js` (OA_BUS_PAYLOADS), as another bus client sees
 *   them — the JSON text on the wire, parsed back.
 * Description: A fake mqtt client is dialled through the real `mqttBus.js`
 *   (`oaConnectBus` with an `oa_bus_url` override), the real hooks are driven
 *   through their own setters, and every publish is checked. Then the other
 *   direction: a message of the declared shape, delivered by the client, must
 *   land — the EQ trim through the bridge, a pad's sample in the Pads' kit list.
 *
 *   Every declared topic must be EXERCISED here, one way or the other, so a
 *   shape cannot be written down and then never checked.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createWarmWorld } from './harness.mjs';
import { makeReact } from './fakeReact.mjs';
import { ALL_SOURCES } from './bundleSources.mjs';

/** A world with a fake broker on the real bus adapter. */
const openBus = async () => {
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
    const deliver = (topic, payload) => handlers.message(topic, { toString: () => JSON.stringify(payload) });
    return { w, r, window, published, deliver };
};

/** Render a probe that calls `hook()` and keep what it returned. */
const probe = (r, hook) => {
    const seen = {};
    const Probe = () => { seen.v = hook(); return null; };
    let state = r.render(Probe, {});
    r.runEffects(state);
    return {
        get: () => seen.v,
        rerender: () => { state = r.render(Probe, {}, state); return seen.v; },
    };
};

describe('bus payloads (oaTopics.js OA_BUS_PAYLOADS)', () => {
    test('the topic builders spell the grammar other trees already speak', async () => {
        const { w, window } = await openBus();
        const t = window.oaTopics;
        assert.equal(t.drumKitSample(3), 'APK.audio/Gui/DrumKit/3/sample');
        assert.equal(t.drumKitEq(2, 'loGain'), 'APK.audio/Gui/DrumKit/2/eq/loGain');
        assert.equal(t.seq('Pattern Sequencer', 'pattern'), 'APK.audio/Gui/Sequencer/Pattern_Sequencer/pattern');
        assert.throws(() => t.seq('x', 'nope'), /no sequencer topic/);
        assert.deepEqual(t.parseDrumKitEq('APK.audio/Gui/DrumKit/4/eq/midGain'), { pad: 4, band: 'midGain' });
        assert.equal(t.parseDrumKitEq('APK.audio/Gui/DrumKit/-1/eq/midGain'), null);
        assert.equal(window.oaBusPayloadProblem('APK.audio/Gui/Elsewhere', {}), 'no declared shape');
        w.cleanup();
    });

    test('everything the app publishes is the declared shape, and every shape is exercised', async () => {
        const { w, r, window, published, deliver } = await openBus();
        window.prompt = () => 'Probe Set';

        // The sequencer: every one of its nine topics, through its own setters.
        const seq = probe(r, () => window.useSeqState('Pattern Sequencer', 16, window.OA_DRUM_KIT || []));
        const s = seq.get();
        s.setBpm(128);
        s.setClickVol(0.5);
        s.setMasterVol(0.9);
        s.toggleMute(0);
        s.toggleSolo(1);
        s.setTrackVol((v) => v.map(() => 0.7));
        s.setTrackPan((v) => v.map(() => -0.25));
        s.setLibraryItems([{ name: 'A', grid: [[0, 1]] }]);
        s.setSongItems([{ pattern: 'A', repeat: 2 }]);

        // The pads: a sample assignment, and a saved set.
        const pads = probe(r, () => window.useSamplerState(() => {}));
        pads.get().publishSample(0, 'kick.wav', 'Kits/909');
        const sets = probe(r, () => window.useSamplerSets(() => {}, pads.get().publishSample));
        sets.get().newSet();

        // The sound browser: star one file.
        const browse = probe(r, () => window.useSoundBrowseState());
        browse.get().setSelected({ name: 'snare.wav', folder: 'Kits/909' });
        browse.rerender().toggleFav();

        const problems = published
            .map(({ topic, text }) => ({ topic, problem: window.oaBusPayloadProblem(topic, JSON.parse(text)) }))
            .filter((p) => p.problem);
        assert.deepEqual(problems, [], 'a publish is not its declared shape');

        // Inbound: the EQ trim from the console bridge, in both accepted forms.
        deliver(window.oaTopics.drumKitEq(0, 'hiGain'), { value: 6 });
        deliver(window.oaTopics.drumKitEq(1, 'loGain'), -3);
        assert.equal(window.oaBusPayloadProblem(window.oaTopics.drumKitEq(0, 'hiGain'), { value: 6 }), null);

        const exercised = new Set([
            ...published.map((p) => p.topic),
            window.oaTopics.drumKitEq(0, 'hiGain'),
        ]);
        const matches = (filter, topic) => new RegExp(`^${filter.replace(/[.]/g, '\\.').replace(/\+/g, '[^/]+')}$`).test(topic);
        const never = Object.keys(window.OA_BUS_PAYLOADS)
            .filter((f) => ![...exercised].some((t) => matches(f, t)));
        assert.deepEqual(never, [], 'a declared shape that nothing in this test produced');
        w.cleanup();
    });

    test('a pad sample published by another client reaches the Pads\' kit list', async () => {
        // THE REGRESSION: `kitMeta` JSON.parsed a value mqttBus.js had already
        // parsed, threw on every object, and so never saw a bus-published kit.
        const { w, r, window, deliver } = await openBus();
        const pads = probe(r, () => window.useSamplerState(() => {}));
        deliver(window.oaTopics.drumKitSample(2), { name: 'clap.wav', folder: 'Kits/808' });
        const after = pads.rerender();
        assert.deepEqual(after.kitMeta[2], { name: 'clap.wav', folder: 'Kits/808' });
        w.cleanup();
    });

    test('a shape check names what is wrong', async () => {
        const { w, window } = await openBus();
        const p = window.oaBusPayloadProblem;
        assert.match(p('APK.audio/Gui/DrumKit/0/sample', { name: '' }), /name/);
        assert.match(p('APK.audio/Gui/Sequencer/X/mutes', { items: [true, 1] }), /mutes\.items\[1\]/);
        assert.match(p('APK.audio/Gui/Sequencer/X/pattern', { grid: [[0]], bpm: 'fast', steps: 16 }), /bpm/);
        assert.equal(p('APK.audio/Gui/DrumKit/0/eq/hiGain', 'loud'), 'not an object');
        w.cleanup();
    });
});

describe('the shared bus helper path (WEB.Frontend-Assets /FrontEnd/shared/apk-bus.js)', () => {
    /** A fake window.APKBus whose link records what it is asked to do. */
    const fakeApkBus = () => {
        const calls = { connect: [], published: [], subs: [] };
        const handlers = { connect: [], error: [], close: [] };
        const link = {
            connected: false,
            subscribe(filter, cb) { calls.subs.push({ filter, cb }); return () => {}; },
            publish(topic, text, opts) { calls.published.push({ topic, text, opts }); return true; },
            on(ev, fn) { (handlers[ev] || []).push(fn); return link; },
        };
        const api = {
            connect(opts) { calls.connect.push(opts); return Promise.resolve(link); },
        };
        const up = () => { link.connected = true; handlers.connect.forEach((f) => f('ws://oa-test/mqtt')); };
        /** One broker packet, offered to every matching subscription, as a link does. */
        const deliver = (topic, payload) => {
            const packet = { topic };
            const text = JSON.stringify(payload);
            const re = (f) => new RegExp(`^${f.replace(/[.]/g, '\\.').replace(/\+/g, '[^/]+').replace(/#$/, '.*')}$`);
            calls.subs.filter((s) => re(s.filter).test(topic)).forEach((s) => s.cb(topic, text, packet));
        };
        return { api, calls, up, deliver };
    };

    test('with APKBus on the page, the bus goes through it — own session, the chosen broker first', async () => {
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window } = w;
        const bus = fakeApkBus();
        window.APKBus = bus.api;
        window.localStorage.setItem('oa_bus_url', 'ws://oa-test/mqtt');
        window.oaConnectBus();
        await w.flush();
        assert.equal(bus.calls.connect.length, 1, 'APKBus.connect was not called once');
        assert.equal(bus.calls.connect[0].brokerUrl, 'ws://oa-test/mqtt');
        assert.equal(bus.calls.connect[0].shareShell, false);

        // A widget bound to one exact topic, and a raw wildcard over it.
        const seq = probe(r, () => window.useSeqState('Pattern Sequencer', 16, window.OA_DRUM_KIT || []));
        let wild = 0;
        window.oaBusSubscribe('APK.audio/Gui/Sequencer/+/masterVol', () => { wild++; });
        bus.up();

        seq.get().setMasterVol(0.4);
        const sent = bus.calls.published.find((p) => p.topic.endsWith('/masterVol'));
        assert.ok(sent, 'a state change was not published through the link');
        assert.deepEqual(JSON.parse(sent.text), { value: 0.4 });
        assert.equal(sent.opts.retain, true);

        bus.deliver(window.oaTopics.seq('Pattern Sequencer', 'masterVol'), { value: 0.2 });
        assert.equal(wild, 1, 'one packet matching two of our filters was delivered more than once');
        assert.equal(seq.rerender().masterVol, 0.2, 'an inbound value did not reach the widget');
        w.cleanup();
    });

    /** The script tags oaConnectBus appended, by src. */
    const scriptsOf = (window) => window.document.documentElement.children
        .filter((c) => c.tagName === 'SCRIPT');

    test('with no broker named, the helper is loaded and chooses — no port guess, no own mqtt.js (WS-05)', async () => {
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window } = w;
        window.location = { hostname: 'apk-gateway.example', host: 'apk-gateway.example', protocol: 'https:' };
        window.localStorage.removeItem('oa_bus_url');
        assert.equal(window.oaBusUrl(), null, 'oaBusUrl guessed a broker');
        window.oaConnectBus();
        const tags = scriptsOf(window);
        assert.deepEqual(tags.map((t) => t.src), ['/FrontEnd/shared/apk-bus.js']);

        const bus = fakeApkBus();
        window.APKBus = bus.api;
        tags[0].onload();
        await w.flush();
        assert.equal(bus.calls.connect.length, 1, 'APKBus.connect was not called once');
        assert.equal('brokerUrl' in bus.calls.connect[0], false, 'a broker was chosen for APKBus');
        assert.equal(bus.calls.connect[0].shareShell, false);
        w.cleanup();
    });

    test('where the helper is not served there is no bus, and no mqtt.js is fetched', async () => {
        const r = makeReact();
        const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
        const { window } = w;
        window.localStorage.setItem('oa_bus_url', 'ws://oa-test/mqtt');
        window.oaConnectBus();
        const tags = scriptsOf(window);
        assert.equal(tags.length, 1);
        tags[0].onerror();
        await w.flush();
        assert.deepEqual(scriptsOf(window).map((t) => t.src), ['/FrontEnd/shared/apk-bus.js'],
            'a second script (an own mqtt.js) was fetched after the helper failed');
        assert.equal(window.oaBusClient, undefined, 'a client appeared with no helper');
        w.cleanup();
    });
});
