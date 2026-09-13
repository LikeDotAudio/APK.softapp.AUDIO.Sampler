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
// for nothing, because there is no broker on that host to find. So the dial is
// attempted only where a broker plausibly is: a local origin, or an explicit
// override somebody set on purpose. See `oaBusUrl`.

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
// Where the broker is, and whether to look for one at all.
//
// `ws://<page host>:9001` is the same answer `OS.brokerUrl()` seeds with in the
// shell — 9001 is mosquitto's websocket listener on this bench — so the sampler
// and the shell come up on the same broker without being told about each other.
// A stored override wins, which is how a bench with the broker on another box
// says so without a rebuild.
// AM I ON A BENCH? One answer, in one place. The broker is not the only thing
// this page has that the published site does not: `useSoundBrowseState.js`
// lists two demo songs the upload set deliberately drops (PLAN-387.01), and
// the question it has to ask — is this origin a bench, or is it apk.audio? —
// is the same question. This used to be four lines inside `oaBusUrl` and a
// second copy was the obvious next move; a predicate two files disagree about
// is how one surface hides a thing the other still offers.
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

window.oaBusUrl = function () {
    try {
        const override = localStorage.getItem('oa_bus_url');
        if (override) return override;
    } catch (e) { /* private mode: no override, not an error */ }

    // Answering "nowhere" off a bench is correct rather than defensive — the
    // same answer the published site gets, reached one step earlier.
    if (!window.oaIsLocalOrigin()) return null;

    const where = window.location;
    const host = where.hostname;
    const scheme = where.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${host || '127.0.0.1'}:9001`;
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

// mqtt.js is fetched only when there is somewhere to connect to, and that is
// the point rather than an optimisation. It is 330 KB — larger than this app's
// entire compiled bundle — and the published site has no broker to spend it on.
// A static <script> tag would put it in every visitor's precache to enable a
// connection that can never succeed there. So it is pulled on a local origin
// and nowhere else, which also keeps it out of `dist/precache.json`.
function withMqttLib(then) {
    if (window.mqtt) return then();
    const tag = document.createElement('script');
    tag.src = './vendor/mqtt.min.js';
    tag.onload = () => then();
    tag.onerror = () => console.warn('[sampler] no mqtt client — bus stays local');
    document.head.appendChild(tag);
}

window.oaConnectBus = function () {
    const url = window.oaBusUrl();
    if (!url) return null; // not a bench — the local store is the whole story

    withMqttLib(() => {
        if (!window.mqtt) return;
        try {
            busClient = window.mqtt.connect(url, { reconnectPeriod: 5000 });
        } catch (e) {
            console.warn('[sampler] no bus —', e);
            return;
        }

        busClient.on('connect', () => {
            console.log('[sampler] bus up —', url);
            // Everything already on screen, now that there is somewhere to say it.
            for (const topic of Object.keys(globalStore)) subscribeOnce(topic);
            // And every filter a non-React module asked for before the dial.
            for (const sub of rawSubscriptions) subscribeOnce(sub.filter);
        });
        busClient.on('message', (topic, payload) => applyInbound(topic, payload.toString()));
        busClient.on('error', (err) => console.warn('[sampler] bus error —', err.message));

        window.oaBusClient = busClient;
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
