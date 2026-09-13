// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: console-surface.test.mjs
 * Purpose: Prove the console surface is GENERIC — PLAN-18.01, step 5.
 * Description: PLAN-18.01 wrote the adapter and proved it on all eight
 *   registered plugins, then stopped one step short: nothing called it, so
 *   nothing had actually stopped being hand-written. These tests are about the
 *   caller, and the claim they hold is the one that would rot first:
 *
 *     THE SURFACE HAS NO PER-PLUGIN CODE. Every registered plugin — including
 *     ones registered after this file was written — draws through the same
 *     component, and the control list comes out of oaPluginParamSpecs rather
 *     than out of a `params.find()` written into the editor.
 *
 *     A READ-ONLY PARAMETER IS NOT A KNOB. The buss compressor's `mix` is
 *     deprecated: still in the schema so old saves load, no longer read by
 *     bussSettings(). Every hand-written surface in this tree would draw it as
 *     a working control whose writes land nowhere.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createWarmWorld } from './harness.mjs';
import { ALL_SOURCES } from './bundleSources.mjs';
import { makeReact, countNodes } from './fakeReact.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const openWorld = async () => {
    const r = makeReact();
    const w = await createWarmWorld({ sources: ALL_SOURCES, React: r.React });
    return { w, r };
};

describe('the console surface', () => {
    test('every registered plugin draws through it, with no per-plugin code', async () => {
        const { w, r } = await openWorld();
        const ids = w.window.oaPluginIds();
        assert.ok(ids.length >= 9, `expected the registered plugins, got ${ids.length}`);

        for (const id of ids) {
            let out;
            assert.doesNotThrow(() => { out = r.render(w.window.OaConsoleSurface, { id, idx: 0 }); },
                `${id}: the generic surface threw`);
            const cleanups = r.runEffects(out);
            assert.ok(countNodes(out.tree) > 0, `${id}: the surface rendered nothing at all`);

            // Redraw on the same hook slots, exactly as React does.
            let second;
            assert.doesNotThrow(() => { second = r.render(w.window.OaConsoleSurface, { id, idx: 0 }, out); },
                `${id}: the surface threw on redraw`);
            assert.equal(second.hookCount, out.hookCount,
                `${id}: the surface called a different number of hooks on redraw`);
            cleanups.forEach((c) => c());
        }
        w.cleanup();
    });

    test('the descriptor list is the adapter, not a second opinion', async () => {
        const { w, r } = await openWorld();
        for (const id of w.window.oaPluginIds()) {
            const specs = w.window.oaPluginParamSpecs(id, 0);
            let surface;
            const Probe = () => { surface = w.window.useOaConsoleSurface(id, 0); return null; };
            const out = r.render(Probe, {});
            const cleanups = r.runEffects(out);

            assert.deepEqual(
                surface.list.map((d) => d.key), specs.map((s) => s.name),
                `${id}: the surface drew a different set of controls than the adapter declared`,
            );
            surface.list.forEach((d, i) => {
                assert.equal(d.type, specs[i].type, `${id}.${d.key}: type disagrees with the ParamSpec`);
                assert.equal(d.writable, specs[i].writable === true,
                    `${id}.${d.key}: writability disagrees with the ParamSpec`);
            });
            cleanups.forEach((c) => c());
        }
        w.cleanup();
    });

    // The reason this is more than a refactor.
    test('a read-only parameter gets an inert writer, not a working knob', async () => {
        const { w, r } = await openWorld();

        // The buss compressor's `mix` is deprecated — in the schema so old
        // saves load, and read by nothing.
        let surface;
        const Probe = () => { surface = w.window.useOaConsoleSurface('buss', 0); return null; };
        const cleanups = r.runEffects(r.render(Probe, {}));

        const mix = surface.by.mix;
        assert.ok(mix, 'the buss compressor no longer declares `mix` — update this test');
        assert.equal(mix.writable, false, '`mix` is deprecated and must not be writable');

        const before = w.window.oaPluginState('buss', 0).mix;
        mix.set(before === 1 ? 0 : 1);
        assert.equal(w.window.oaPluginState('buss', 0).mix, before,
            'a read-only descriptor wrote to the unit');

        // And a writable one on the same plugin still works, or the test above
        // would pass on a surface whose writers are ALL inert — which would be
        // a broken console reported as a careful one.
        const live = surface.list.find((d) => d.writable && d.type === 'number');
        assert.ok(live, 'the buss compressor has no writable knob, which cannot be right');
        const was = w.window.oaPluginState('buss', 0)[live.key];
        // Somewhere in range that is definitely not where it already is.
        const target = was > (live.min + live.max) / 2 ? live.min : live.max;
        live.set(target);
        assert.equal(w.window.oaPluginState('buss', 0)[live.key], target,
            `a writable descriptor (${live.key}) did not reach the unit`);

        cleanups.forEach((c) => c());
        w.cleanup();
    });

    test('a plugin with no params says so rather than drawing an empty box', async () => {
        const { w, r } = await openWorld();
        // `voices` is registered with units=1 and params: [] — the empty case
        // is real, and it is not a lookup miss.
        assert.equal(w.window.oaPluginParams('voices', 0).length, 0,
            '`voices` now declares params — pick another empty plugin');
        const out = r.render(w.window.OaConsoleSurface, { id: 'voices', idx: 0 });
        const cleanups = r.runEffects(out);
        assert.ok(countNodes(out.tree) > 0, 'the empty case rendered nothing');
        cleanups.forEach((c) => c());
        w.cleanup();
    });

    // PLAN-18.01's third completion criterion. The compressor's panel used to
    // find its own parameters in `params` and assume every one could be
    // written; it now asks the surface. This is what stops that plumbing coming
    // back one editor at a time.
    test('the compressor panel takes its controls from the surface', async () => {
        const src = readFileSync(join(ROOT, 'libControl/Effects/Compressor/CompressorEditor.jsx'), 'utf8');
        assert.match(src, /useOaConsoleSurface\('comp', idx\)/,
            'CompressorEditor no longer builds its controls from the adapter');
        assert.doesNotMatch(src, /ticks=\{p\.ticks\}/,
            'CompressorEditor is reading the raw param descriptor again');
    });
    // PLAN-18.12, editor 2 of 7. One test per editor, deliberately, so a
    // regression names the file rather than reporting "an editor".
    //
    // The buss compressor went first because it had the LIVE defect, not just
    // the duplicated plumbing: its `P` fell back to `{ min: 0, max: 1, def: 0,
    // ... }` for a key it could not find, so a parameter the schema had dropped
    // became a working knob with invented bounds — and this is the one plugin
    // with a deprecated parameter (`mix`) to hand it.
    test('the buss compressor panel takes its controls from the surface', () => {
        const src = readFileSync(join(ROOT, 'libControl/Effects/BussCompressor/BussCompEditor.jsx'), 'utf8');

        assert.match(src, /useOaConsoleSurface\('buss', 0\)/,
            'BussCompEditor no longer builds its controls from the adapter');
        assert.doesNotMatch(src, /params\.find\(/,
            'BussCompEditor is finding its own parameters again');
        assert.doesNotMatch(src, /\|\|\s*\{\s*min:\s*0,\s*max:\s*1,\s*def:\s*0/,
            'the invented-bounds fallback is back: a missing key must draw nothing, not a knob');
        assert.match(src, /onChange=\{d\.writable \? d\.set : undefined\}/,
            'BussCompEditor is wiring a writer for a parameter the adapter marks read-only');
    });

    // A knob handed no writer must not merely fail to write — it must not
    // ACCEPT the gesture. RackKnob learned this in PLAN-18.01; BussKnob is the
    // second faceplate knob and had to learn it the same way, or the panel
    // would grey a control that still moved under the hand.
    test('the buss knob refuses the gesture when it has no writer', () => {
        const src = readFileSync(join(ROOT, 'libControl/Effects/BussCompressor/BussCompEditor.jsx'), 'utf8');

        assert.match(src, /const live = typeof onChange === 'function';/,
            'BussKnob does not know whether it has a writer');
        // Both gestures, not one: a guarded drag and an unguarded wheel is a
        // read-only control you can still turn with two fingers.
        assert.ok((src.match(/if \(!live\) return;/g) || []).length >= 2,
            'BussKnob guards only one of its two write gestures');
    });
    // PLAN-18.12 step 3, and the reason the step was worth taking: the EQ panel
    // is the honest test of whether the generic surface can SHIP, not merely
    // whether it can be called. If this file ever grows a knob of its own, the
    // answer changed and somebody should say so out loud.
    test('the EQ panel is the generic surface, with no controls of its own', () => {
        const src = readFileSync(join(ROOT, 'libControl/Effects/Equalizer/EqEditor.jsx'), 'utf8');

        assert.match(src, /<window\.OaConsoleSurface\s+id="eq"/,
            'EqEditor no longer draws its controls with the generic surface');
        assert.doesNotMatch(src, /params\.find\(/,
            'EqEditor is building its own control list');
        // The curve is allowed — it is a per-plugin DISPLAY, not a control. A
        // knob is not. Matched as a RENDERED ELEMENT rather than as a bare word,
        // because this file's own header names the rack knobs to say it does not
        // draw them, and a test that cannot tell prose from code fails on its
        // own documentation. (It did, first run.)
        assert.doesNotMatch(src, /<\s*(window\.)?(RackKnob|BussKnob|SvgKnob|GalaxyKnob)\b/,
            'EqEditor has grown a faceplate knob: the generic surface was not enough, say so in the plan');
    });

    // Every registered plugin should now have somewhere to be seen. The EQ was
    // the one that did not, which is what PLAN-18.12 step 3 was about.
    test('no registered plugin is left without a panel', async () => {
        const { w } = await openWorld();
        const ids = w.window.oaPluginIds();
        // The panels this tree ships, by the plugin id each one draws.
        const PANELLED = new Set(['comp', 'buss', 'drive', 'delay', 'chorus', 'drumsynth', 'eq', 'gate', 'reverb', 'sampler', 'voices']);
        const orphans = ids.filter((id) => !PANELLED.has(id));
        assert.deepEqual(orphans, [],
            `registered plugins with no panel: ${orphans.join(', ')} — add one, or add it to this list with a reason`);
        w.cleanup();
    });
    // The drum synth stores 'sine' in its patch, not 0. Every other enum in the
    // tree stores an index, so the surface coerced the string to `p.def || 0`,
    // the <select> read Math.round('sine') = NaN and showed no selection, and
    // choosing one wrote the INDEX into a field the engine reads as a NAME.
    // It rendered without throwing the whole time, which is why four tests
    // above went green over it. PLAN-18.12.
    test('a name-valued enum reads and writes its name, not its position', async () => {
        const { w, r } = await openWorld();
        let surface;
        const Probe = () => { surface = w.window.useOaConsoleSurface('drumsynth', 0); return null; };
        const cleanups = r.runEffects(r.render(Probe, {}));

        const named = surface.list.find((d) => d.type === 'enum'
            && typeof w.window.oaPluginState('drumsynth', 0)[d.key] === 'string');
        assert.ok(named, 'the drum synth no longer has a name-valued choice — update this test');
        assert.ok(named.values.length > 1, `${named.key} offers no alternative to pick`);

        // Read: the position is a real index and the readout is the NAME.
        assert.equal(Number.isFinite(named.value), true, `${named.key} projected to a non-number`);
        assert.equal(named.display, w.window.oaPluginState('drumsynth', 0)[named.key],
            `${named.key} prints its position instead of its name`);

        // Write: pick a DIFFERENT option by position, and the patch must hold
        // the name that position stands for.
        const target = (named.value + 1) % named.values.length;
        named.set(target);
        assert.equal(w.window.oaPluginState('drumsynth', 0)[named.key], named.values[target],
            `${named.key} wrote a position where the engine stores a name`);

        cleanups.forEach((c) => c());
        w.cleanup();
    });
    // PLAN-18.12, the last editor with control plumbing of its own. The drum
    // synth was the hard one: its knob list CHANGES with the pad's engine, and
    // its choices are names rather than positions — which is why the surface
    // had to learn name-valued enums before this file could be converted at all.
    test('the drum synth panel takes its controls from the surface', () => {
        const src = readFileSync(join(ROOT, 'libControl/Effects/DrumSynth/DrumSynthEditor.jsx'), 'utf8');

        assert.match(src, /useOaConsoleSurface\('drumsynth', idx\)/,
            'DrumSynthEditor no longer builds its controls from the adapter');
        assert.doesNotMatch(src, /window\.useOaParams\(/,
            'DrumSynthEditor is reading the raw param list again');
        assert.doesNotMatch(src, /spec\.options/,
            'DrumSynthEditor is reaching past the descriptor for the raw options array');
    });

    // The claim PLAN-18.12 was carved to make true, asserted over the FOLDER
    // rather than over a list of files — a ninth editor added later is covered
    // by this the day it lands, which a per-file list would not be.
    test('no effect editor builds its own control list', () => {
        const dir = join(ROOT, 'libControl/Effects');
        const offenders = [];
        const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
            const full = join(d, e.name);
            if (e.isDirectory()) return walk(full);
            if (!e.name.endsWith('Editor.jsx') && !e.name.endsWith('Remote.jsx')) return;
            const src = readFileSync(full, 'utf8');
            // The compressor keeps ONE find, documented: two places want a
            // plugin's formatter for a value they are not drawing a control
            // for. That is a formatter lookup, not a control list.
            const finds = (src.match(/params\.find\(/g) || []).length;
            const allowed = e.name === 'CompressorEditor.jsx' ? 1 : 0;
            if (finds > allowed) offenders.push(`${e.name} (${finds} params.find)`);
        });
        walk(dir);
        assert.deepEqual(offenders, [],
            `these editors still find their own parameters: ${offenders.join(', ')}`);
    });
});
