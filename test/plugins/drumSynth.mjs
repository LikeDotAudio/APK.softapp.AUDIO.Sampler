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
 * Header: plugins/drumSynth.mjs
 * Purpose: The drum synth.
 * Description: One plugin's test pattern, loaded by ../plugins.test.mjs, whose
 *   header describes the pattern every plugin here follows. Not a *.test.mjs on
 *   its own: the case floor counts files, and this is one suite of that one file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from '../harness.mjs';

// ---------------------------------------------------------------------------
// Drum synth
// ---------------------------------------------------------------------------

describe('drum synth', () => {
    test('every engine renders at its defaults', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        for (const name of Object.keys(window.OA_SYNTH_ENGINES)) {
            const engine = window.OA_SYNTH_ENGINES[name];
            const patch = window.oaSynthPatch({ engine: name });
            assert.doesNotThrow(
                () => engine.render(w.ctx, patch, 0, 0.9, w.ctx.destination),
                `${name} threw at its own defaults`,
            );
        }
    });

    /**
     * The big one. Every engine, every knob, at both ends of its travel, with
     * everything else at default — and then all knobs at each extreme together.
     * The failures this catches are the ones that reach a user as a voice that
     * simply stops working: an exponential ramp to zero, a NaN from a divide by
     * a parameter that reached zero, a negative duration. The fake AudioParam
     * throws on all of those the way a browser does.
     */
    test('every engine survives every knob at both extremes', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        for (const name of Object.keys(window.OA_SYNTH_ENGINES)) {
            const engine = window.OA_SYNTH_ENGINES[name];
            const keys = Object.keys(engine.params);

            const patches = [];
            // One knob at a time.
            keys.forEach((k) => {
                const spec = engine.params[k];
                const values = spec.options ? spec.options : [spec.min, spec.max];
                values.forEach((v) => {
                    patches.push({ label: `${k}=${v}`, patch: window.oaSynthPatch({ engine: name, [k]: v }) });
                });
            });
            // Then everything at once, both ways.
            ['min', 'max'].forEach((end) => {
                const p = { engine: name };
                keys.forEach((k) => {
                    const spec = engine.params[k];
                    p[k] = spec.options ? spec.options[end === 'min' ? 0 : spec.options.length - 1] : spec[end];
                });
                patches.push({ label: `all ${end}`, patch: window.oaSynthPatch(p) });
            });

            for (const { label, patch } of patches) {
                assert.doesNotThrow(
                    () => engine.render(w.ctx, patch, w.ctx.currentTime, 0.9, w.ctx.destination),
                    `${name} threw with ${label}`,
                );
                const dur = engine.render(w.ctx, patch, w.ctx.currentTime, 0.9, w.ctx.destination);
                assert.ok(
                    typeof dur === 'number' && isFinite(dur) && dur > 0,
                    `${name} with ${label} reported a duration of ${dur}`,
                );
            }
        }
    });

    test('a volume of zero does not blow up an exponential envelope', async () => {
        const w = await createWarmWorld();
        const { window } = w;
        // A muted track, a velocity of 0, a fader at the bottom — all of these
        // arrive here as a volume of zero, and every engine ramps exponentially.
        for (const name of Object.keys(window.OA_SYNTH_ENGINES)) {
            assert.doesNotThrow(
                () => window.OA_SYNTH_ENGINES[name].render(
                    w.ctx, window.oaSynthPatch({ engine: name }), 0, 0, w.ctx.destination,
                ),
                `${name} threw at volume 0`,
            );
        }
    });

    test('a patch out of storage is held to what the engine can do', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        // What a hand-edited localStorage entry, or a song file from a build
        // with different ranges, actually looks like on the way in.
        const patch = window.oaSynthPatch({
            engine: 'membrane', pitchStart: 1e9, decay: -50, wave: 'not-a-wave', click: NaN,
        });
        const spec = window.OA_SYNTH_ENGINES.membrane.params;
        assert.ok(patch.pitchStart <= spec.pitchStart.max, `pitchStart came through as ${patch.pitchStart}`);
        assert.ok(patch.decay >= spec.decay.min, `decay came through as ${patch.decay}`);
        assert.ok(spec.wave.options.includes(patch.wave), `wave came through as "${patch.wave}"`);
        assert.ok(Number.isFinite(patch.click), `click came through as ${patch.click}`);

        assert.doesNotThrow(() => window.OA_SYNTH_ENGINES.membrane.render(
            w.ctx, patch, 0, 0.9, w.ctx.destination,
        ), 'a sanitised patch still threw');
    });

    test('an unknown engine falls back rather than failing', async () => {
        const w = await createWarmWorld();
        const patch = w.window.oaSynthPatch({ engine: 'engine-from-a-later-build' });
        assert.ok(w.window.OA_SYNTH_ENGINES[patch.engine], `fell back to "${patch.engine}", which does not exist`);
    });

    test('the noise buffer is made once and shared', async () => {
        const w = await createWarmWorld();
        const a = w.window.oaNoiseBuffer(w.ctx);
        const b = w.window.oaNoiseBuffer(w.ctx);
        // Two seconds of float noise per hit would be the single most expensive
        // thing in the app.
        assert.equal(a, b, 'a fresh noise buffer was allocated on the second call');
    });
});
