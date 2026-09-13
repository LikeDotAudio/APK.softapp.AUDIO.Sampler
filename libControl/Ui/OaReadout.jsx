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
 * Header: OaReadout.jsx
 * Purpose: The big value overlay that stands beside a control while it is moving.
 * Description: The sequencer grid has had one of these from the start — hold a
 *   step and a large VELOCITY column appears next to your finger. It exists
 *   because on a phone the thing being adjusted is underneath the hand adjusting
 *   it, and an 8px number engraved under a knob is unreadable at the moment it
 *   matters most. Every other control on the desk had the same problem and none
 *   of them said anything.
 *
 *   So the sequencer's overlay is generalised here and every control shares it.
 *   A control calls useOaReadout() with what it would like shown and reports the
 *   pointer once, at the start of the drag; the hook watches the window for the
 *   rest. That last part is the important one — the release is caught on the
 *   window in the capture phase, so however a control handles pointer capture,
 *   and wherever the finger ends up when it lifts, the overlay cannot be left
 *   stranded on screen.
 *
 *   ONE overlay exists, not one per control: the value lives in a module
 *   variable and the component subscribes to it, so a knob mid-drag can push a
 *   new reading without owning the thing that draws it.
 */

let CURRENT = null;
const SUBS = new Set();
const publish = () => { SUBS.forEach((fn) => fn(CURRENT)); };

/**
 * Show/replace the reading. `info` is { label, display, pct, color, bipolar, box },
 * where `box` is the on-screen rectangle of the control being turned — the
 * reading is placed against that, not against the pointer.
 */
window.oaReadoutShow = function (info) { CURRENT = info; publish(); };

/**
 * Take it down. Safe to call when nothing is up. Pass the `owner` a control was
 * publishing under and the reading only comes down if it is still that control's
 * — a knob unmounting somewhere else on the page (a strip re-keyed, a panel
 * closed) must not pull the reading out from under the finger that is dragging.
 */
window.oaReadoutHide = function (owner) {
    if (!CURRENT) return;
    if (owner && CURRENT.owner !== owner) return;
    CURRENT = null;
    publish();
};

/**
 * Attach a readout to one control.
 *
 * `info` is re-read on every render, so a control that redraws as its value
 * changes — which is all of them — updates the overlay for free. All a control
 * has to do is call begin() when its drag starts.
 */
window.useOaReadout = function (info) {
    // Where the control being turned is, not where the finger is. The overlay
    // stands beside the CONTROL: it is the knob's own value written large, and
    // a panel that slides around under a moving finger is harder to read than
    // the 8px number it was standing in for.
    const [at, setAt] = React.useState(null);
    // This control's identity, so it can only ever take down its own reading.
    const me = React.useRef({});
    // The drag is over the moment the pointer comes up — before React has
    // re-rendered anything. A browser can still deliver a trailing pointermove
    // after the release, and without this flag that stray event would put the
    // overlay straight back up a frame after it was told to go.
    const live = React.useRef(false);

    const stop = React.useCallback(() => {
        live.current = false;
        setAt(null);
        window.oaReadoutHide(me);
    }, []);

    // No dependency array on purpose. While a drag is live the value changes on
    // every render and the overlay has to follow it; the rest of the time `at`
    // is null and this does nothing.
    React.useEffect(() => {
        if (at && live.current) window.oaReadoutShow({ ...info, owner: me, box: at });
    });

    React.useEffect(() => {
        if (!at) return undefined;
        // Capture phase, on the window: a control that captured the pointer
        // delivers its own pointerup to itself, and one that did not may see the
        // release land on some other element entirely. Listening here catches
        // both, which is what keeps the overlay from sticking.
        window.addEventListener('pointerup', stop, true);
        window.addEventListener('pointercancel', stop, true);
        return () => {
            window.removeEventListener('pointerup', stop, true);
            window.removeEventListener('pointercancel', stop, true);
        };
    }, [!!at, stop]);

    // A panel closed under the finger would otherwise leave its reading up.
    React.useEffect(() => () => window.oaReadoutHide(me), []);

    return {
        begin: (e) => {
            // currentTarget is the control the gesture was hung on — the knob's
            // svg, the fader's slot, the wheel's track — which is the box the
            // reading should sit beside.
            const el = e.currentTarget || e.target;
            const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            live.current = true;
            setAt(r && r.width
                ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
                : { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
        },
        end: stop,
    };
};

/**
 * The overlay itself. Mounted once, by App — it is one panel for the whole desk,
 * not one per control.
 */
window.OaReadout = () => {
    const [info, setInfo] = React.useState(CURRENT);
    React.useEffect(() => {
        SUBS.add(setInfo);
        setInfo(CURRENT);
        return () => { SUBS.delete(setInfo); };
    }, []);

    if (!info) return null;

    const pct = Math.max(0, Math.min(100, Number(info.pct) || 0));
    const color = info.color || 'var(--accent)';
    // A bipolar control fills from the centre out, the way a pan pot's own arc
    // does. Filling from the bottom would say "hard left is empty".
    const fill = info.bipolar
        ? { bottom: `${Math.min(50, pct)}%`, height: `${Math.abs(pct - 50)}%` }
        : { bottom: 0, height: `${pct}%` };

    // Beside the CONTROL, on its left, level with its middle — clear of the hand
    // reaching for it, which comes in from the right on a mouse and covers
    // everything below on a phone. Against the left edge of the screen there is
    // nowhere to put it, so it goes to the control's right instead.
    const W = 108, H = 272, GAP = 12;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const box = info.box || { left: 0, right: 0, top: 0, bottom: 0 };
    let left = box.left - W - GAP;
    if (left < 8) left = Math.min(box.right + GAP, vw - W - 8);
    const top = Math.min(Math.max((box.top + box.bottom) / 2 - H / 2, 8), Math.max(8, vh - H - 8));

    const panel = (
        <div style={{
            position: 'fixed', zIndex: 10000, pointerEvents: 'none',
            left: `${Math.max(8, left)}px`, top: `${top}px`,
            width: `${W}px`, boxSizing: 'border-box',
            background: '#1c1c1c', border: '1px solid var(--accent)', borderRadius: '6px',
            padding: '10px', boxShadow: '0 8px 30px rgba(0,0,0,0.75)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
        }}>
            <div style={{
                fontSize: '18px', fontWeight: 'bold', color, lineHeight: 1.1,
                whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
                {info.display}
            </div>
            <div style={{
                position: 'relative', width: '30px', height: '200px', background: '#0a0a0a',
                border: '1px solid #444', borderRadius: '3px', overflow: 'hidden'
            }}>
                <div style={{
                    position: 'absolute', left: 0, right: 0, ...fill,
                    background: `linear-gradient(to top, color-mix(in srgb, ${color} 55%, #000), ${color})`
                }} />
                <div style={{
                    position: 'absolute', left: '-2px', right: '-2px',
                    bottom: `calc(${pct}% - 2px)`, height: '4px', background: '#fff', borderRadius: '1px'
                }} />
            </div>
            {info.label ? (
                <div style={{
                    fontSize: '9px', color: '#888', letterSpacing: '0.5px',
                    textAlign: 'center', lineHeight: 1.25
                }}>
                    {String(info.label).toUpperCase()}
                </div>
            ) : null}
        </div>
    );

    // Portalled to <body>: several panels that carry knobs are themselves
    // transformed (translateX(-50%) to centre them), and a fixed child inside a
    // transformed ancestor is positioned against THAT box rather than the
    // viewport — the overlay would land somewhere near the panel instead of
    // near the finger.
    return ReactDOM.createPortal(panel, document.body);
};
