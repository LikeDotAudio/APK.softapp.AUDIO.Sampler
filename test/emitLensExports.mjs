// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: emitLensExports.mjs
 * Purpose: Write out the files the Scanalyzer's export buttons actually
 *   produce, so a schema can be validated against an EXPORT rather than
 *   against somebody's reading of the exporter.
 * Description: `.apk.scripts/check_lens_exports.py` spawns this, then validates
 *   what it wrote against `lensPerfExportSchema.json` and
 *   `lensPeakSidecarSchema.json`. It is deliberately NOT named `*.test.mjs`:
 *   it asserts nothing, it is not part of the suite `check_case_floor.mjs`
 *   floors, and a red schema must report as a red schema and not as a missing
 *   test case.
 *
 *   IT DRIVES THE SHIPPING COMPONENT. `createWarmWorld` loads every source in
 *   `sources.json` into the fake browser and `LensesView` renders into
 *   `fakeReact`; the exports are reached by finding the button by its label and
 *   calling its `onClick`, and the bytes are the ones the world's `<a download>`
 *   click recorded. Nothing here reconstructs a payload — a key this file
 *   cannot see is a key no visitor gets either.
 *
 *   THREE WORLDS, BECAUSE ONE BUFFER CANNOT REACH EVERY BRANCH. The tone has
 *   measurements, the silence has none and proves the null arm of every scalar,
 *   and the dictated world is the only one in which `lyric_events` and
 *   `lyrics.words` are non-empty — so it is the only one that exercises the
 *   item shape inside them at all.
 *
 *   Contract: `node test/emitLensExports.mjs <out.json>` writes
 *   `{ "<world>": [ { name, json }, ... ] }` and prints nothing on success.
 *   Any failure to reach an export throws, because a run that quietly produced
 *   fewer files would validate clean.
 */
import { writeFileSync } from 'node:fs';

import { createWarmWorld } from './harness.mjs';
import { ALL_SOURCES } from './bundleSources.mjs';
import { makeReact } from './fakeReact.mjs';
// The label was typed here as a literal and drifted from the view — PLAN-1038.01.
import { lensTab } from './lensTabs.mjs';

// App.jsx mounts the whole application on load; the panel under test does not
// need it and it drags a second React tree in. ALL_SOURCES is that list, and
// it is `bundleSources.mjs`'s to state — lenses.test.mjs opens the same one.
const SOURCES = ALL_SOURCES;

const FILENAME = 'Trumpet Take 3.wav';

const flatten = (node, out = []) => {
    if (node == null || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach((n) => flatten(n, out)); return out; }
    out.push(node);
    (node.children || []).forEach((n) => flatten(n, out));
    return out;
};

const textOf = (node) => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join(' ');
    return (node.children || []).map(textOf).join(' ');
};

const buttonWith = (tree, label) => flatten(tree).find(
    (n) => n.type === 'button' && textOf(n).includes(label),
);

/** 220 Hz at 120 BPM, decaying on every beat: an A3 with a tempo to find. */
const pulsedTone = (ctx, seconds = 4, rate = 8000) => {
    const buf = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        const beat = t * 2;
        const env = Math.exp(-8 * (beat - Math.floor(beat)));
        d[i] = 0.5 * env * Math.sin(2 * Math.PI * 220 * t);
    }
    return buf;
};

const silence = (ctx, seconds = 5, rate = 8000) =>
    ctx.createBuffer(1, Math.floor(rate * seconds), rate);

/** Open the panel on a buffer and let its auto-scan settle. */
const openLenses = async (makeBuffer) => {
    const r = makeReact();
    const w = await createWarmWorld({ sources: SOURCES, React: r.React });
    const Component = w.window.LensesView;
    if (typeof Component !== 'function') throw new Error('LensesView is not defined');

    const props = { audioBuffer: makeBuffer(w.ctx), filename: FILENAME, padIdx: null };
    const first = r.render(Component, props);

    const canvasNode = flatten(first.tree).find((n) => n.type === 'canvas');
    if (!canvasNode || !canvasNode.props.ref) throw new Error('the timeline canvas has no ref');
    canvasNode.props.ref.current = w.window.document.createElement('canvas');

    r.runEffects(first);
    // On the clock, not on a count of microtask turns — the PCM digest resolves
    // off Node's threadpool and a flush loop outruns it.
    const scanned = () => {
        const peek = r.render(Component, props, first);
        const button = buttonWith(peek.tree, 'Export .PEAK');
        return !!(button && button.props.disabled === false);
    };
    if (!await w.settle(scanned)) throw new Error('the auto-scan never finished');

    const redraw = () => r.render(Component, props, first);
    const click = (label) => {
        const button = buttonWith(redraw().tree, label);
        if (!button) throw new Error(`no control labelled ${label}`);
        if (button.props.disabled) throw new Error(`${label} is disabled, so it wrote nothing`);
        button.props.onClick();
    };
    return { w, redraw, click };
};

/** Put one line of lyric in, the only way anything ever fills `words`. */
const dictate = (ctx, line) => {
    const tabs = ctx.redraw();
    const tab = buttonWith(tabs.tree, lensTab('lyrics'));
    if (!tab) throw new Error('no lyrics lens tab');
    tab.props.onClick();
    const button = buttonWith(ctx.redraw().tree, 'Dictate Lyric Line');
    if (!button) throw new Error('the dictation control is not on the lyrics lens');
    ctx.w.window.SpeechRecognition = class {
        constructor() { this.onresult = null; this.onerror = null; this.onend = null; }
        start() { this.onresult({ results: [[{ transcript: line }]] }); }
    };
    button.props.onClick();
};

const out = {};
for (const [world, makeBuffer, withLyric] of [
    ['tone', pulsedTone, false],
    ['silence', silence, false],
    ['dictated', pulsedTone, true],
]) {
    const ctx = await openLenses(makeBuffer);
    if (withLyric) dictate(ctx, 'hello from the room');
    ctx.click('Export .PERF JSON');
    ctx.click('Export .PEAK');
    if (ctx.w.downloads.length !== 2) {
        throw new Error(`${world}: expected 2 downloads, got ${ctx.w.downloads.length}`);
    }
    out[world] = ctx.w.downloads.map((d) => ({ name: d.name, json: JSON.parse(d.text) }));
    ctx.w.cleanup();
}

const target = process.argv[2];
if (!target) throw new Error('usage: node test/emitLensExports.mjs <out.json>');
writeFileSync(target, JSON.stringify(out, null, 2));
