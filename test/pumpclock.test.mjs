// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: pumpclock.test.mjs
 * Purpose: Prove there is ONE meter clock, that it runs at the Frame tier
 *   rather than at display refresh, and that the constant it runs at has not
 *   drifted from the tier table it was copied out of.
 * Description: PLAN-18.09 steps 3 and 4. The defect was two independent
 *   requestAnimationFrame loops — the plugin pump in oaPlugin.js and the
 *   mixer's own meter tick — so a 120 Hz panel ran both at 120 Hz, and every
 *   additional open plugin panel added a third, a fourth, a sixteenth through
 *   useOaFrame. The fix is one rAF that does work only when the Frame tier's
 *   period has elapsed, with every display riding it through oaPluginOnFrame.
 *
 *   THE RATE IS THE THING UNDER TEST, so the clock is driven by hand. The
 *   harness records rAF callbacks instead of firing them and window.performance
 *   is a fake, which between them let a test say "120 frames went by, at 8.3 ms
 *   each" and then count how many passes the pump actually did.
 *
 *   The last test is the one that guards the DESIGN rather than the behaviour.
 *   FRAME_MS is a copied constant, not a subscription — deliberately, so a local
 *   meter never depends on a broker — and a copied constant is a drift site. It
 *   is read back out of heartbeat-clock.js here for the same reason the Rust
 *   tier_parity test reads it rather than restating it: a third copy in a test
 *   would pass while the other two disagreed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createWorld } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHELL_CLOCK = join(HERE, '../../../APK:OS/Midi/heartbeat/heartbeat-clock.js');

/** A world with a clock the test moves, and a plugin that counts passes. */
async function world_with_a_countable_plugin() {
    const world = await createWorld();
    const { window } = world;

    let at = 0;
    window.performance.now = () => at;

    let passes = 0;
    window.oaRegisterPlugin({
        id: 'counter',
        read() { passes++; },
    });

    return {
        world,
        window,
        advance(ms) { at += ms; },
        get passes() { return passes; },
        /** One display frame: the browser calls back, having advanced the clock. */
        frame(ms) { at += ms; return world.tick(); },
    };
}

describe('one meter clock, at the Frame tier (PLAN-18.09 steps 3 and 4)', () => {
    test('the pump does not do a pass on every display frame', async () => {
        const rig = await world_with_a_countable_plugin();
        const detach = rig.window.oaPluginAttach();

        // 120 display frames at 8.333 ms — one second on a 120 Hz panel.
        for (let i = 0; i < 120; i++) rig.frame(1000 / 120);

        // 1000 ms / 36 ms = 27.8 passes. Before this change it was 120.
        assert.ok(
            rig.passes >= 26 && rig.passes <= 30,
            `expected ~28 passes in one second at 120 Hz, got ${rig.passes}`,
        );
        assert.ok(rig.passes < 120, 'the pump is still running at display refresh');
        detach();
    });

    test('a 120 Hz panel and a 60 Hz panel do the same amount of work', async () => {
        const fast = await world_with_a_countable_plugin();
        const slow = await world_with_a_countable_plugin();
        const fastDetach = fast.window.oaPluginAttach();
        const slowDetach = slow.window.oaPluginAttach();

        for (let i = 0; i < 120; i++) fast.frame(1000 / 120);
        for (let i = 0; i < 60; i++) slow.frame(1000 / 60);

        // THE POINT OF THE WHOLE PLAN: the meter's cost stops being a property
        // of the panel it is drawn on.
        assert.ok(
            Math.abs(fast.passes - slow.passes) <= 1,
            `120 Hz did ${fast.passes} passes, 60 Hz did ${slow.passes} — the rate `
            + 'is still following the display',
        );
        fastDetach();
        slowDetach();
    });

    test('every display rides the one clock, once per pass', async () => {
        const rig = await world_with_a_countable_plugin();
        const detach = rig.window.oaPluginAttach();

        let a = 0, b = 0;
        const stopA = rig.window.oaPluginOnFrame(() => { a++; });
        const stopB = rig.window.oaPluginOnFrame(() => { b++; });
        assert.equal(rig.window.oaPluginFrameListenerCount(), 2);

        for (let i = 0; i < 120; i++) rig.frame(1000 / 120);

        // Sixteen open panels would be sixteen loops before this; now they are
        // sixteen calls inside one.
        assert.equal(a, rig.passes, 'listener A did not run exactly once per pass');
        assert.equal(b, rig.passes, 'listener B did not run exactly once per pass');

        stopA();
        stopB();
        assert.equal(rig.window.oaPluginFrameListenerCount(), 0);
        detach();
    });

    test('a display that throws does not stop the pump or its neighbours', async () => {
        const rig = await world_with_a_countable_plugin();
        const detach = rig.window.oaPluginAttach();

        let survivor = 0;
        rig.window.oaPluginOnFrame(() => { throw new Error('a broken meter'); });
        rig.window.oaPluginOnFrame(() => { survivor++; });

        for (let i = 0; i < 120; i++) rig.frame(1000 / 120);

        assert.ok(rig.passes > 20, 'the pump stopped when a listener threw');
        assert.equal(survivor, rig.passes, 'a throwing listener took its neighbour down');
        detach();
    });

    test('releasing twice does not evict a stranger', async () => {
        const rig = await world_with_a_countable_plugin();
        const mine = () => {};
        const yours = () => {};
        const stopMine = rig.window.oaPluginOnFrame(mine);
        rig.window.oaPluginOnFrame(yours);

        stopMine();
        stopMine();

        assert.equal(
            rig.window.oaPluginFrameListenerCount(), 1,
            'a double-release removed somebody else\'s listener',
        );
    });

    test('a late frame does not push the cadence permanently later', async () => {
        const rig = await world_with_a_countable_plugin();
        const detach = rig.window.oaPluginAttach();

        rig.frame(0);          // first pass, arms the schedule
        const before = rig.passes;

        // One frame arrives 30 ms late, then the panel recovers. The next slot
        // is owed from when it was DUE, not from when this callback ran.
        rig.frame(66);
        for (let i = 0; i < 60; i++) rig.frame(1000 / 120);

        const elapsed = 66 + 60 * (1000 / 120);
        const expected = Math.round(elapsed / 36);
        assert.ok(
            Math.abs((rig.passes - before) - expected) <= 2,
            `cadence drifted after a late frame: ${rig.passes - before} passes in `
            + `${elapsed.toFixed(0)} ms, expected about ${expected}`,
        );
        detach();
    });

    test('nothing is pumped while nothing is attached', async () => {
        const rig = await world_with_a_countable_plugin();
        for (let i = 0; i < 120; i++) rig.frame(1000 / 120);
        assert.equal(rig.passes, 0, 'the pump ran with no display attached');
    });

    test('FRAME_MS is the Frame tier, read out of the shell rather than restated', async () => {
        const rig = await world_with_a_countable_plugin();
        const source = readFileSync(SHELL_CLOCK, 'utf8');

        const at = source.indexOf('OS.HEARTBEAT_TIERS');
        assert.ok(at >= 0, 'heartbeat-clock.js no longer declares OS.HEARTBEAT_TIERS');
        const open = source.indexOf('{', at);
        const close = source.indexOf('}', open);
        const table = Object.fromEntries(
            source.slice(open + 1, close)
                .split('\n')
                .map((line) => line.trim().replace(/,$/, ''))
                .filter((line) => line && !line.startsWith('//'))
                .map((line) => {
                    const [name, period] = line.split(':');
                    return [name.trim().replace(/['"]/g, ''), Number(period)];
                }),
        );

        assert.equal(
            rig.window.oaPluginFrameMs(), table.Frame,
            'the meter pump\'s period has drifted from the Frame heartbeat tier. '
            + 'It is a copied constant on purpose — a local meter must not depend '
            + 'on a broker — so this is the only thing keeping the copy honest.',
        );
        // The range the plan asked for, asserted rather than assumed.
        const hz = 1000 / rig.window.oaPluginFrameMs();
        assert.ok(hz >= 20 && hz <= 30, `the meter tier is ${hz.toFixed(1)} Hz, outside 20-30`);
    });
});
