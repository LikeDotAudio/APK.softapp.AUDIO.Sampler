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
 * Header: OaPanelFrame.jsx
 * Purpose: Effect panels that float, stack, and pop out into their own window.
 * Description: Every editor in the rack was pinned to the same spot — fixed to
 *   the bottom of the page, centred. Open two and the second lands on top of the
 *   first, which is fine until you want to watch a compressor's needle while you
 *   turn a reverb's knobs. A rack is a thing you arrange.
 *
 *   So a panel now does three things it did not:
 *
 *     it MOVES        — drag it by its title bar, anywhere on the page;
 *     it STACKS       — touch a panel and it comes to the front of the pile;
 *     it POPS OUT     — into a real browser window, alongside the app.
 *
 *   POP OUT is a second React root in the new window, not a portal into it.
 *   That is not a preference: React 18 attaches its event listeners to the root
 *   container, and a container in another document never sees them — every knob
 *   in a portalled panel would draw correctly and refuse to turn. A second root
 *   costs a second copy of the panel's own view state (which help text is open),
 *   and nothing else: both copies read the same plugin through useOaState, so
 *   they show the same settings and either one can change them.
 */

// Every panel opens above the last one touched. A counter rather than a sort:
// the only question ever asked is "which is on top", and the answer is always
// "whichever asked most recently".
let TOP_Z = 1200;

// The popup windows open right now, by panel id. The copy INSIDE a popup cannot
// close its own window on its own — the window belongs to the instance that
// opened it, back in the main page — so it asks through here.
const POPUPS = new Map();

/** Put a popped-out panel back in the page. Called from inside the popup. */
window.oaPopIn = function (id) {
    const w = POPUPS.get(id);
    if (w && !w.closed) w.close();      // the owner is watching for this
};

const POS_KEY = (id) => `oaPanelPos:${id}`;

// Where a panel was left, for as long as the tab lives. sessionStorage rather
// than local: a position is a fact about this sitting at this screen size, and
// coming back tomorrow to a panel parked off the edge of a smaller monitor is
// not a feature.
const restorePos = (id) => {
    try {
        const raw = window.sessionStorage.getItem(POS_KEY(id));
        const p = raw ? JSON.parse(raw) : null;
        return p && typeof p.x === 'number' && typeof p.y === 'number' ? p : null;
    } catch (e) { return null; }
};
const rememberPos = (id, p) => {
    try { window.sessionStorage.setItem(POS_KEY(id), JSON.stringify(p)); } catch (e) {}
};

// Keep a hand-hold on screen. A panel dragged mostly off the left edge is fine —
// that is how you park one — but a panel with no title bar left to grab is lost.
const clampPos = (x, y, w) => {
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    return {
        x: Math.max(90 - (w || 240), Math.min(x, vw - 90)),
        y: Math.max(0, Math.min(y, vh - 36)),
    };
};

/**
 * Give the popup the page's stylesheets. Everything in this app is styled from
 * the custom properties declared on :root, so without these the panel comes up
 * as unstyled boxes — and the accent the Config picker set lives in an INLINE
 * style on <html>, which is not a stylesheet and has to be carried separately.
 */
const dressWindow = (doc) => {
    doc.head.querySelectorAll('[data-oa-style]').forEach((n) => n.remove());
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
        const clone = node.cloneNode(true);
        clone.setAttribute('data-oa-style', '');
        doc.head.appendChild(clone);
    });
    doc.documentElement.setAttribute('style', document.documentElement.getAttribute('style') || '');
};

/**
 * The frame around one panel.
 *
 *   id      what to file this panel's position under; unique per open panel
 *   title   what the popped-out window is called
 *   copy    true when THIS instance is the one drawn inside the popup
 *   hosted  true when the surface around this panel already carries a title bar
 *           and a way to close it — a shell display, or the Mixer's modal. See
 *           `chrome` below.
 *   render  how to draw the popped-out copy — the same component again, with
 *           its `oaPopped` prop set, which is what stops it popping itself out
 *
 * Returns the props to hang on the panel's outer box and its title bar, plus
 * the state and handler its POP OUT button needs.
 */
window.useOaPanel = function (opts) {
    const id = opts.id;
    const isCopy = !!opts.copy;
    const hosted = !!opts.hosted;

    const nodeRef = React.useRef(null);
    const [pos, setPos] = React.useState(() => (isCopy ? null : restorePos(id)));
    const [z, setZ] = React.useState(() => (TOP_Z += 1));
    const [popped, setPopped] = React.useState(false);

    const winRef = React.useRef(null);
    const rootRef = React.useRef(null);

    // Torn down by hand rather than by an effect's cleanup: this also runs from
    // the interval below, when it is the USER who closed the window.
    const closePop = React.useCallback(() => {
        const w = winRef.current;
        const root = rootRef.current;
        winRef.current = null;
        rootRef.current = null;
        POPUPS.delete(id);
        if (root) { try { root.unmount(); } catch (e) {} }
        if (w && !w.closed) { try { w.close(); } catch (e) {} }
        setPopped(false);
    }, [id]);

    const openPop = () => {
        const node = nodeRef.current;
        const r = node && node.getBoundingClientRect
            ? node.getBoundingClientRect()
            : { width: 760, height: 460 };
        const w = window.open(
            '', `oa_${String(id).replace(/\W/g, '_')}`,
            `popup=yes,width=${Math.round(r.width) + 34},height=${Math.round(r.height) + 60}`
        );
        // Blocked, almost always by a pop-up blocker. Say so — a button that
        // does nothing at all reads as broken rather than as refused.
        if (!w) {
            window.alert('The browser blocked the pop-out window.\n\nAllow pop-ups for this site and try again.');
            return;
        }

        // A fresh document rather than whatever about:blank left behind, so a
        // second pop-out of the same panel starts clean.
        const doc = w.document;
        doc.open();
        doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
        doc.close();
        doc.title = opts.title || 'Sampler.Like.Audio';
        dressWindow(doc);
        // The copied stylesheet carries the APP's body rule with it — a flex
        // column, 100dvh tall, overflow hidden. That is right for a page that
        // owns the viewport and wrong for a window holding one panel: it would
        // clip the panel at the fold with no way to scroll to the rest. Inline
        // styles beat a stylesheet, so put the body back to a plain document.
        doc.body.style.margin = '0';
        doc.body.style.padding = '0';
        doc.body.style.display = 'block';
        doc.body.style.height = 'auto';
        doc.body.style.overflow = 'auto';
        doc.body.style.background = 'var(--bg)';

        const mount = doc.createElement('div');
        doc.body.appendChild(mount);

        const root = ReactDOM.createRoot(mount);
        root.render(opts.render());
        winRef.current = w;
        rootRef.current = root;
        POPUPS.set(id, w);
        setPopped(true);
    };

    // Props change in the page — a track renamed, a tempo moved — and the copy
    // in the window is a separate tree that would never hear about it. No
    // dependency array: re-render it whenever this one renders.
    React.useEffect(() => {
        if (rootRef.current && opts.render) rootRef.current.render(opts.render());
    });

    // The window can be closed from its own title bar, which fires nothing here.
    React.useEffect(() => {
        if (!popped) return undefined;
        const tick = window.setInterval(() => {
            const w = winRef.current;
            if (!w || w.closed) closePop();
        }, 400);
        // A popped-out panel is part of this page's session, not a bookmark.
        const shut = () => { const w = winRef.current; if (w && !w.closed) { try { w.close(); } catch (e) {} } };
        window.addEventListener('beforeunload', shut);
        return () => { window.clearInterval(tick); window.removeEventListener('beforeunload', shut); };
    }, [popped, closePop]);

    // The accent lives in an inline style on <html>, so a theme change in the
    // page has to be walked over to the window by hand.
    React.useEffect(() => {
        if (!popped || !window.oaOnAccent) return undefined;
        return window.oaOnAccent(() => {
            const w = winRef.current;
            if (w && !w.closed) {
                w.document.documentElement.setAttribute('style', document.documentElement.getAttribute('style') || '');
            }
        });
    }, [popped]);

    // The panel closed while it was popped out: take the window with it.
    React.useEffect(() => () => {
        const w = winRef.current;
        const root = rootRef.current;
        winRef.current = null;
        rootRef.current = null;
        POPUPS.delete(id);
        if (root) { try { root.unmount(); } catch (e) {} }
        if (w && !w.closed) { try { w.close(); } catch (e) {} }
    }, []);

    // A panel parked near the right edge is off the page after the window
    // narrows; drag it back rather than losing it.
    React.useEffect(() => {
        if (isCopy || !pos) return undefined;
        const onResize = () => setPos((p) => (p ? clampPos(p.x, p.y, 240) : p));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [isCopy, !!pos]);

    const toFront = () => { if (!isCopy && z !== TOP_Z) setZ(TOP_Z += 1); };

    const onHandleDown = (e) => {
        if (isCopy) return;
        // A title bar carries buttons. Pressing one is a press, not a drag.
        if (e.target && e.target.closest && e.target.closest('button, select, input, textarea, a')) return;
        const node = nodeRef.current;
        if (!node) return;
        const r = node.getBoundingClientRect();
        const dx = e.clientX - r.left;
        const dy = e.clientY - r.top;
        const el = e.currentTarget;
        let last = clampPos(r.left, r.top, r.width);
        try { el.setPointerCapture(e.pointerId); } catch (x) {}
        const move = (em) => {
            last = clampPos(em.clientX - dx, em.clientY - dy, r.width);
            setPos(last);
        };
        const up = (eu) => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            try { el.releasePointerCapture(eu.pointerId); } catch (x) {}
            rememberPos(id, last);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        e.preventDefault();
    };

    // Inside the window the panel is the whole page: no fixed corner to sit in,
    // no shadow to lift it off a background it no longer has, and the window's
    // own scrollbar instead of the panel's.
    //
    // THE WHOLE PAGE IS NOT THE WHOLE WIDTH. A faceplate declares the width the
    // box it draws actually is — `min(340px, 96vw)` on the VARC, because the
    // real remote is a tall thing you hold in one hand, not a wide thing you
    // set down — and `width: 100%` in a host 1900px across pulled every one of
    // them apart: six travel faders a hand's span from each other, a keypad the
    // width of a desk, and two rotary heads at opposite ends of a tape echo.
    // So the declared width becomes the CAP and the panel centres under it. A
    // wider host now gives the panel room rather than stretching it, and a
    // narrower one still gets the 100% that made this branch exist.
    const copyStyle = (style) => ({
        position: 'static', left: 'auto', right: 'auto', top: 'auto', bottom: 'auto',
        transform: 'none', margin: '0 auto',
        width: '100%', maxWidth: (style && style.width) || 'none', maxHeight: 'none',
        border: 'none', borderRadius: 0, boxShadow: 'none', zIndex: 'auto',
        overflowY: 'visible', boxSizing: 'border-box',
    });

    const frameStyle = {
        zIndex: z,
        ...(pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto', transform: 'none' } : null),
    };

    const popLabel = isCopy || popped ? '⧉ Pop In' : '⧉ Pop Out';

    return {
        popped, isCopy, popLabel,

        /* WHETHER THIS PANEL DRAWS ITS OWN WINDOW BUTTONS — pop out, and close.
           False when something else already owns the window: APK:OS mounts these
           faceplates into a display with its own tab and its own ✕, and into the
           Mixer's modal with its own ✕, so the panel was drawing a second close
           beside the host's and a ⧉ Pop In whose handler closes a browser window
           this panel never opened.

           NOT the same question as `isCopy`. The copy inside a real popped-out
           window is hosted by nothing — ⧉ Pop In is the only way back to the
           page from there, and it works. */
        chrome: !hosted,

        popTitle: isCopy || popped
            ? 'Put this panel back in the page'
            : 'Open this panel in its own window, alongside the app',
        togglePop: () => {
            if (isCopy) { window.oaPopIn(id); return; }
            if (popped) closePop(); else openPop();
        },

        /** Spread onto the panel's outer box, passing its own style through. */
        frameProps: (style) => ({
            ref: nodeRef,
            style: isCopy ? { ...style, ...copyStyle(style) } : { ...style, ...frameStyle },
            onPointerDown: toFront,
        }),

        /** Spread onto the panel's title bar, passing its own style through. */
        handle: (style) => ({
            style: isCopy ? style : { ...style, cursor: 'move', touchAction: 'none', userSelect: 'none' },
            onPointerDown: onHandleDown,
        }),

        /**
         * Wrap the panel's whole tree. While it is popped out, the page keeps a
         * marker where the panel was — an open effect that draws nothing at all
         * looks like an effect that failed to open.
         */
        frame: (node) => {
            if (isCopy || !popped) return node;
            return (
                <div
                    ref={nodeRef}
                    onPointerDown={toFront}
                    style={{
                        position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
                        background: 'var(--panel)', border: '1px solid #444', borderRadius: '8px',
                        boxShadow: '0 -4px 24px rgba(0,0,0,0.7)',
                        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px',
                        ...frameStyle,
                    }}
                >
                    <span
                        onPointerDown={onHandleDown}
                        style={{
                            fontSize: '11px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px',
                            cursor: 'move', touchAction: 'none', userSelect: 'none',
                        }}
                    >
                        {opts.title}
                    </span>
                    <span style={{ fontSize: '10px', color: '#8a9099', fontStyle: 'italic' }}>in its own window</span>
                    <window.SeqButton label="⧉ Pop In" onClick={closePop} style={{ padding: '4px 10px' }} />
                </div>
            );
        },
    };
};
