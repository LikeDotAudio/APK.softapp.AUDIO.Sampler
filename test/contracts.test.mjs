// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: contracts.test.mjs
 * Purpose: Pin this app's copies of two monorepo contracts (SDK/contracts audit
 *   2026-10-30, WS-06 and WS-07).
 * Description:
 *   WS-06 — every topic `libControl/App/oaTopics.js` builds is exactly what the
 *   monorepo's `Topics.gui.state({ stateRoot, path })` builds for the same parts,
 *   parses back as `guiState`, and sits under one of `GUI_STATE_ROOTS`. Read
 *   from `contracts/generated/web/apk-contracts.mjs` (zod-free, committed),
 *   found by walking up from this file. A STANDALONE clone has no monorepo
 *   around it, so these cases are skipped there and say why — the literals in
 *   oaTopics.js are then held by payloads.test.mjs alone.
 *
 *   WS-07 — the brand accent. `tokens/brand.json` is the vendored copy of
 *   `contracts/tokens/brand.json` (byte-identical, also held by the monorepo's
 *   `check.sh webtokens`). Every place a static file has to spell the accent
 *   out — oaTheme.js's default, index.html's `--accent` / `--accent-rgb` /
 *   theme-color, manifest.json's theme_color, the picker's default swatch —
 *   must equal it, and no other source may name the hex (they read
 *   `window.oaAccent()` / `oaAccentRgba()` / `var(--accent)` instead).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { loadSourcePlain } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** The monorepo root above this checkout, or null in a standalone clone. */
const monorepo = (() => {
    let d = ROOT;
    for (;;) {
        if (existsSync(join(d, 'contracts/generated/web/apk-contracts.mjs'))) return d;
        const up = dirname(d);
        if (up === d) return null;
        d = up;
    }
})();
const C = monorepo
    ? await import(pathToFileURL(join(monorepo, 'contracts/generated/web/apk-contracts.mjs')).href)
    : null;
const skip = C ? false : 'standalone clone: no contracts/generated/web/apk-contracts.mjs above this repo';

describe('WS-06: the gui-state topics are the contract\'s', () => {
    const t = loadSourcePlain('libControl/App/oaTopics.js').oaTopics;
    const cases = () => [
        [t.drumKitSample(3), 'DrumKit', ['3', 'sample']],
        [t.drumKitEq(0, 'hiGain'), 'DrumKit', ['0', 'eq', 'hiGain']],
        [t.DRUM_SETS, 'DrumSets', []],
        [t.SOUND_FAVORITES, 'SoundFavorites', []],
        ...t.SEQ_KEYS.map((k) => [t.seq('Pattern Sequencer', k), 'Sequencer', ['Pattern_Sequencer', k]]),
    ];

    test('the root is the contract\'s GUI_ROOT', { skip }, () => {
        assert.equal(t.ROOT, C.GUI_ROOT);
    });

    test('every topic equals Topics.gui.state for the same parts, and parses as guiState', { skip }, () => {
        for (const [topic, stateRoot, path] of cases()) {
            assert.ok(C.GUI_STATE_ROOTS.includes(stateRoot), `${stateRoot} is not a GUI_STATE_ROOTS entry`);
            assert.equal(topic, C.Topics.gui.state({ stateRoot, path }));
            const parsed = C.Topics.parse(topic);
            assert.equal(parsed.kind, 'guiState', topic);
            assert.equal(parsed.stateRoot, stateRoot, topic);
        }
    });

    test('a sequencer label becomes one segment the grammar accepts', { skip }, () => {
        const seg = new RegExp(C.CHARSETS.segment);
        for (const label of ['Pattern Sequencer', 'Drum Machine #2', 'a/b+c', 'Main']) {
            assert.match(t.seqSegment(label), seg, label);
        }
    });
});

describe('WS-07: the accent is brand.json\'s', () => {
    const brand = JSON.parse(read('tokens/brand.json'));
    const hex = brand.accent.hex.toLowerCase();
    const rgb = brand.accent.rgb;

    test('tokens/brand.json is the monorepo\'s, byte for byte', { skip }, () => {
        assert.equal(read('tokens/brand.json'), readFileSync(join(monorepo, 'contracts/tokens/brand.json'), 'utf8'));
    });

    test('every static copy of the accent equals brand.json', () => {
        const theme = loadSourcePlain('libControl/App/oaTheme.js');
        assert.equal(theme.OA_ACCENT_DEFAULT.toLowerCase(), hex, 'oaTheme.js OA_ACCENT_DEFAULT');
        assert.deepEqual(theme.OA_ACCENT_RGB, rgb, 'oaTheme.js OA_ACCENT_RGB');
        const html = read('index.html');
        assert.equal((html.match(/name="theme-color"\s+content="([^"]+)"/) || [])[1]?.toLowerCase(), hex, 'index.html theme-color');
        assert.equal((html.match(/--accent:\s*(#[0-9a-fA-F]{6})/) || [])[1]?.toLowerCase(), hex, 'index.html --accent');
        assert.equal((html.match(/--accent-rgb:\s*([\d,\s]+);/) || [])[1]?.replace(/\s/g, ''), rgb.join(','), 'index.html --accent-rgb');
        assert.equal(JSON.parse(read('manifest.json')).theme_color.toLowerCase(), hex, 'manifest.json theme_color');
        assert.match(read('libControl/Sequencer/SeqControls.jsx'), new RegExp(`hex: '${hex}', name: 'Orange — the default'`, 'i'),
            'the picker\'s default swatch');
    });

    test('no other source spells the accent out', () => {
        const allowed = new Set(['libControl/App/oaTheme.js', 'libControl/Sequencer/SeqControls.jsx']);
        const lit = new RegExp(`${hex}|rgba?\\(\\s*${rgb.join('\\s*,\\s*')}`, 'i');
        const offenders = JSON.parse(read('sources.json'))
            .filter((f) => !allowed.has(f))
            .filter((f) => lit.test(read(f).replace(/^\s*\/\/.*$/gm, '')));
        assert.deepEqual(offenders, [], 'read window.oaAccent() / oaAccentRgba() / var(--accent) instead');
        // The swatch file may name the default hex once, as the picker's entry, and nothing else.
        assert.equal((read('libControl/Sequencer/SeqControls.jsx').match(new RegExp(hex, 'gi')) || []).length, 1);
    });
});
