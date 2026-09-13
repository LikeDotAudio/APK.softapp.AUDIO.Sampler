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
 * Header: UiKeyCap.jsx
 * Purpose: Every pressable cap in the rack, in one place.
 * Description: Three panels had three implementations of the same object: the
 *   remote's `Key`, the width box's `DimButton` and the limiter's
 *   `PushButton`. All three are a moulded cap that goes DOWN when it is engaged
 *   rather than changing colour — which is the whole reason they read as
 *   switches instead of as web buttons — and all three drew it with the same
 *   four tricks:
 *
 *     a light-to-dark gradient down the face, so the cap has a top and a bottom;
 *     a hard 2px shadow beneath it, which is the cap standing off the panel;
 *     `translateY` plus an INSET shadow when pressed, which is it sitting in its
 *     well with the panel shading it;
 *     a transition short enough (60ms) to feel mechanical rather than animated.
 *
 *   Keeping three copies meant three slightly different travel distances and two
 *   different ivories. One component, three TONES.
 */

/**
 * `tone` is the material, not the state:
 *
 *   cream   ivory plastic — the remote's keypad and the width-box buttons
 *   blue    the machine-select caps, which are blue on the original
 *   panel    aluminium-white, for a plate that is already painted (the limiter)
 *   red     the bypass cap, which is red everywhere it appears
 *
 * `lit` is the state: down in its well, engaged.
 */
window.UiKeyCap = ({
    label, lit, tone = 'cream', size = 7.5, width, height, wide,
    title, onClick, onDown, onUp, style,
}) => {
    const T = window.OA_UI;

    const FACE = {
        cream: { up: T.CREAM,   down: '#c9c2ac', text: '#2f2a1e', edge: T.KEY_EDGE },
        blue:  { up: '#8fb0d0', down: '#5b7fa8', text: '#2f2a1e', edge: T.KEY_EDGE },
        panel: { up: '#f4f1e8', down: '#d8d2c4', text: T.INK,     edge: T.INK },
        red:   { up: '#e8402c', down: '#7a2418', text: '#fff',    edge: '#000' },
    }[tone] || {};

    const face = lit ? FACE.down : FACE.up;

    return (
        <button
            onClick={onClick}
            onPointerDown={onDown}
            onPointerUp={onUp}
            // A pointer that leaves the cap while held still has to release it,
            // or a momentary control (MUTE) latches on because the up never came.
            onPointerLeave={onUp ? (e) => { if (e.buttons) onUp(e); } : undefined}
            title={title}
            style={{
                flex: wide ? 1 : '0 0 auto',
                width: width ? `${width}px` : undefined,
                height: height ? `${height}px` : undefined,
                minWidth: 0, padding: height ? 0 : '4px 2px',
                borderRadius: '2px', cursor: 'pointer',
                background: lit
                    ? `linear-gradient(to bottom, ${face} 0%, ${face} 60%, #00000055 100%)`
                    : `linear-gradient(to bottom, #fbf7ea 0%, ${face} 55%, #b8b19a 100%)`,
                border: `1px solid ${FACE.edge}`,
                boxShadow: lit
                    ? 'inset 0 2px 4px rgba(0,0,0,0.45)'
                    : `0 1px 0 ${FACE.edge}, 0 2px 3px rgba(0,0,0,0.35)`,
                transform: lit ? 'translateY(1px)' : 'none',
                color: FACE.text, fontSize: `${size}px`, fontWeight: '700',
                fontFamily: T.SANS, letterSpacing: '.2px', lineHeight: 1.15,
                transition: 'transform .05s, box-shadow .05s',
                ...style
            }}
        >
            {label}
        </button>
    );
};

/**
 * The round lamp-switch: a lit dome rather than a cap. Used for IN/BYPASS, where
 * the control and the indicator are the same object — which is how the hardware
 * does it and why there is no separate lamp beside it.
 */
window.UiLampButton = ({ on, title, onClick, size = 30, hue = '#ff9a2e' }) => (
    <button
        onClick={onClick}
        title={title}
        style={{
            width: `${size}px`, height: `${size}px`, borderRadius: '50%', cursor: 'pointer',
            border: '2px solid #2a1405', padding: 0,
            background: on
                ? `radial-gradient(circle at 38% 30%, #fff0c8, ${hue} 45%, #c85a05 100%)`
                : 'radial-gradient(circle at 38% 30%, #6b6357, #3a3128 60%, #241d16 100%)',
            boxShadow: on
                ? `0 0 12px rgba(255,150,40,0.75), inset 0 1px 2px rgba(255,255,255,0.5)`
                : 'inset 0 2px 4px rgba(0,0,0,0.6)',
        }}
    />
);

/** The small round tell-tale beside a control. Not pressable. */
window.UiLamp = ({ on, size = 7, hue = '#ff3b2f' }) => (
    <span style={{
        width: `${size}px`, height: `${size}px`, borderRadius: '50%', display: 'inline-block',
        background: on ? hue : '#3a1a16',
        boxShadow: on ? `0 0 6px ${hue}` : 'inset 0 1px 2px #000',
    }} />
);
