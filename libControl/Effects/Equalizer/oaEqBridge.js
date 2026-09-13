// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

// The console end of the SPOG bridge — where a strip's EQ trim lands.
//
// WHAT THIS OWNS: one subscription, `APK.audio/Gui/DrumKit/+/eq/+`, and the
// hop from a message on it to `oaSetEq`. Nothing else.
//
// WHAT IT MUST NOT DO:
//   * Convert anything. The value that arrives is ALREADY IN DECIBELS — the
//     orchestrator's translator did the trim conversion, from the same
//     `oaEqFromTrim` statement this folder holds, before it republished. A
//     second conversion here would be the drift that function exists to
//     prevent. See spog_bridge.rs and PLAN-18.12.
//   * Publish. This is the receiving end of a one-way bridge. `oaSetEq`
//     persists to localStorage and dispatches `oa-eq-changed`; it does not
//     touch the bus, so a console write cannot echo back at the console.
//   * Do anything at all where there is no broker. `oaBusSubscribe` registers a
//     filter and the client is only ever dialled on a local origin, so on the
//     published site this module registers one callback that is never called.
//
// The pad a strip maps to is decided in the orchestrator's `spog_bridge.json`,
// not here: the topic already carries the pad index, so adding a strip stays a
// data-file edit at the one end that knows about consoles.

(function () {
    /** The three named bands a SPOG strip can reach, by the topic segment. */
    const BANDS = { hiGain: true, midGain: true, loGain: true };

    /** `APK.audio/Gui/DrumKit/<pad>/eq/<key>` → `{ pad, key }`, or null. */
    function parse(topic) {
        const parts = String(topic || '').split('/');
        // APK.audio / Gui / DrumKit / <pad> / eq / <key>
        if (parts.length !== 6 || parts[4] !== 'eq') return null;
        const pad = Number(parts[3]);
        if (!isFinite(pad) || pad < 0 || pad >= window.OA_PAD_MAX) return null;
        if (!BANDS[parts[5]]) return null;
        return { pad: pad, key: parts[5] };
    }

    window.oaEqBridgeApply = function (topic, message) {
        const where = parse(topic);
        if (!where) return false;
        // The wire shape `useMqttState` stores: `{value: …}`. A bare number is
        // accepted too, because a hand-published test message is usually one.
        // `null` is neither — and it must be refused rather than coerced, since
        // `Number(null)` is 0 and 0 dB is a legitimate write. A payload the
        // bridge cannot read has to look different from one asking for flat.
        const raw = (message && typeof message === 'object') ? message.value : message;
        if (typeof raw !== 'number' && typeof raw !== 'string') return false;
        const decibels = Number(raw);
        if (!isFinite(decibels)) return false;
        window.oaSetEq(where.pad, where.key, decibels);
        return true;
    };

    window.oaEqBridgeStart = function () {
        if (!window.oaBusSubscribe) return null;
        return window.oaBusSubscribe('APK.audio/Gui/DrumKit/+/eq/+', window.oaEqBridgeApply);
    };

    window.oaEqBridgeStart();
})();
