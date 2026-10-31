// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: exports.test.mjs
 * Purpose: Hold the three BUILT bundles to the contract in exports.json — the
 *   window.* names APK:OS reads out of dist/fx.js, dist/gui.js and dist/app.js
 *   when it loads them by path (OS/system/sound.modules.json).
 * Description: Each bundle is booted ALONE in a fresh fake window, exactly as
 *   its own script tag would run it, and every declared name must then be
 *   defined. The committed file is what is tested, not the sources, because the
 *   committed file is what OS loads; `build.mjs --check` separately holds it to
 *   the sources.
 *
 *   Also: fx registers every plugin OS expects; every bundle announces the
 *   contract's version as its apiGlobal; that version is package.json's; and
 *   the one file this page takes from APK:OS (exports.json `consumes`) is the
 *   one index.html actually loads, so the dependency cannot move unrecorded.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { bootFiles } from './bootScripts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const EXPORTS = JSON.parse(read('exports.json'));
const PKG = JSON.parse(read('package.json'));

/** Every name a bundle must define: its own plus those of what it includes. */
const required = (name) => {
    const b = EXPORTS.bundles[name];
    return [...(b.includes || []).flatMap(required), ...b.globals];
};

describe('the bundle contract (exports.json)', () => {
    test('its version is package.json\'s, and a semver', () => {
        assert.match(EXPORTS.version, /^\d+\.\d+\.\d+$/);
        assert.equal(EXPORTS.version, PKG.version,
            'exports.json and package.json disagree about the API version');
    });

    for (const [name, bundle] of Object.entries(EXPORTS.bundles)) {
        test(`${bundle.file} booted alone defines every declared name`, async () => {
            const w = await bootFiles([bundle.file]);
            const missing = required(name).filter((g) => w.window[g] === undefined);
            assert.deepEqual(missing, [], `${bundle.file} does not define: ${missing.join(', ')}`);
            assert.equal(w.window[bundle.apiGlobal], EXPORTS.version,
                `${bundle.file} announces ${bundle.apiGlobal}=${w.window[bundle.apiGlobal]}, not ${EXPORTS.version} — rebuild`);
            w.cleanup();
        });
    }

    test('dist/fx.js registers every plugin the OS desk expects', async () => {
        const w = await bootFiles([EXPORTS.bundles.fx.file]);
        const missing = EXPORTS.bundles.fx.plugins.filter((id) => !w.window.oaPlugin(id));
        assert.deepEqual(missing, [], `fx.js does not register: ${missing.join(', ')}`);
        w.cleanup();
    });

    test('the gui bundle loads on top of fx, as the OS mixer page loads it', async () => {
        const w = await bootFiles([EXPORTS.bundles.fx.file, EXPORTS.bundles.gui.file]);
        const missing = required('gui').filter((g) => typeof w.window[g] !== 'function');
        assert.deepEqual(missing, [], `faceplates missing on the mixer page: ${missing.join(', ')}`);
        w.cleanup();
    });

    test('every declared name is defined by a source of that bundle (no stray entries)', () => {
        // Indentation allowed: a file that wraps itself in an IIFE defines its
        // names one level in. Presence is the question, not ownership.
        const DEFINES = /^\s*window\.([A-Za-z_$][\w$]*)\s*=(?!=)/gm;
        const lists = { fx: 'sources.fx.json', gui: 'sources.gui.json', app: 'sources.json' };
        for (const [name, list] of Object.entries(lists)) {
            const defined = new Set();
            for (const f of JSON.parse(read(list))) {
                for (const m of read(f).matchAll(DEFINES)) defined.add(m[1]);
            }
            const stray = EXPORTS.bundles[name].globals.filter((g) => !defined.has(g));
            assert.deepEqual(stray, [], `${list} defines none of: ${stray.join(', ')}`);
        }
    });

    test('what the page takes from APK:OS is what exports.json says it takes', () => {
        const html = read('index.html');
        const fromOs = [...html.matchAll(/<script[^>]+src="([^"]*APK:OS\/[^"]+)"/g)]
            .map((m) => m[1].replace(/^(\.\.\/)+/, ''));
        assert.deepEqual(fromOs.sort(), Object.keys(EXPORTS.consumes).sort(),
            'index.html loads a different set of APK:OS files than exports.json `consumes` declares');
    });
});
