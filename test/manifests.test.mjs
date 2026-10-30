// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: manifests.test.mjs
 * Purpose: Hold the three bundle lists and the service worker's install list
 *   to the tree, inside `npm test` — the two checks that used to live in the
 *   monorepo's `.apk.scripts/check_mixer_dsp.mjs` and
 *   `check_sampler_service_worker.mjs`, both deleted with `check.sh` when the
 *   stacks were split (2240c51e5, 2026-09-10). Since then nothing asserted
 *   either, while build.mjs, sw.js and .gitignore still said something did
 *   (LOOSE-sampler).
 *
 *   1. ONE ORDER. `sources.json` is a dependency order (presets before the
 *      engine that reads them, the plugin host before anything registering
 *      with it). `sources.gui.json` (dist/gui.js, the faceplates APK:OS loads
 *      on top of its own DSP) and `sources.fx.json` (dist/fx.js, the engines
 *      the sound pages load) must each be a SUBSEQUENCE of it — same order,
 *      fewer files — or a bundle runs a file before the one it needs.
 *   2. EVERY FILE IS THERE. A listed path that is missing is a bundle that
 *      silently lacks what it carried.
 *   3. THE WORKER'S FALLBACK IS SHIPPABLE. sw.js installs a short shell list
 *      when dist/precache.json 404s (it is a declared drop, never tracked);
 *      every entry of that list must be a file git tracks, or the published
 *      site installs a worker holding nothing. The list and the cache name
 *      are read out of sw.js, never copied here.
 *
 *   What it does not do: register the worker in a browser on the published
 *   origin. That was the deleted check's other half and needs puppeteer and
 *   network; it is not in this suite.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const list = (rel) => JSON.parse(read(rel));

/* Where a stops matching b in order, or -1 when a is a subsequence of b. */
const firstOutOfOrder = (sub, full) => {
    let at = 0;
    for (let i = 0; i < sub.length; i++) {
        const found = full.indexOf(sub[i], at);
        if (found < 0) return i;
        at = found + 1;
    }
    return -1;
};

describe('the bundle lists share one dependency order', () => {
    const all = list('sources.json');

    test('sources.json names no file twice', () => {
        const dup = all.filter((f, i) => all.indexOf(f) !== i);
        assert.deepEqual(dup, [], `listed twice: ${dup.join(', ')}`);
    });

    for (const name of ['sources.gui.json', 'sources.fx.json']) {
        test(`${name} is a subsequence of sources.json`, () => {
            const sub = list(name);
            assert.ok(sub.length > 0, `${name} is empty`);
            const bad = firstOutOfOrder(sub, all);
            assert.equal(bad, -1, bad < 0 ? '' :
                `${name}[${bad}] = ${sub[bad]} is not in sources.json after ${sub[bad - 1] || 'the start'}`);
        });
    }

    test('every listed source exists', () => {
        const missing = [...new Set([...all, ...list('sources.gui.json'), ...list('sources.fx.json')])]
            .filter((f) => !existsSync(path.join(ROOT, f)));
        assert.deepEqual(missing, []);
    });
});

describe("the service worker's install fallback", () => {
    const sw = read('sw.js');
    const cache = (sw.match(/const\s+CACHE\s*=\s*'([^']+)'/) || [])[1];
    const raw = (sw.match(/let\s+list\s*=\s*\[([^\]]*)\]/) || [])[1];

    test('CACHE and the fallback list can be read out of sw.js', () => {
        assert.ok(cache, 'no `const CACHE = \'…\'` in sw.js — teach this test the new shape, do not delete it');
        assert.ok(raw, 'no `let list = [ … ]` in sw.js — teach this test the new shape, do not delete it');
    });

    test('every fallback entry is a file git tracks', () => {
        const entries = raw.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
        const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n'));
        const untracked = entries
            .map((e) => (e === './' ? 'index.html' : e.replace(/^\.\//, '')))
            .filter((f) => !tracked.has(f));
        assert.deepEqual(untracked, [], 'sw.js installs these, and a checkout (so the site) does not carry them');
    });

    test('dist/precache.json stays a declared drop', () => {
        const tracked = execFileSync('git', ['ls-files', 'dist/precache.json'], { cwd: ROOT, encoding: 'utf8' }).trim();
        assert.equal(tracked, '', 'precache.json is tracked: the published site would precache the whole machine');
    });
});
