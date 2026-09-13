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
 * Header: UiPanel.jsx
 * Purpose: The floating shell every editor is drawn inside.
 * Description: Six panels open over the mixer, and all six were repeating the
 *   same eleven lines: fixed to the bottom centre, translated back by half its
 *   own width, panel background, one-pixel border, the big soft drop shadow, a
 *   z-index above the strips, and a header row with a coloured title on the left
 *   and a close button pushed to the right.
 *
 *   Repeating it meant they drifted — two different z-indexes, three different
 *   corner radii, one panel whose title was 11px while the rest were 12. None of
 *   that is visible one panel at a time; all of it is visible when you open two.
 *
 *   So the shell is one component and a panel supplies only what is actually its
 *   own: how wide it is, what it is called, and what goes inside.
 */

/**
 * `title` is the coloured name on the left; `tint` is the unit's colour, so a
 * delay's panel is headed in that delay's colour exactly as its strip is.
 * `sub` is the small grey note beside it. Anything in `actions` sits between the
 * title and the close button.
 */
window.UiPanel = ({ title, tint, sub, width = 420, actions, onClose, children, style }) => {
    const T = window.OA_UI;
    return (
        <div style={{
            position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
            background: T.PANEL_BG, border: `1px solid ${T.PANEL_EDGE}`, borderRadius: '8px',
            boxShadow: T.PANEL_SHADOW, zIndex: 1200,
            padding: '14px 16px', width: `min(${width}px, 92vw)`,
            maxHeight: '88vh', overflowY: 'auto',
            ...style
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: tint, fontWeight: 'bold', letterSpacing: '1px' }}>
                    {title}
                </span>
                {sub && <span style={{ fontSize: '9px', color: '#666' }}>{sub}</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {actions}
                    {onClose && (
                        <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />
                    )}
                </div>
            </div>
            {children}
        </div>
    );
};

/**
 * The faceplate a panel's controls are screwed to. `finish` picks the material:
 *
 *   'paint'    a painted rack plate, top-lit — the compressor and the pedal
 *   'brushed'  dark brushed metal — the width box
 *   'glass'    an LED display window
 *
 * A panel that wants something else entirely (tolex, a tape lid) passes its own
 * style through and skips this, which is the point of keeping it a component
 * rather than a rule.
 */
window.UiPlate = ({ finish = 'paint', children, style }) => {
    const T = window.OA_UI;
    const FINISH = {
        paint: {
            background: T.PLATE,
            border: '1px solid #000', borderRadius: '4px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 2px 6px rgba(0,0,0,0.5)',
        },
        brushed: {
            background: 'linear-gradient(to bottom, #24262a 0%, #17181b 100%)',
            border: '1px solid #000', borderRadius: '4px',
            boxShadow: 'inset 0 1px 0 #ffffff12',
        },
        glass: T.GLASS,
    };
    return (
        <div style={{ padding: '12px 14px 10px', ...FINISH[finish], ...style }}>
            {children}
        </div>
    );
};
