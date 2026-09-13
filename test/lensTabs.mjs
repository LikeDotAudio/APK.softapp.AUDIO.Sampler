// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: lensTabs.mjs
 * Purpose: ONE lookup from a lens tab's stable `id` to the label a test has to
 *   click, read out of `LensesView.jsx` itself.
 * Description: there were two, and they drifted. `lenses.test.mjs` held a
 *   hand-typed `LENS_TABS` array of six label strings and `emitLensExports.mjs`
 *   typed the third one again on its own line. Lens 3 was renamed — `Lyrics VAD`
 *   became `Lyric Dictation` under PLAN-1069.01, and before that the export key
 *   `lyrics_vad` became `lyrics` under PLAN-629.01 — and the copies were updated
 *   one at a time, so for a stretch two of PLAN-601.01's nine cases failed with
 *   `no tab labelled …` while the third file was already correct. PLAN-1038.01.
 *
 * WHY A RENAME DISARMS A TEST SILENTLY, which is the thing worth naming. A test
 * that opens a tab by its visible text does not get WEAKER when the text moves —
 * it stops running. The assertion is still written down, still counted, and can
 * never fire again. That is worse than a deleted test, because a deleted test is
 * visible in a diff.
 *
 * THE LOOKUP IS BY `id` AND THE CLICK IS BY LABEL, and both halves are
 * deliberate. `id` is the stable half and `LensesView.jsx` already carries it
 * beside every label. It is not what the harness can see: the tab buttons render
 * `{tab.label}` as their only child and carry no attribute `fakeReact`'s
 * flattener could match on, so clicking by `id` would mean adding a test-only
 * attribute to production chrome — a view carrying a suite's requirement, which
 * is the wrong direction. So the id resolves to the label HERE, once, off the
 * view's own declaration, and the suites keep clicking text.
 *
 * IT FAILS LOUDLY AND IT HAS A FLOOR. An id nothing declares throws naming every
 * id that IS declared, so the next rename arrives as a sentence rather than as
 * `no tab labelled …`; and `LENS_TABS` coming back short of `TAB_FLOOR` throws
 * too, because a regex that has stopped matching would otherwise let
 * `lenses.test.mjs` iterate an empty list and report six cases as zero passes —
 * a suite that got SMALLER, which is what `build.sh` already refuses.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW = join(HERE, '..', 'libControl', 'MusicChart', 'LensesView.jsx');

/** The declaration this reads: `{ id: 'lyrics', label: '🎙️ 3. Lyric Dictation' },` */
const DECLARATION = /\{\s*id:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'\s*\}/g;

/** How many lens tabs there must be at least. Raise it when a seventh lands. */
export const TAB_FLOOR = 6;

function readTabs() {
    const source = readFileSync(VIEW, 'utf8');
    const tabs = [];
    for (const [, id, label] of source.matchAll(DECLARATION)) tabs.push({ id, label });
    if (tabs.length < TAB_FLOOR) {
        throw new Error(
            `lensTabs.mjs found ${tabs.length} lens tab declaration(s) in ${VIEW} and expects at ` +
            `least ${TAB_FLOOR}. Either the tab array moved, or its shape changed and ` +
            `DECLARATION no longer matches it. Repair this file — do not lower TAB_FLOOR: a ` +
            `lookup that finds nothing makes every suite reading it report zero cases as a pass.`);
    }
    return tabs;
}

/** Every lens tab, in the order the view declares them. */
export const TABS = readTabs();

/** Just the labels — what `lenses.test.mjs` iterates to open all six. */
export const LENS_TABS = TABS.map((t) => t.label);

/**
 * The label to click for a tab, by its stable id.
 *
 * Throws rather than returning undefined: `buttonWith(tree, undefined)` finds
 * the first button on the panel and the test then passes against the wrong one.
 */
export function lensTab(id) {
    const found = TABS.find((t) => t.id === id);
    if (!found) {
        throw new Error(
            `lensTabs.mjs has no lens tab with id ${JSON.stringify(id)}. ` +
            `${VIEW} declares: ${TABS.map((t) => t.id).join(', ')}. ` +
            `If the tab was renamed, this is the one place that has to know.`);
    }
    return found.label;
}
