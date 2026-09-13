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
 * Header: oaUiTokens.js
 * Purpose: The materials every panel in the app is built out of.
 * Description: This rack is drawn, not photographed, and the thing that makes a
 *   drawn panel read as HARDWARE is consistency of material: the same paint
 *   catching light from the same direction, the same ink cut to the same depth,
 *   the same glass over every lamp. When each panel carried its own copy of
 *   those values they drifted — three different "engraved" greys, two different
 *   glass gradients, a keycap that was ivory on one box and bone on another.
 *
 *   So the materials live here, once, and every component in libControl/Ui reads
 *   them. A panel picks components; a component picks materials; nothing picks a
 *   raw colour twice.
 *
 *   EVERYTHING IS DERIVED FROM --accent. Config's colour picker rewrites that one
 *   custom property at runtime and the whole rack repaints with it, so a blue
 *   theme does not leave an orange compressor sitting in the middle of it. Only
 *   the parts that are NOT paint keep their own colour: black knobs, aluminium
 *   caps, steel screws, ivory keycaps and the amber meter lamp, which is a light
 *   behind glass rather than a panel finish and has to stay legible under any
 *   hue the plate ends up.
 *
 *   Plain JS, no React: these are values, and a component file is where they
 *   become elements.
 */

window.OA_UI = {
    // ---- painted rack panel -------------------------------------------------
    // Top-lit, the way a painted plate sits under a rack light: brightest along
    // the top edge, falling away to the bottom rail.
    PAINT: 'var(--accent-s25)',
    PLATE: 'linear-gradient(to bottom, var(--accent-s15) 0%, var(--accent-s25) 16%,'
         + ' var(--accent-s40) 60%, var(--accent-s55) 100%)',
    /** Engraved letters, cut into the paint. */
    INK: 'var(--accent-s85)',
    /** The hairline of light under a cut letter — the paint's own tint, thinned. */
    INK_LIT: 'color-mix(in srgb, var(--accent-t40) 35%, transparent)',

    // ---- LED display --------------------------------------------------------
    // Properly black: these are segments behind a dark filter, not a backlit
    // LCD, so everything unlit is unlit and the only colour on the panel comes
    // from the segments themselves.
    GLASS: {
        background: 'radial-gradient(ellipse at 50% 0%, #14100e 0%, #060505 55%, #000 100%)',
        border: '1px solid #6f6857',
        borderRadius: '3px',
        boxShadow: 'inset 0 2px 7px rgba(0,0,0,0.95), inset 0 0 14px rgba(var(--accent-rgb),0.06)',
    },
    LED: 'var(--accent)',
    LED_DIM: 'var(--accent-s55)',
    LED_HOT: 'var(--accent-t40)',      // the ovld pair, a brighter cast of the same
    LED_OFF: 'var(--accent-s85)',      // an unlit segment behind the filter

    // ---- moulded plastic ----------------------------------------------------
    CREAM: '#e9e3d1',
    KEY_EDGE: '#8d8672',

    // ---- type ---------------------------------------------------------------
    MONO: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    SANS: 'system-ui, sans-serif',

    // ---- the floating panel shell -------------------------------------------
    PANEL_BG: 'var(--panel)',
    PANEL_EDGE: '#444',
    PANEL_SHADOW: '0 -4px 24px rgba(0,0,0,0.7)',
};

// ---------------------------------------------------------------------------
// Geometry every dial and needle needs. Written once because getting the sign
// of the Y term wrong is the classic way to end up with a knob that turns
// backwards, and it is not obvious from the drawing which one is wrong.
// ---------------------------------------------------------------------------

/** Degrees to radians. */
window.oaUiRad = function (deg) { return deg * Math.PI / 180; };

/**
 * A point `r` from (cx, cy) at `deg`, where 0° points STRAIGHT UP and positive
 * is clockwise — the way a panel marking is described, not the way the maths
 * library describes it.
 */
window.oaUiPolar = function (cx, cy, r, deg) {
    const a = window.oaUiRad(deg);
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

/** A DOM-id-safe unique suffix, for the SVG gradients a component defines. */
window.oaUiId = function (prefix) {
    return (prefix || 'ui') + Math.random().toString(36).slice(2, 8);
};
