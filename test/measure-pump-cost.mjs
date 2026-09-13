// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: measure-pump-cost.mjs
 * Purpose: Measure what the meter pump costs per simulated second, at the old
 *   rate and the new one, so PLAN-18.09 step 4's claim is bought rather than
 *   asserted.
 * Description: Run it — it is not a test and `npm test` does not pick it up,
 *   because a wall-clock number belongs in the record, not in a gate that goes
 *   red when the machine is busy.
 *
 *     node test/measure-pump-cost.mjs
 *
 *   WHAT THIS DOES AND DOES NOT MEASURE. It counts the WORK — pump passes,
 *   plugin reads, analyser reads and display callbacks — for one simulated
 *   second of display frames, with a real analyser read behind each one, and
 *   times it. That is a true measurement of the work removed and it is
 *   deterministic, which a browser sample is not.
 *
 *   It is NOT a browser CPU profile on a real 120 Hz panel. The compositor, the
 *   layout the mixer's DOM writes provoke, and the GPU are all outside this
 *   process. The claim this buys is "the pump does N times less work"; the claim
 *   "the browser uses N times less CPU" still wants PLAN-18.11's rig session.
 */

import { createWorld } from './harness.mjs';

const PANELS = [60, 120, 144];

/**
 * One second of display frames against a given meter period.
 * `frameMs = 0` is the old behaviour: a pass on every single display frame.
 */
async function measure(hz, frameMs, openPanels) {
    const world = await createWorld();
    const { window } = world;

    let at = 0;
    window.performance.now = () => at;

    let reads = 0;
    let analyserReads = 0;

    // An analyser that costs something to read, so the measurement is not
    // timing an empty function call.
    const analyser = {
        fftSize: 1024,
        getFloatTimeDomainData(array) {
            analyserReads++;
            for (let i = 0; i < array.length; i++) array[i] = Math.sin(i * 0.01);
        },
    };

    window.oaRegisterPlugin({
        id: 'meterable',
        read(ctx, i, frame) {
            reads++;
            frame[window.OA_SLOT.PEAK_L] = window.oaAnalyserPeak(analyser);
        },
    });

    // The pump's rate is a module constant, so the old behaviour is simulated
    // by driving `oaPumpPluginsOnce` by hand on every frame instead.
    const detach = window.oaPluginAttach();

    let draws = 0;
    const stops = [];
    if (frameMs > 0) {
        for (let p = 0; p < openPanels; p++) {
            stops.push(window.oaPluginOnFrame(() => { draws++; }));
        }
    }

    const step = 1000 / hz;
    const startedAt = process.hrtime.bigint();

    for (let f = 0; f < hz; f++) {
        at += step;
        if (frameMs > 0) {
            world.tick();
        } else {
            // OLD: the pump ran on every rAF, and every open panel ran its own
            // rAF loop reading the frames the pump had just written.
            window.oaPumpPluginsOnce();
            for (let p = 0; p < openPanels; p++) draws++;
            world.frames.length = 0;
        }
    }

    // `ms` below is wall time taken THROUGH `createWorld`'s with(window)
    // loader, so it is not a browser cost -- see createWorld's doc in
    // harness.mjs and PLAN-965.01. The "x less" figure this file prints is
    // computed from `reads` (deterministic work removed), never from this
    // column, and holds regardless of how the loader distorts wall time.
    const ns = Number(process.hrtime.bigint() - startedAt);
    stops.forEach((s) => s());
    detach();
    world.cleanup();

    return { reads, analyserReads, draws, ms: ns / 1e6 };
}

const openPanels = Number(process.argv[2] || 8);

console.log(`\nOne simulated second, ${openPanels} plugin panels open.`);
console.log('"before" = a pass on every display frame + one rAF loop per panel.');
console.log('"after"  = one rAF, work capped at the Frame tier (36 ms).\n');
console.log('  panel     passes/s        analyser reads/s      panel draws/s     pump ms/s');
console.log('  ' + '-'.repeat(74));

for (const hz of PANELS) {
    const before = await measure(hz, 0, openPanels);
    const after = await measure(hz, 36, openPanels);
    const factor = before.reads / Math.max(after.reads, 1);
    console.log(
        `  ${String(hz + ' Hz').padEnd(9)}`
        + `${String(before.reads).padStart(4)} -> ${String(after.reads).padEnd(6)}`
        + `${String(before.analyserReads).padStart(8)} -> ${String(after.analyserReads).padEnd(10)}`
        + `${String(before.draws).padStart(8)} -> ${String(after.draws).padEnd(10)}`
        + `${before.ms.toFixed(1).padStart(6)} -> ${after.ms.toFixed(1).padEnd(6)}`
        + `  ${factor.toFixed(1)}x less`,
    );
}
console.log('\nThe saving grows with the refresh rate, which is the point: the meter\'s');
console.log('cost stops being a property of the panel it happens to be drawn on.\n');
console.log('"x less" above is computed from analyser reads, a deterministic work count.');
console.log('The "pump ms/s" column is wall time through createWorld\'s with(window)');
console.log('loader and is NOT a browser cost -- PLAN-965.01.\n');
