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

// The three MQTT hooks the whole app is written against, backed by a real
// broker when there is one and by localStorage when there is not.
//
// WHAT THIS OWNS: `window.useMqttState`, `useMqttMessages` and `useMqttPublish`
// — the same three names, the same signatures, and the same behaviour on a
// machine with no broker as the mock this replaces had. Fifteen call sites in
// the sequencer, the pads, the sets and the sound browser bind to them. And
// `window.oaBusSubscribe`, which is the same bus reached from outside React:
// a topic FILTER and a callback, for the plain modules that load before React
// and bind to topics no widget names.
//
// WHAT IT MUST NOT DO: change what the standalone app does. Sampler.Like.audio
// is published as a static bundle to a host with no broker on it, and the local
// store is what makes it work there. So the local store is not a fallback that
// switches on after a failure — it is the store, always, and the broker is a
// second writer into it. A page that has never reached a broker behaves exactly
// as it did before this file existed.
//
// WHY IT DOES NOT DIAL OUT ON THE PUBLIC SITE. A `ws://` from a page served
// over https is blocked as mixed content, and one to a broker that is not there
// fails on every load — a console full of red on the published app, in exchange
// for nothing, because there is no broker on that host to find. WHICH broker,
// and whether there is one at all, is not decided here: the shared softapp helper
// `window.APKBus` (`/FrontEnd/shared/apk-bus.js`) answers it with the shell's
// seed order — the saved `oa_bus_url`, the shell's broker when framed, the
// same-origin `/mqtt` gateway door when the site declares one (or the host is a
// bench), and nothing on a public origin. See `oaConnectBus`.

const globalStore = {};
const globalListeners = {};

// Set by a broker write, cleared as soon as the local setter has run. An
// inbound value must reach the widgets WITHOUT being published straight back:
// two tabs echoing each other's state is a loop that looks like drift.
const inboundTopics = new Set();

// Every message the broker has delivered, by topic — what `useMqttMessages`
// answers with. The sampler reads it for remembered samples.
const received = {};
const receivedListeners = new Set();

let busClient = null;
const subscribed = new Set();

// The second door onto the bus, for the modules that are not React.
//
// `useMqttState` is a hook: it can only be called from a render, and it binds
// ONE exact topic. An effect unit is a plain module that loads before React
// does and wants a WILDCARD — every strip's EQ, not strip 3's high shelf. So
// `oaBusSubscribe` below takes a filter and a callback, and both doors feed the
// same client.
const rawSubscriptions = [];

// ---------------------------------------------------------------------------
// AM I ON A BENCH? One answer, in one place, for the page's OTHER bench-only
// offers — `useSoundBrowseState.js` lists two demo songs the upload set
// deliberately drops (PLAN-387.01), and asks this. It is NOT the bus's question
// any more (2026-10-30 SDK audit, WS-05): a gateway hostname is not an RFC 1918
// literal, and the broker behind it was unreachable while the bus asked this.
//
// No `location` at all means no page: the test harness boots this bundle in a
// stub world, and a headless build has no bench. Not-a-bench is the correct
// answer there rather than a defensive throw.
//
// It reads the hostname and nothing else, so it says where the PAGE came from,
// not whether a given file is on the host. A caller that needs the second
// question has to ask the host — see the `res.ok` branch in
// useSoundBrowseState.js, which is the proof behind this inference.
window.oaIsLocalOrigin = function () {
    const where = window.location;
    if (!where || typeof where.hostname !== 'string') return false;
    const host = where.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === ''
        || /^192\.168\./.test(host) || /^10\./.test(host);
};

// The broker somebody NAMED for this page, or null — and null is not "no bus",
// it is "let APKBus choose". Today the only name is the saved `oa_bus_url`
// override (which APKBus would take anyway; naming it keeps it first). The OS
// sound agent (APK:OS/Midi/site/agent/sound-agent.js) redefines this global
// when the desk frames the page, to name its MessagePort client; `exports.json`
// lists it for that reason. No port is guessed here: the old websocket-port guess
// reached whichever broker held that port on the machine the BROWSER runs on.
window.oaBusUrl = function () {
    try {
        const override = localStorage.getItem('oa_bus_url');
        if (override) return override;
    } catch (e) { /* private mode: no override, not an error */ }
    return null;
};

function publishState(topic, value) {
    if (!busClient || !busClient.connected) return;
    try {
        // Retained, because this is STATE and not an event: a tab opened after
        // the move was made must come up showing the move, not the default.
        // The komand path retains nothing and says why — a replayed komand
        // fires an instrument. A replayed fader position is just the position.
        busClient.publish(topic, JSON.stringify(value), { qos: 0, retain: true });
    } catch (e) {
        console.warn('[sampler] publish failed —', topic, e);
    }
}

function subscribeOnce(topic) {
    if (!busClient || !busClient.connected || subscribed.has(topic)) return;
    subscribed.add(topic);
    try {
        busClient.subscribe(topic, { qos: 0 });
    } catch (e) {
        subscribed.delete(topic);
        console.warn('[sampler] subscribe failed —', topic, e);
    }
}

// MQTT topic-filter matching: `+` is one level, `#` is the rest. The hook path
// never needs it because its topics are literal; a raw subscriber always does.
function topicMatches(filter, topic) {
    if (filter === topic) return true;
    const f = filter.split('/'), t = topic.split('/');
    for (let i = 0; i < f.length; i++) {
        if (f[i] === '#') return true;
        if (f[i] === '+') { if (t[i] === undefined) return false; continue; }
        if (f[i] !== t[i]) return false;
    }
    return f.length === t.length;
}

/**
 * Listen to a topic FILTER from outside React. Returns an unsubscribe.
 *
 * The callback receives `(topic, value)` with the value already parsed, and it
 * fires for broker traffic only — a local write through `useMqttState` does not
 * come back round, which is what keeps a bridge from fighting the widget that
 * moved.
 */
window.oaBusSubscribe = function (filter, cb) {
    const entry = { filter: filter, cb: cb };
    rawSubscriptions.push(entry);
    subscribeOnce(filter);
    return function () {
        const at = rawSubscriptions.indexOf(entry);
        if (at >= 0) rawSubscriptions.splice(at, 1);
    };
};

// A broker write, applied to the local store and pushed at the widgets. Guarded
// by `inboundTopics` so the setter below does not publish it straight back.
function applyInbound(topic, text) {
    let value;
    try {
        value = JSON.parse(text);
    } catch (e) {
        return; // not ours, or not JSON — the bus carries other people's traffic
    }

    received[topic] = value;
    receivedListeners.forEach(l => l(received));

    // Raw subscribers first, and unconditionally: a bridge is bound to a topic
    // no widget has ever named, so the `globalStore` gate below would drop it.
    for (let i = 0; i < rawSubscriptions.length; i++) {
        const sub = rawSubscriptions[i];
        if (!topicMatches(sub.filter, topic)) continue;
        try {
            sub.cb(topic, value);
        } catch (e) {
            console.warn('[sampler] subscriber threw —', topic, e);
        }
    }

    if (!(topic in globalStore)) return; // nothing on screen is bound to it yet
    inboundTopics.add(topic);
    try {
        globalStore[topic] = value;
        if (globalListeners[topic]) globalListeners[topic].forEach(l => l(value));
    } finally {
        inboundTopics.delete(topic);
    }
}

// ANOTHER WINDOW OF THIS ORIGIN MOVED SOMETHING (ROAD-3699).
//
// APK:OS opens every MIDI instrument as its own page — Pads, Sequencer and the
// rest each carry this bundle — and a pattern drawn in one was not in the
// other: with no broker (or before it answers) the store is localStorage, and
// a page only reads that at first bind. The browser already says when another
// page of the origin writes it: the `storage` event. A `mqtt_cache_<topic>`
// write lands here exactly as a broker write does — through the inbound gate,
// so nothing is published back and two windows agree rather than shout.
const CACHE_PREFIX = 'mqtt_cache_';
window.oaApplyStorageEvent = function (key, text) {
    if (typeof key !== 'string' || key.indexOf(CACHE_PREFIX) !== 0 || text == null) return false;
    const topic = key.slice(CACHE_PREFIX.length);
    if (!(topic in globalStore)) return false; // nothing here is bound to it; first bind reads the cache
    let value;
    try { value = JSON.parse(text); } catch (e) { return false; }
    inboundTopics.add(topic);
    try {
        globalStore[topic] = value;
        if (globalListeners[topic]) globalListeners[topic].forEach(l => l(value));
    } finally {
        inboundTopics.delete(topic);
    }
    return true;
};
if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (e) => {
        try { window.oaApplyStorageEvent(e && e.key, e && e.newValue); } catch (err) { /* not ours */ }
    });
}

// THE SHARED HELPER IS THE ONLY WAY ONTO A BROKER (2026-10-30 SDK audit, WS-05).
// Under the APK portal and on apk.audio, WEB.Frontend-Assets serves the one
// softapp bus helper at `/FrontEnd/shared/apk-bus.js` (window.APKBus). It owns
// the three decisions this file used to make for itself: which broker (the
// shell's seed order, above), whether to dial at all (a public origin gets
// null, and mqtt.js — 330 KB, larger than this app's bundle — is never fetched
// there), and which mqtt.js (the ONE vendored copy beside it, or the shell's).
// This repo no longer carries an mqtt.js of its own. So the order is:
//   1. `window.APKBus` already on the page — use it.
//   2. `window.mqtt` already on the page AND a broker named for it — the OS
//      sound agent's port client when the desk frames this page (it names
//      `apk-sound-port://shell` through `oaBusUrl`), or a test's fake. Used
//      directly: the agent's client is a MessagePort shim, not a broker URL.
//   3. load `/FrontEnd/shared/apk-bus.js`. Where it is not served, there is no
//      bus, and the local store is the whole story — as on any static host.
const SHARED_BUS_HELPER = '/FrontEnd/shared/apk-bus.js';

function loadScript(src, onload, onerror) {
    const tag = document.createElement('script');
    tag.src = src;
    tag.onload = onload;
    tag.onerror = onerror;
    (document.head || document.documentElement).appendChild(tag);
}

/** then(APKBus) with the shared helper, or then(null) for a named window.mqtt. */
function withBusLib(named, then) {
    if (window.APKBus) return then(window.APKBus);
    if (window.mqtt && named) return then(null);
    loadScript(SHARED_BUS_HELPER,
        () => (window.APKBus ? then(window.APKBus) : noLib()),
        noLib);
}
const noLib = () => console.log('[sampler] no shared bus helper on this host — bus stays local');

/**
 * An APKBus link with the face of an mqtt.js client, so everything below —
 * `publishState`, `subscribeOnce`, the connect handler — is the same code on
 * both paths. Messages arrive per subscription on a link; one packet that
 * matches two of our filters (a widget's exact topic and a bridge's wildcard)
 * is delivered once, as mqtt.js's single `message` event delivered it.
 */
function linkAsClient(link) {
    let lastPacket = null;
    const deliver = (topic, text, packet) => {
        if (packet && packet === lastPacket) return;
        lastPacket = packet || null;
        applyInbound(topic, text);
    };
    return {
        link,
        get connected() { return link.connected; },
        publish: (topic, text, opts) => link.publish(topic, text, opts),
        subscribe: (filter) => { link.subscribe(filter, deliver); },
        on(event, fn) {
            // 'message' is per-subscription on a link (deliver, above).
            if (event === 'connect' || event === 'error' || event === 'close') link.on(event, fn);
            return this;
        },
    };
}

function wireClient(client, url) {
    busClient = client;
    busClient.on('connect', () => {
        console.log('[sampler] bus up —', url);
        // Everything already on screen, now that there is somewhere to say it.
        for (const topic of Object.keys(globalStore)) subscribeOnce(topic);
        // And every filter a non-React module asked for before the dial.
        for (const sub of rawSubscriptions) subscribeOnce(sub.filter);
    });
    busClient.on('message', (topic, payload) => applyInbound(topic, payload.toString()));
    busClient.on('error', (err) => console.warn('[sampler] bus error —', err && err.message));
    window.oaBusClient = busClient;
}

window.oaConnectBus = function () {
    const named = window.oaBusUrl();

    withBusLib(named, (APKBus) => {
        if (APKBus) {
            // Our own session (shareShell: false), as this app always had: it
            // publishes retained state of its own and must not borrow the
            // shell's will or client id. A named broker goes first; with none,
            // APKBus walks the shell's seed order, and resolves null where
            // this page has no broker.
            const opts = { shareShell: false, reconnectPeriod: 5000 };
            if (named) opts.brokerUrl = named;
            APKBus.connect(opts)
                .then((link) => { if (link) wireClient(linkAsClient(link), link.url || named || 'APKBus'); })
                .catch((e) => console.warn('[sampler] no bus —', e));
            return;
        }
        let client;
        try {
            client = window.mqtt.connect(named, { reconnectPeriod: 5000 });
        } catch (e) {
            console.warn('[sampler] no bus —', e);
            return;
        }
        wireClient(client, named);
    });
    return null; // the client does not exist yet; `window.oaBusClient` is the handle
};

// ---------------------------------------------------------------------------
// The three hooks.

window.useMqttState = function (topic, defaultState) {
    const cacheKey = 'mqtt_cache_' + topic;
    if (!(topic in globalStore)) {
        try {
            const cached = localStorage.getItem(cacheKey);
            globalStore[topic] = cached ? JSON.parse(cached) : defaultState;
        } catch (e) {
            globalStore[topic] = defaultState;
        }
    }
    const [state, setState] = React.useState(globalStore[topic]);

    React.useEffect(() => {
        if (!globalListeners[topic]) {
            globalListeners[topic] = new Set();
        }
        const listener = (newVal) => setState(newVal);
        globalListeners[topic].add(listener);
        // Late-bound topics still get their subscription: a pad grid mounted
        // after connect would otherwise never hear a thing.
        subscribeOnce(topic);
        return () => globalListeners[topic].delete(listener);
    }, [topic]);

    const setGlobalState = React.useCallback((newVal) => {
        const nextVal = typeof newVal === 'function' ? newVal(globalStore[topic]) : newVal;
        globalStore[topic] = nextVal;
        try {
            localStorage.setItem(cacheKey, JSON.stringify(nextVal));
        } catch (e) {}
        if (globalListeners[topic]) {
            globalListeners[topic].forEach(l => l(nextVal));
        }
        // Not while APPLYING a broker write — that is the echo, and it is the
        // difference between two tabs agreeing and two tabs shouting.
        if (!inboundTopics.has(topic)) publishState(topic, nextVal);
    }, [topic]);

    return [state, setGlobalState];
};

// Every message the broker has delivered, by topic. `{}` until one does, which
// is what the mock returned unconditionally and why nothing bound to it moved.
window.useMqttMessages = function () {
    const [messages, setMessages] = React.useState(received);
    React.useEffect(() => {
        const listener = (all) => setMessages({ ...all });
        receivedListeners.add(listener);
        return () => receivedListeners.delete(listener);
    }, []);
    return messages;
};

window.useMqttPublish = function () {
    return function (topic, payload) {
        if (busClient && busClient.connected) {
            publishState(topic, payload);
            return;
        }
        // Said out loud rather than swallowed: on a bench with no broker this
        // is the only sign a publish went nowhere.
        console.log('[sampler] publish (no bus):', topic, payload);
    };
};
