// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header: check_case_floor.mjs
 * Purpose: Run the suite AND hold its size to a committed floor, so that
 *   "nothing broke" cannot be mistaken for "nothing ran".
 * Description: This is what `npm test` runs, therefore what `check.sh`'s sampler
 *   lane runs, and — since PLAN-584.01 — what `build.mjs`'s runTests() spawns
 *   too. It spawns `node --test` over every `test/*.test.mjs`, passes the output
 *   through untouched, and then compares the reported case and suite counts
 *   against `test/cases.baseline.json`.
 *
 *   THIS FILE IS THE ONLY WAY THE SUITE IS RUN BY A GATE. build.mjs did its own
 *   readdirSync and its own `node --test` spawn until 2026-09-07 — identical
 *   glob semantics, no floor — so the runner that decides what SHIPS was the
 *   one with nothing under it: renaming `test/chopper.test.mjs` took the suite
 *   from 222 cases / 36 suites to 201 / 32, `npm test` exited 1 and the build
 *   printed `✓ tests pass` and rewrote both bundles. Do not add a second spawn
 *   back anywhere; a floor only floors the entry point that goes through it.
 *
 *   IT EXISTS BECAUSE A GLOB-DRIVEN SUITE CANNOT TELL "NOTHING TO RUN" FROM
 *   "NOTHING BROKEN". `run_sampler` in check.sh already carries that sentence
 *   about the `--check` fallback it removed — a bench with a fresh `dist/` ran
 *   0 of 145 cases and reported PASS. The runner it was replaced with has the
 *   same hole one level down: the suite is whatever the directory listing
 *   finds, so a `.test.mjs` deleted, renamed to `.mjs`, or moved out of `test/`
 *   takes its cases out of the count and every lane stays green on the smaller
 *   number. Measured 2026-09-06: renaming `chopper.test.mjs` alone took the
 *   suite from 196 cases / 31 suites to 184 / 28, exit code 0.
 *
 *   A RATCHET, NOT A PIN. Counts may rise freely — adding tests must never
 *   need a baseline edit. They may not fall. Lowering the floor is a
 *   deliberate act with a reason attached:
 *
 *       node test/check_case_floor.mjs --set-baseline
 *
 *   A RISE IN `files` IS A GATE; A RISE IN `tests`/`suites` IS ADVICE, AND THE
 *   SPLIT IS A MEASUREMENT. This runner used to print `(risen; --set-baseline to
 *   record it)` and pass on every rise, and a line that asks for something
 *   without checking whether it happened is how the floor came to sit ten cases,
 *   two suites and a whole FILE below the tree while two sessions each left the
 *   raise to the other (PLAN-785.01). Slack in a floor is not neutral: it is the
 *   exact size of the deletion that can hide under it.
 *
 *   So which rises may be deferred was decided from what the floor has actually
 *   done. Its recorded raises are +6, +9, +1, +10 and +60 cases across
 *   2026-09-06/07 — case counts churn with ordinary work, and a gate on them
 *   would fire on almost every session that wrote a test. The FILE count does
 *   not churn: 12 → 13 → 14 → 18 → 20 in five days, five raises, each of them a
 *   deliberate new test file. And a file is the unit of the failure this runner
 *   exists for — the chopper rename above, and the empty directory below. One
 *   file of slack is one whole file's worth of deletion that stays green, so
 *   `files` gets a budget of ZERO and says so loudly; `tests` and `suites` keep
 *   the advisory line, now honestly labelled as advice rather than as a request
 *   nobody checks.
 *
 *   `--self-test` checks that verdict logic and runs no tests at all, because a
 *   gate whose decision cannot be exercised without deleting a real file is a
 *   gate nobody will exercise.
 *
 *   THE SUITE'S OWN VERDICT OUTRANKS THE COUNT. A red suite exits with the
 *   runner's status and the floor is never consulted, so a failure reports as
 *   a failure rather than as a shortfall.
 *
 *   No arguments other than `--set-baseline` are accepted. A filtered run
 *   (`--test-name-pattern`) reports fewer cases than the tree holds, and a
 *   floor that has to be switched off for the ordinary case is a floor with a
 *   door in it.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BASELINE = join(HERE, 'cases.baseline.json');

const args = process.argv.slice(2);
const setBaseline = args.includes('--set-baseline');
const selfTest = args.includes('--self-test');
const unknown = args.filter((a) => a !== '--set-baseline' && a !== '--self-test');
if (unknown.length) {
    console.error(`✗ ${unknown.join(' ')} — this runner takes --set-baseline, --self-test`);
    console.error('  and nothing else. Run `node --test test/<file>` to work on one file.');
    process.exit(2);
}

/**
 * The whole floor decision, as one pure function of two objects.
 *
 * PURE SO IT CAN BE EXERCISED. Every other way of testing this runner's verdict
 * involves deleting a real test file or hand-editing the tracked baseline in a
 * checkout other sessions share — which is the hazard CLAUDE.md §2 is about, and
 * is why the drift went unchecked long enough to reach a whole file. `--self-test`
 * below drives this and nothing else.
 *
 * Three answers, in the order they bind:
 *   `shortfall`   — something FELL. The suite got smaller; this is what the file
 *                   is for and it outranks everything.
 *   `unrecorded`  — the FILE count rose above the floor. A test file was added
 *                   and the floor was not raised with it, so the difference is
 *                   now a whole file's worth of deletion that would stay green.
 *   `ok`          — with `risen` set when tests/suites are ahead, which is
 *                   advice and deliberately not a failure: case counts churn.
 */
export const floorVerdict = (seen, floor) => {
    const keys = ['tests', 'suites', 'files'];
    const shortfalls = keys
        .filter((k) => typeof floor[k] === 'number' && seen[k] < floor[k])
        .map((k) => `${k}: ${seen[k]}, floor ${floor[k]} (${seen[k] - floor[k]})`);
    if (shortfalls.length) return { level: 'shortfall', shortfalls, risen: false };
    if (typeof floor.files === 'number' && seen.files > floor.files) {
        return { level: 'unrecorded', shortfalls: [], risen: true };
    }
    return { level: 'ok', shortfalls: [], risen: keys.some((k) => seen[k] > floor[k]) };
};

if (selfTest) {
    const at = (tests, suites, files) => ({ tests, suites, files });
    const floor = at(282, 48, 18);
    const cases = [
        ['a suite that shrank is a shortfall, whichever metric fell',
            at(281, 48, 18), 'shortfall'],
        ['a deleted file is a shortfall on files AND on the cases inside it',
            at(270, 46, 17), 'shortfall'],
        ['a shortfall outranks a rise elsewhere — something still went missing',
            at(400, 48, 17), 'shortfall'],
        ['an unrecorded new test file is a FAILURE, not a note',
            at(291, 50, 20), 'unrecorded'],
        ['cases and suites ahead of the floor is advice, and passes',
            at(291, 50, 18), 'ok'],
        ['exactly on the floor passes and says nothing',
            floor, 'ok'],
    ];
    let bad = 0;
    for (const [name, seen, want] of cases) {
        const got = floorVerdict(seen, floor).level;
        console.log(`  ${got === want ? 'ok  ' : 'FAIL'}  ${name}`);
        if (got !== want) { bad++; console.log(`        wanted ${want}, got ${got}`); }
    }
    // The advisory flag is the half that used to be the whole behaviour; assert
    // it separately, because `ok` alone does not say whether anything was said.
    const quiet = floorVerdict(floor, floor).risen === false;
    const loud = floorVerdict(at(291, 50, 18), floor).risen === true;
    console.log(`  ${quiet && loud ? 'ok  ' : 'FAIL'}  the advisory flag is set only when something rose`);
    if (!(quiet && loud)) bad++;
    console.log(bad ? `\n  ${bad} FAILURE(S)` : `\n  ${cases.length + 1} assertion(s), 0 failures`);
    process.exit(bad ? 1 : 0);
}

// Explicit filenames, not a glob — this is the only discovery left in the app,
// and it is a directory listing for a reason: glob patterns only reach the test
// runner in Node 22, and an older one takes the pattern for a literal filename
// and reports "Could not find", which is a green suite locally and a red build
// in CI over a Node version nobody thought to look at.
const files = readdirSync(HERE)
    .filter((f) => f.endsWith('.test.mjs'))
    .sort()
    .map((f) => `test/${f}`);

// NOT A SKIP. An empty test directory is the extreme of the exact failure this
// file is here to catch, so it is the loudest thing it can say.
if (!files.length) {
    console.error('✗ no test/*.test.mjs files at all — there is nothing to run,');
    console.error('  which is not the same fact as nothing being broken.');
    process.exit(1);
}

// cwd is pinned to the app root rather than inherited: the file list above is
// relative to it, and a lane that cd'd somewhere else would hand the runner
// paths that resolve to nothing — which is a 0-case green run again.
const child = spawn(process.execPath, ['--test', ...files], { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'] });

// Teed, not swallowed: the human watching this still gets the runner's output
// as it arrives, and the summary lines are parsed out of the same bytes.
let transcript = '';
child.stdout.on('data', (b) => { transcript += b; process.stdout.write(b); });
child.stderr.on('data', (b) => { transcript += b; process.stderr.write(b); });

child.on('error', (err) => {
    console.error(`✗ could not run the tests: ${err.message}`);
    process.exit(1);
});

/** The runner's own tally line, e.g. `ℹ tests 196`. Last one wins. */
const tally = (word) => {
    const hits = [...transcript.matchAll(new RegExp(`^\\s*\\u2139\\s+${word}\\s+(\\d+)\\s*$`, 'gm'))];
    return hits.length ? Number(hits[hits.length - 1][1]) : null;
};

child.on('close', (code, signal) => {
    if (code !== 0 || signal) {
        // The suite is red. That is the verdict; the count is not consulted,
        // because a failing run reports fewer passing cases for a reason that
        // has nothing to do with a deleted file.
        process.exit(code === 0 ? 1 : code);
    }

    const seen = { tests: tally('tests'), suites: tally('suites'), files: files.length };
    if (seen.tests === null || seen.suites === null) {
        console.error('✗ the runner produced no `ℹ tests` / `ℹ suites` summary — the floor');
        console.error('  cannot be checked, and an unmeasurable run is not a passing one.');
        process.exit(1);
    }

    if (setBaseline) {
        writeFileSync(BASELINE, `${JSON.stringify({
            _comment: (
                'Case-count floor for SAMPLER.LIKE.AUDIO, PLAN-571.01. `node --test` runs '
                + 'whatever test/*.test.mjs happens to be on disk, so a deleted or renamed '
                + 'test file shrinks the suite and every lane stays green on the smaller '
                + 'number. These are the counts the suite may not fall below. `tests` and '
                + '`suites` may rise without an edit here; a risen `files` FAILS until it is '
                + 'recorded, because one file of slack is one whole file of deletion that '
                + 'stays green (PLAN-785.01). Lower any of them only by deleting a test on '
                + 'purpose, with --set-baseline and a reason in the commit.'
            ),
            tests: seen.tests,
            suites: seen.suites,
            files: seen.files,
        }, null, 2)}\n`);
        console.log(`✓ floor set: ${seen.tests} case(s), ${seen.suites} suite(s), ${seen.files} file(s)`);
        process.exit(0);
    }

    if (!existsSync(BASELINE)) {
        console.error('✗ NO BASELINE at test/cases.baseline.json.');
        console.error('  Seed it: node test/check_case_floor.mjs --set-baseline');
        process.exit(1);
    }
    const floor = JSON.parse(readFileSync(BASELINE, 'utf8'));

    const verdict = floorVerdict(seen, floor);

    if (verdict.level === 'shortfall') {
        console.error('');
        console.error('✗ THE SUITE GOT SMALLER. Every case that ran passed, and cases that');
        console.error('  used to exist did not run at all:');
        for (const line of verdict.shortfalls) console.error(`      ${line}`);
        console.error('  A test file deleted, renamed off `.test.mjs`, or moved out of test/');
        console.error('  looks exactly like this. If the removal was deliberate, say so and');
        console.error('  lower the floor: node test/check_case_floor.mjs --set-baseline');
        process.exit(1);
    }

    if (verdict.level === 'unrecorded') {
        console.error('');
        console.error(`✗ ${seen.files} test file(s) on disk, floor ${floor.files}. A test file was`);
        console.error('  added and the floor was not raised with it — so the difference is now a');
        console.error(`  whole file's worth of deletion that would leave every lane green. That`);
        console.error('  is the failure this runner exists for, and it is why a risen FILE count');
        console.error('  is a gate while risen case counts are only a note (PLAN-785.01).');
        console.error('  Record it: node test/check_case_floor.mjs --set-baseline');
        process.exit(1);
    }

    console.log(`✓ ${seen.tests} case(s), ${seen.suites} suite(s), ${seen.files} file(s)`
        + ` — floor ${floor.tests}/${floor.suites}/${floor.files}`
        + (verdict.risen ? ' (cases ahead of the floor; --set-baseline records it, and'
                         + ' nothing here requires you to)' : ''));
});
