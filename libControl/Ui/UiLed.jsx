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
 * Header: UiLed.jsx
 * Purpose: Lit segments, and the dark filter they sit behind.
 * Description: An LED readout is not coloured text. What makes it read as a lamp
 *   is the BLOOM, and the bloom is two shadows on purpose:
 *
 *     a tight bright one, which is the segment itself;
 *     a wide dim one, which is the light spilling into the filter around it.
 *
 *   A single blur gives you a fuzzy letter instead — the halo has to be much
 *   wider than the glyph to look like glow rather than like something out of
 *   focus. That is the one detail worth keeping in a shared component, because
 *   it is the detail everyone reimplements slightly wrong.
 */

/**
 * A run of segments. `dim` is a half-driven segment — it still EMITS, faintly,
 * because killing the glow entirely makes it read as printed ink rather than as
 * a dimmer light, and the display uses dimming to mean "not committed yet".
 */
window.UiLed = ({ children, size = 11, dim = false, glow = true, style }) => {
    const T = window.OA_UI;
    return (
        <span style={{
            fontFamily: T.MONO, fontSize: `${size}px`, fontWeight: '700',
            color: dim ? T.LED_DIM : T.LED,
            textShadow: !glow ? 'none'
                : dim
                    ? '0 0 4px rgba(var(--accent-rgb),0.32)'
                    : '0 0 5px rgba(var(--accent-rgb),0.95), 0 0 13px rgba(var(--accent-rgb),0.55), 0 0 26px rgba(var(--accent-rgb),0.28)',
            letterSpacing: '.5px', whiteSpace: 'pre', ...style
        }}>{children}</span>
    );
};

/**
 * A backlit character window — the small green/amber strip a tape machine puts a
 * number in. Distinct from UiLed: this one has a LIT BACKGROUND with dark text
 * over it, which is a different kind of display and a different era of panel.
 */
window.UiScreen = ({ label, text, width, style }) => (
    <div style={{
        background: 'linear-gradient(to bottom, #1b2417 0%, #0e1410 100%)',
        border: '1px solid #000', borderRadius: '2px',
        boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.8)',
        padding: '3px 6px', minWidth: width ? `${width}px` : undefined,
        display: 'flex', flexDirection: 'column', gap: '1px', ...style
    }}>
        {label && (
            <span style={{ fontSize: '7px', color: '#7f8a76', letterSpacing: '1.2px' }}>{label}</span>
        )}
        <span style={{
            fontSize: '8px', color: '#eef2e2', letterSpacing: '1.6px',
            textShadow: '0 1px 1px #0007', fontFamily: window.OA_UI.MONO,
        }}>{text}</span>
    </div>
);

/**
 * A word engraved into a painted faceplate: dark ink with a hairline highlight
 * under it, which is how a cut letter catches the light. The highlight is what
 * separates "engraved" from "printed" — without it the label sits ON the panel
 * rather than IN it.
 */
window.UiEngraved = ({ children, size = 8, style }) => {
    const T = window.OA_UI;
    return (
        <div style={{
            fontSize: `${size}px`, fontWeight: '700', letterSpacing: '1.4px', color: T.INK,
            textShadow: `0 1px 0 ${T.INK_LIT}`, ...style
        }}>
            {children}
        </div>
    );
};
