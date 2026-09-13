// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: harness-cost.test.mjs
 * Purpose: Pin the gap PLAN-965.01 found — `createWorld` times a
 *   global-reading hot loop several times slower than a plain loader — so a
 *   future change to the loader is told, by a red test, that the caveat in
 *   `createWorld`'s doc comment has gone stale rather than left to be
 *   rediscovered the expensive way (an hour lost closing PLAN-801.01).
 * Description: Loads `test/fixtures/harnessCostLoop.js` twice — once through
 *   `createWorld`, once through `harness.mjs`'s own `loadSourcePlain` — and
 *   times the identical function both ways. It is not asserting a PRECISE
 *   factor, because wall time on a shared CI box is not that stable; it is
 *   asserting the gap is still LARGE, which is the only claim `createWorld`'s
 *   doc comment makes.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createWorld, loadSourcePlain } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE_REL = 'test/fixtures/harnessCostLoop.js';

function msPerCall(fn, iters) {
    for (let i = 0; i < 3; i++) fn();
    const startedAt = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) fn();
    return Number(process.hrtime.bigint() - startedAt) / 1e6 / iters;
}

describe('createWorld cost — a global read in a hot loop', () => {
    test("times the probe several times slower than a plain loader, on the identical source", async () => {
        const world = await createWorld({ sources: [PROBE_REL] });
        // The SAME path through both loaders, which is what makes the two
        // numbers comparable — and `loadSourcePlain` is the harness's own plain
        // loader rather than a fourth private copy of one (PLAN-1078.01).
        const plainWindow = loadSourcePlain(PROBE_REL);

        const SAMPLES = 4000;
        const BINS = 12;
        const msHarness = msPerCall(() => world.window.oaHarnessCostProbe(SAMPLES, BINS), 8);
        const msPlain = msPerCall(() => plainWindow.oaHarnessCostProbe(SAMPLES, BINS), 8);
        const factor = msHarness / msPlain;

        world.cleanup();

        // PLAN-965.01 measured 14-16x on the real (pre-Goertzel) chromagram
        // this probe stands in for. A factor near 1 here would mean
        // `with (window)` stopped costing what createWorld's doc comment
        // says it costs -- fix the doc comment, do not loosen this bound.
        assert.ok(
            factor > 3,
            `expected createWorld's with(window) loader to cost several times `
            + `more than a plain loader on a global-reading hot loop; got `
            + `${factor.toFixed(2)}x (harness ${msHarness.toFixed(2)} ms, plain `
            + `${msPlain.toFixed(2)} ms/call)`,
        );
    });

    test("createWorld's doc comment still carries the caveat this test pins", () => {
        const harnessSrc = readFileSync(join(HERE, 'harness.mjs'), 'utf8');
        assert.match(
            harnessSrc,
            /A TIMING TAKEN THROUGH THIS IS NOT THE BROWSER'S, AND NOT A PLAIN SCRIPT'S,\s*\n \* FOR A FUNCTION WHOSE HOT LOOP READS A GLOBAL\./,
        );
    });
});
