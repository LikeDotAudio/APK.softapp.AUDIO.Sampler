// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: harnessCostLoop.js
 * Purpose: The probe `test/harness-cost.test.mjs` loads through `createWorld`
 *   and through a plain `new Function`, to pin the gap PLAN-965.01 measured.
 * Description: Not shipped and not in `sources.json` — loaded only by the two
 *   paths that test named it. One hot loop reading a global (`Math`) on every
 *   iteration, the shape that exposed `createWorld`'s `with (window)` cost on
 *   the pre-Goertzel chromagram: a bin loop nested around a per-sample read.
 */
window.oaHarnessCostProbe = function (samples, bins) {
    let acc = 0;
    for (let b = 0; b < bins; b++) {
        for (let i = 0; i < samples; i++) {
            acc += Math.cos(i * 0.001 * (b + 1)) + Math.sin(i * 0.001 * (b + 1));
        }
    }
    return acc;
};
