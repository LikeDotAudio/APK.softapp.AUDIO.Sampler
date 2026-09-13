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
 * Header: oaPadGrid.js
 * Purpose: How many pads the kit has, and how they are laid out.
 * Description: The app shipped with a fixed 4 × 4 of 16 voices, and that 16 was
 *   written into the pad grid, the mixer strips, the sequencer rows, the send
 *   arrays and the save files. This is the one place it is decided now —
 *   everything else counts from OA_PAD_COUNT.
 *
 *   Loads before every other audio file so the count is known by the time the
 *   kit, the synth patches and the effect sends are built.
 *
 *   Changing the layout keeps what is already there: growing appends new voices,
 *   shrinking hides the tail rather than erasing it, so the samples and patches
 *   on pads 17-25 are still waiting if the grid grows back.
 */

window.OA_PAD_LAYOUTS = [
    { key: '4x4', label: '16 pads — 4 × 4', cols: 4, rows: 4 },
    { key: '5x5', label: '25 pads — 5 × 5', cols: 5, rows: 5 },
];

const OA_PAD_DEFAULT = '4x4';

window.oaPadLayoutFor = function (key) {
    return window.OA_PAD_LAYOUTS.find((l) => l.key === key)
        || window.OA_PAD_LAYOUTS.find((l) => l.key === OA_PAD_DEFAULT);
};

// The largest grid anything has to allow for — sample stores and factory voice
// tables are sized to this so a layout change never has to grow them.
window.OA_PAD_MAX = window.OA_PAD_LAYOUTS.reduce((m, l) => Math.max(m, l.cols * l.rows), 0);

const oaApplyPadLayout = function (key) {
    const layout = window.oaPadLayoutFor(key);
    window.OA_PAD_LAYOUT = layout.key;
    window.OA_PAD_COLS = layout.cols;
    window.OA_PAD_ROWS = layout.rows;
    window.OA_PAD_COUNT = layout.cols * layout.rows;
    return layout;
};

oaApplyPadLayout((function () {
    try { return window.localStorage.getItem('oaPadLayout'); } catch (e) { return null; }
})());

/**
 * A per-channel array — an effect's sends, a saved kit — sized for the LARGEST
 * grid rather than the current one. Shrinking the grid then growing it back
 * finds pad 25's reverb send still where it was left.
 */
window.oaFxSendArray = function (saved) {
    const out = Array.isArray(saved) ? saved.slice(0, window.OA_PAD_MAX).map((v) => Number(v) || 0) : [];
    while (out.length < window.OA_PAD_MAX) out.push(0);
    return out;
};

/**
 * Pad numbers in display order — a classic pad grid counts from the BOTTOM left, so
 * the top row is drawn first and pad 1 sits under your left thumb.
 */
window.oaPadNumbers = function () {
    const out = [];
    for (let r = window.OA_PAD_ROWS - 1; r >= 0; r--) {
        for (let c = 0; c < window.OA_PAD_COLS; c++) out.push(r * window.OA_PAD_COLS + c + 1);
    }
    return out;
};

// Pad number at a grid position, counting from the bottom left. Returns 0 when
// the position falls outside the current grid.
window.oaPadAt = function (row, col) {
    if (row < 0 || col < 0 || row >= window.OA_PAD_ROWS || col >= window.OA_PAD_COLS) return 0;
    return row * window.OA_PAD_COLS + col + 1;
};

window.oaSetPadLayout = function (key) {
    if (key === window.OA_PAD_LAYOUT) return;
    oaApplyPadLayout(key);
    try { window.localStorage.setItem('oaPadLayout', window.OA_PAD_LAYOUT); } catch (e) {}

    // The kit array is MUTATED rather than replaced: several modules captured it
    // at load time, and they must all see the same one grow.
    // Effect sends are already sized for the largest grid, so only the kit and
    // its patches have to catch up.
    if (window.oaBuildDrumKit) window.oaBuildDrumKit();
    if (window.oaLoadSynthPatches) window.oaLoadSynthPatches();
    window.dispatchEvent(new CustomEvent('oa-pad-grid-changed', { detail: { layout: window.OA_PAD_LAYOUT } }));
};

/** The grid as plain data. The React hook over it lives in useOaPlugin.js. */
window.oaPadGrid = function () {
    return { cols: window.OA_PAD_COLS, rows: window.OA_PAD_ROWS, count: window.OA_PAD_COUNT };
};
