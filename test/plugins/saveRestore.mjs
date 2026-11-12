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
 * Header: plugins/saveRestore.mjs
 * Purpose: Save and restore: every registered effect round-trips.
 * Description: One plugin's test pattern, loaded by ../plugins.test.mjs, whose
 *   header describes the pattern every plugin here follows. Not a *.test.mjs on
 *   its own: the case floor counts files, and this is one suite of that one file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmWorld } from '../harness.mjs';

// ---------------------------------------------------------------------------
// Save and restore
//
// The failure this guards against is silent and shipped once already: the pedal
// and the channel compressor were added after the song exporter was written,
// nothing in it named them, and every exported song came back with those two
// effects at their defaults. No error, no warning — the settings simply were
// not in the file.
//
// So the test is not "does the reverb round-trip", it is "does EVERY registered
// effect round-trip", enumerated from the registry rather than from a list here
// that would rot exactly the same way the exporter's did.
// ---------------------------------------------------------------------------

describe('save and restore', () => {
    test('every effect with settings can be saved', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        const saveable = window.oaSaveablePlugins();
        // Everything that has settings. The voice counter is the one plugin
        // with nothing to remember, and it is deliberately not in this list.
        ['reverb', 'delay', 'chorus', 'drive', 'comp', 'buss', 'drumsynth'].forEach((id) => {
            assert.ok(saveable.includes(id), `${id} cannot be saved — it would be missing from every song`);
        });
        assert.ok(!saveable.includes('voices'), 'the voice counter is saving state it does not have');
    });

    test('what comes back is what went in', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        // Move something on every effect, away from its default in each case.
        window.oaSetReverb(0, 'rtMid', 4.25);
        window.oaSetReverbSend(0, 2, 0.6);
        window.oaSetDelay(1, 'feedback', 0.77);
        window.oaSetDelayChorus(1, 7);
        window.oaSetDrive(3, 'mode', 'fuzz');
        window.oaSetDrive(3, 'mix', 0.7);
        window.oaSetComp(2, 'input', 14);
        window.oaSetComp(2, 'on', true);
        window.oaSetBuss('thresh', -7);
        window.oaSetBuss('ratio', 6);
        window.oaSetBuss('sc', 90);
        window.oaSetBuss('fourK', true);
        window.oaSetBuss('on', true);

        // Through JSON, because that is what a song file is — a save() that
        // hands back something JSON cannot carry would pass a naive comparison
        // and lose the setting on the way to disk.
        const saved = JSON.parse(JSON.stringify(window.oaSavePlugins()));

        // Put every one of them back to something else.
        window.oaSetReverb(0, 'rtMid', 1.0);
        window.oaSetReverbSend(0, 2, 0);
        window.oaSetDelay(1, 'feedback', 0.1);
        window.oaSetDelayChorus(1, 0);
        window.oaSetDrive(3, 'mode', 'od');
        window.oaSetDrive(3, 'mix', 0);
        window.oaSetComp(2, 'input', 0);
        window.oaSetComp(2, 'on', false);
        window.oaSetBuss('thresh', 12);
        window.oaSetBuss('ratio', 0);
        window.oaSetBuss('sc', 0);
        window.oaSetBuss('fourK', false);
        window.oaSetBuss('on', false);

        const loaded = window.oaLoadPlugins(saved, { bpm: 120 });
        assert.ok(loaded.includes('reverb') && loaded.includes('delay')
            && loaded.includes('drive') && loaded.includes('comp')
            && loaded.includes('buss'),
            `only ${loaded.join(', ')} restored`);

        assert.equal(window.oaReverbUnit(0).rtMid, 4.25, 'the reverb time did not come back');
        assert.equal(window.oaReverbUnit(0).sends[2], 0.6, 'the reverb send did not come back');
        assert.equal(window.oaDelayUnit(1).feedback, 0.77, 'the tape feedback did not come back');
        assert.equal(window.oaDelayUnit(1).chorus, 7, 'the width mode did not come back');
        assert.equal(window.oaDriveUnit(3).mode, 'fuzz', 'the pedal voicing did not come back');
        assert.equal(window.oaDriveUnit(3).mix, 0.7, 'the pedal blend did not come back');
        assert.equal(window.oaCompUnit(2).input, 14, 'the compressor input did not come back');
        assert.equal(window.oaCompUnit(2).on, true, 'the compressor came back switched off');
        assert.equal(window.oaBussUnit().thresh, -7, 'the buss threshold did not come back');
        assert.equal(window.oaBussUnit().ratio, 6, 'the buss ratio did not come back');
        assert.equal(window.oaBussUnit().sc, 90, 'the buss side-chain filter did not come back');
        assert.equal(window.oaBussUnit().fourK, true, 'the buss came back without 44K mode');
        assert.equal(window.oaBussUnit().on, true, 'the buss came back out of circuit');
    });

    test('a grid-locked tape head is re-derived at the new song\'s tempo', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        // An eighth note at 120bpm is 250ms. Saved at 120, loaded into a song
        // running at 90, it has to become an eighth AT 90 — 333ms — not stay at
        // the 250 it was cut at. That is the whole reason a lock is stored as a
        // count of 16ths rather than as a time.
        window.oaSetDelaySync(0, 'L', 2, 120);
        assert.ok(Math.abs(window.oaDelayUnit(0).timeL - 0.25) < 1e-6, 'the lock did not take at 120');

        const saved = JSON.parse(JSON.stringify(window.oaSavePlugins()));
        window.oaLoadPlugins(saved, { bpm: 90 });

        assert.ok(Math.abs(window.oaDelayUnit(0).timeL - 1 / 3) < 1e-3,
            `an eighth at 90bpm should be 333ms, got ${Math.round(window.oaDelayUnit(0).timeL * 1000)}ms`);
        assert.equal(window.oaDelayUnit(0).syncL, 2, 'the head came back off the grid');
    });

    test('a malformed effect in the file does not take the rest of the import down', async () => {
        const w = await createWarmWorld();
        const { window } = w;

        window.oaSetReverb(0, 'rtMid', 3.5);
        const saved = JSON.parse(JSON.stringify(window.oaSavePlugins()));
        window.oaSetReverb(0, 'rtMid', 1.0);

        // A hand-edited file, or one from a build whose drive plugin stored
        // something else entirely.
        saved.drive = { units: 'not an array' };

        const loaded = window.oaLoadPlugins(saved, { bpm: 120 });
        assert.ok(loaded.includes('reverb'), 'one bad effect stopped the others loading');
        assert.equal(window.oaReverbUnit(0).rtMid, 3.5, 'the reverb did not restore');
    });
});
