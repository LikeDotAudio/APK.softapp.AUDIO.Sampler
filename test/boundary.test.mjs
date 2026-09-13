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
 * Header: boundary.test.mjs
 * Purpose: Keep the front end and the back end apart, permanently.
 * Description: A separation like this survives exactly as long as something
 *   checks it. Nothing about the code stops an editor from reaching into
 *   ctx.__oaComps again next month — it would work, it would look local and
 *   reasonable in review, and the coupling would be back.
 *
 *   So this reads the display sources and fails if they name anything on the
 *   audio side. It is a lint, not a unit test, and it is the only kind of test
 *   that can defend an architectural boundary rather than a behaviour.
 *
 *   The rule: A FILE THAT DRAWS MAY NOT NAME AN AUDIO NODE.
 *
 *   What a display is allowed to say instead is the short list in
 *   useOaPlugin.js: ask for a frame, read a slot, set a parameter, plot a curve.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { BUNDLE_SOURCES } from './bundleSources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every .jsx in the app — the files whose job is to draw. */
const displayFiles = () => {
    const out = [];
    const walk = (dir) => {
        for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
            const rel = `${dir}/${e.name}`;
            if (e.isDirectory()) walk(rel);
            else if (e.name.endsWith('.jsx')) out.push(rel);
        }
    };
    walk('libControl');
    return out;
};

/**
 * Things only the audio layer may say.
 *
 * Each entry explains what to do instead, because a bare "forbidden pattern"
 * failure tells whoever hits it that they are wrong without telling them what
 * right looks like.
 */
const FORBIDDEN = [
    {
        re: /__oa(Comps|Gates|Reverbs|Delays|Retire|WorkletOk|FxReady)\b/,
        instead: 'the plugin frame — window.useOaFrame(id, idx, …) — not the context\'s private bus lists',
    },
    {
        re: /\bcreate(Gain|Oscillator|BufferSource|BiquadFilter|WaveShaper|Convolver|Delay|StereoPanner|ChannelSplitter|ChannelMerger|DynamicsCompressor|Analyser)\s*\(/,
        instead: 'nothing — a display does not build audio nodes',
    },
    {
        re: /getFloat(TimeDomain|Frequency)Data|getByte(TimeDomain|Frequency)Data/,
        instead: 'frame[LAYOUT.PEAK_L] — the back end measures once for every display',
    },
    {
        re: /\bnew\s+AudioWorkletNode\b|\baudioWorklet\b/,
        instead: 'nothing — worklets are the back end\'s business',
    },
    {
        re: /\.analysers?\b/,
        instead: 'the frame\'s PEAK_L / PEAK_R slots',
    },
];

/**
 * Files that are allowed to hold an AudioContext, because managing audio IS
 * their job. Everything else that draws must go through the plugin interface.
 */
const AUDIO_OWNERS = new Set([
    // Recording from a microphone is device work, not effect work: it has its
    // own stream, its own node chain and no plugin behind it.
    'libControl/SoundBrowser/SoundRecorder.jsx',
    // The level meter on the browser's preview player, likewise — it meters a
    // one-shot audition source that no plugin owns.
    'libControl/SoundBrowser/OaLevelMeter.jsx',
]);

describe('the front end does not reach into the back end', () => {
    test('no display file names an audio node', () => {
        const offences = [];

        for (const file of displayFiles()) {
            if (AUDIO_OWNERS.has(file)) continue;
            const src = readFileSync(join(ROOT, file), 'utf8');

            src.split('\n').forEach((line, i) => {
                // Comments are where this boundary gets explained, so they are
                // allowed to name the thing they are explaining.
                const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
                FORBIDDEN.forEach(({ re, instead }) => {
                    const hit = code.match(re);
                    if (hit) {
                        offences.push(`${file}:${i + 1}  "${hit[0]}"\n      use ${instead}`);
                    }
                });
            });
        }

        assert.deepEqual(
            offences, [],
            `A display is reaching into the audio layer:\n\n    ${offences.join('\n    ')}\n`,
        );
    });

    test('every plugin has a panel that can find it', () => {
        // A backend nobody can open is dead weight, and a panel naming a plugin
        // that does not exist renders nothing and says nothing about why.
        const all = BUNDLE_SOURCES.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');

        const registered = [...all.matchAll(/oaRegisterPlugin\(\{\s*\n\s*id:\s*'([^']+)'/g)]
            .map((m) => m[1]);
        assert.ok(registered.length >= 7, `only found ${registered.length} registrations: ${registered}`);

        // Every id a display asks for must be one that registers.
        const asked = new Set(
            [...all.matchAll(/(?:useOaFrame|useOaState|useOaParams|useOaCurve|oaPlugin(?:Set|State|Frame|Params|Preset|Presets|Curve|Layout|Units))\(\s*'([^']+)'/g)]
                .map((m) => m[1]),
        );
        asked.forEach((id) => {
            assert.ok(
                registered.includes(id),
                `a panel asks for plugin "${id}", which nothing registers`,
            );
        });
    });

    test('the audio layer does not import React', () => {
        // The other direction of the same boundary. A backend that touches
        // React cannot run in the offline renderer, cannot be tested headlessly,
        // and has quietly become a component.
        // Each effect keeps its DSP and its panel in one folder under
        // Effects/, so the boundary is no longer a directory — it is the
        // EXTENSION. A .js under Effects/ or SoundSynth/ is audio and may not
        // draw; the .jsx beside it is the panel and may not name a node (the
        // test above). useOaPlugin.js is the one deliberate crossing: it is
        // the React side of the plugin contract every panel is written to.
        const backends = BUNDLE_SOURCES.filter(
            (f) => /^libControl\/(Effects|SoundSynth)\//.test(f)
                && f.endsWith('.js')
                && !f.includes('useOaPlugin'),
        );
        assert.ok(backends.length >= 10, `only ${backends.length} backend files matched — has the layout moved?`);

        backends.forEach((f) => {
            const src = readFileSync(join(ROOT, f), 'utf8');
            src.split('\n').forEach((line, i) => {
                const code = line.replace(/\/\/.*$/, '');
                assert.ok(
                    !/\bReact\./.test(code),
                    `${f}:${i + 1} — the audio layer is using React: ${line.trim()}`,
                );
            });
        });
    });
});

/**
 * Comments are where these boundaries get explained, so they are allowed to
 * name the thing they explain. Block comments span lines, so they have to come
 * out before the file is read line by line — the per-line strip the tests above
 * use would miss every header in the rack.
 */
const codeOnly = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))   // keep line numbers
    .replace(/\/\/.*$/gm, '');

const sourceList = () => BUNDLE_SOURCES;

describe('each effect owns its own audio', () => {
    /**
     * Where each module keeps its nodes, and who is allowed to say so.
     *
     * A module's INPUT PORT is its whole public audio surface: oaReverbInput(),
     * oaDelayInput(), oaCompInput() each hand back one node to connect to. The
     * bus objects behind them — convolver, return fader, tape engine, chorus
     * insert, analysers — are file-local, and the list they live on is private.
     *
     * This is what stopped the router from reaching through a returned bus for
     * `.input`, and from counting three other modules' node lists to report how
     * many buses existed.
     */
    const OWNED = [
        { key: '__oaReverbs', owner: 'libControl/Effects/Reverb/oaReverb.js', port: 'oaReverbInput' },
        { key: '__oaDelays', owner: 'libControl/Effects/TapeDelay/oaTapeDelay.js', port: 'oaDelayInput' },
        { key: '__oaComps', owner: 'libControl/Effects/Compressor/oaCompressor.js', port: 'oaCompInput' },
        // Same bargain as the compressor, one stage earlier in the channel: a
        // gate strip is per CHANNEL rather than per voice, so it is the second
        // node list a router could be tempted to reach through.
        { key: '__oaGates', owner: 'libControl/Effects/Gate/oaGate.js', port: 'oaGateInput' },
        // The master bus is the one every other module now connects INTO, which
        // makes it the one most likely to be reached through: it would be very
        // easy for a strip to want `.fade`, or for the mixer to want its
        // analysers. Private from the first commit, for exactly that reason.
        { key: '__oaBuss', owner: 'libControl/Effects/BussCompressor/oaBussComp.js', port: 'oaMasterInput' },
    ];

    test('no module reaches into another module\'s node list', () => {
        const offences = [];
        sourceList().forEach((f) => {
            const src = codeOnly(readFileSync(join(ROOT, f), 'utf8'));
            src.split('\n').forEach((line, i) => {
                OWNED.forEach(({ key, owner, port }) => {
                    if (f === owner || !line.includes(key)) return;
                    offences.push(`${f}:${i + 1}  "${key}" belongs to ${owner}\n      use ${port}(ctx, i) — one node to connect to, nothing to reach through`);
                });
            });
        });
        assert.deepEqual(offences, [], `\n\n    ${offences.join('\n    ')}\n`);
    });

    test('the input ports are still exported', () => {
        // The rule above is only worth anything while the replacement exists.
        OWNED.forEach(({ owner, port }) => {
            const src = readFileSync(join(ROOT, owner), 'utf8');
            assert.ok(
                src.includes(`window.${port} = function`),
                `${owner} no longer exports ${port}() — the rule above has nothing to point at`,
            );
        });
    });
});

describe('the panels behave like each other', () => {
    /**
     * The panels that carry written help.
     *
     * Every one of them used to end in a standing paragraph of instructions.
     * That text is read once and is then in the way for ever — and on a short
     * screen it is what pushes the controls the panel exists for off the bottom
     * of it. They are behind a `? Help` button now, and a panel added later
     * should copy that rather than the thing it replaced.
     */
    const HELP_PANELS = [
        'libControl/Effects/Chorus/ChorusEditor.jsx',
        'libControl/Effects/Compressor/CompressorEditor.jsx',
        'libControl/Effects/BussCompressor/BussCompEditor.jsx',
        'libControl/Effects/Drive/DriveEditor.jsx',
        'libControl/Effects/TapeDelay/TapeDelayEditor.jsx',
        'libControl/Effects/Reverb/VarcRemote.jsx',
        // PLAN-18.12 step 3. The tenth plugin's panel, and the only one drawn
        // by the generic console surface rather than a hand-built faceplate —
        // it owes the same three things as the rack units regardless.
        'libControl/Effects/Equalizer/EqEditor.jsx',
    // PLAN-189.01 step 4. The ninth plugin's panel — the other one drawn by the
    // generic console surface, with a hand-drawn transfer curve because a wrong
    // transfer function has to be VISIBLE rather than merely audible.
    'libControl/Effects/Gate/GateEditor.jsx',
    ];

    test('help is behind a button, not standing under the controls', () => {
        HELP_PANELS.forEach((f) => {
            const src = readFileSync(join(ROOT, f), 'utf8');
            // Quoted either way: most write label="? Help", the VARC swaps the
            // glyph and so writes label={showHelp ? '✖ Help' : '? Help'}.
            assert.match(src, /['"][^'"]*Help['"]/, `${f} has no ? Help button`);
            assert.match(
                src, /\{showHelp && \(/,
                `${f} has a help toggle but its prose is not behind it`,
            );
        });
    });

    test('every effect panel says when it is out of circuit', () => {
        // Record arms a bypass of the whole rack. A panel that goes on looking
        // live while nothing it controls is in the signal path is the same
        // failure as a knob that turns and is not heard.
        HELP_PANELS.forEach((f) => {
            const src = readFileSync(join(ROOT, f), 'utf8');
            assert.match(src, /useOaFxBypass\(\)/, `${f} never asks whether the rack is bypassed`);
            assert.match(src, /OaOutOfCircuit/, `${f} does not show the out-of-circuit badge`);
            assert.match(src, /\.\.\.veil/, `${f} does not grey itself out`);
        });
    });
});

describe('one sample rate', () => {
    // Every module here turns seconds into samples somewhere. When each carried
    // its own fallback they disagreed — 44100 in two places, 48000 in a third —
    // and a preview bounced at one rate was drawn against a tail computed at
    // another. oaAudioRate.js owns the number; everything else asks.
    const RATE_OWNER = 'libControl/SoundSynth/oaAudioRate.js';

    test('no file hard-codes a sample-rate fallback', () => {
        const offences = [];
        sourceList().forEach((f) => {
            if (f === RATE_OWNER) return;
            const src = codeOnly(readFileSync(join(ROOT, f), 'utf8'));
            src.split('\n').forEach((line, i) => {
                // `|| 44100`, `: 48000`, `?? 44100` — a rate standing in for the
                // app's when something was missing.
                if (/(\|\||\?\?|:)\s*(44100|48000|96000|22050)\b/.test(line)) {
                    offences.push(`${f}:${i + 1}  ${line.trim()}\n      use window.oaSampleRate(ctx)`);
                }
            });
        });
        assert.deepEqual(offences, [], `\n\n    ${offences.join('\n    ')}\n`);
    });

    test('every live context is built through the shared helper', () => {
        // A second `new AudioContext()` anywhere is a second device rate: it
        // comes up at whatever the hardware defaults to, while everything
        // already built is counting in OA_SAMPLE_RATE.
        const offences = [];
        sourceList().forEach((f) => {
            if (f === RATE_OWNER) return;
            const src = codeOnly(readFileSync(join(ROOT, f), 'utf8'));
            src.split('\n').forEach((line, i) => {
                if (/new\s+\(?\s*window\.(AudioContext|webkitAudioContext)/.test(line)
                    || /new\s+AudioContext\s*\(/.test(line)) {
                    offences.push(`${f}:${i + 1}  ${line.trim()}\n      use window.oaNewAudioContext()`);
                }
            });
        });
        assert.deepEqual(offences, [], `\n\n    ${offences.join('\n    ')}\n`);
    });

    test('every offline context is built through the shared helper', () => {
        // A `new OfflineAudioContext(...)` is where a stray rate gets in, since
        // the constructor takes frames and somebody has to have multiplied.
        const allowed = new Set([
            RATE_OWNER,
            // Re-rendering an ALREADY DECODED buffer — trimming, fading,
            // pitching a loaded sample. Those run at the source buffer's own
            // rate on purpose; resampling a 44.1k sample to shave 20ms off its
            // head would be work done for nothing.
            'libControl/SoundSynth/oaDrumkitSynth.js',
        ]);
        const offences = [];
        sourceList().forEach((f) => {
            if (allowed.has(f)) return;
            const src = codeOnly(readFileSync(join(ROOT, f), 'utf8'));
            src.split('\n').forEach((line, i) => {
                if (/new\s+(\w+\.)?(Offline\w*Ctx|OfflineAudioContext|webkitOfflineAudioContext)\s*\(/.test(line)
                    || /new\s+Offline\s*\(/.test(line)) {
                    offences.push(`${f}:${i + 1}  ${line.trim()}\n      use window.oaOfflineContext(channels, seconds)`);
                }
            });
        });
        assert.deepEqual(offences, [], `\n\n    ${offences.join('\n    ')}\n`);
    });
});
