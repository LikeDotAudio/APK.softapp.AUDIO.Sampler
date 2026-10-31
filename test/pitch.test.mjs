// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: pitch.test.mjs
 * Purpose: The local pitch detector (`oaAutoCorrelateLocal`, the standalone
 *   fallback in libControl/MusicChart/oaScanMeasure.js) and the shared one
 *   (WEB.Frontend-Assets `SRC/FrontEnd/shared/pitch-detect.js`, served at
 *   /FrontEnd/shared/pitch-detect.js as window.PitchDetect) give IDENTICAL
 *   answers, and so does `oaEstimatePitch` whichever of the two it uses.
 * Description: The shared file is found by walking up to the monorepo; in a
 *   standalone clone the comparison cases are skipped and say why. The local
 *   copy is still exercised there by deepscan.test.mjs.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_REL = 'PODS/POD.THIN/WEB.Frontend-Assets/SRC/FrontEnd/shared/pitch-detect.js';
const sharedPath = (() => {
    for (let d = ROOT; ; d = dirname(d)) {
        if (existsSync(join(d, SHARED_REL))) return join(d, SHARED_REL);
        if (dirname(d) === d) return null;
    }
})();
const shared = sharedPath ? createRequire(import.meta.url)(sharedPath) : null;
const skip = shared ? false : `standalone clone: no ${SHARED_REL} above this repo`;

const SR = 48000;
const tone = (hz, n, amp = 0.6, partials = 1) => Float32Array.from({ length: n }, (_, i) => {
    let v = 0;
    for (let k = 1; k <= partials; k++) v += Math.sin(2 * Math.PI * hz * k * i / SR) / k;
    return amp * v / partials;
});
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const BUFFERS = [
    ['silence', new Float32Array(2048)],
    ['A2 110 Hz', tone(110, 2048)],
    ['A3 220 Hz', tone(220, 2048)],
    ['E4 329.6 Hz, 3 partials', tone(329.63, 2048, 0.6, 3)],
    ['A4 440 Hz, quiet', tone(440, 2048, 0.02)],
    ['white noise', Float32Array.from({ length: 2048 }, rand)],
];

describe('one pitch detector: the local copy is the shared one', () => {
    test('autoCorrelate: identical on every buffer', { skip }, async () => {
        const w = await createWorld({ sources: ['libControl/MusicChart/oaScanMeasure.js'] });
        for (const [name, buf] of BUFFERS) {
            assert.equal(w.window.oaAutoCorrelateLocal(buf, SR), shared.autoCorrelate(buf, SR), name);
        }
        w.cleanup();
    });

    test('oaEstimatePitch gives the same answer with and without window.PitchDetect', { skip }, async () => {
        const w = await createWorld({ sources: ['libControl/MusicChart/oaScanMeasure.js'] });
        const file = Float32Array.from({ length: SR * 2 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 196 * i / SR));
        const local = w.window.oaEstimatePitch(file, SR);
        w.window.PitchDetect = shared;
        const viaShared = w.window.oaEstimatePitch(file, SR);
        assert.deepEqual(viaShared, local);
        assert.ok(Math.abs(local.pitchHz - 196) < 2, `expected ~196 Hz, got ${local.pitchHz}`);
        w.cleanup();
    });

    test('the dispatcher uses window.PitchDetect when the page has it', async () => {
        const w = await createWorld({ sources: ['libControl/MusicChart/oaScanMeasure.js'] });
        let asked = 0;
        w.window.PitchDetect = { autoCorrelate: () => { asked++; return 123; } };
        assert.equal(w.window.oaAutoCorrelate(new Float32Array(16), SR), 123);
        assert.equal(asked, 1);
        delete w.window.PitchDetect;
        assert.equal(w.window.oaAutoCorrelate(new Float32Array(2048), SR), -1, 'the local copy answers silence with -1');
        w.cleanup();
    });
});
