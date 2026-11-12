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
 * Header: plugins.test.mjs
 * Purpose: One test pattern per plugin — what this particular box has to do.
 * Description: contract.test.mjs checks that every plugin obeys the interface;
 *   this checks that each one is still the effect it claims to be. The pattern
 *   is the same for all of them and comes in three parts:
 *
 *     BYPASS IS A WIRE. Every effect here promises that at its off setting it
 *     builds nothing, or passes the signal through untouched. That promise is
 *     easy to break by accident and impossible to notice by ear, because "very
 *     slightly wrong" sounds like nothing at all until it is stacked sixteen
 *     times.
 *
 *     THE EXTREMES ARE LEGAL. Every knob to each end of its travel, in every
 *     combination the panel allows, without an AudioParam throwing. This is
 *     where the real failures live: an exponential ramp to zero, a NaN out of a
 *     divide, a frequency above Nyquist. The fake AudioParam throws on all of
 *     them exactly as a browser does, so a voice that would have died silently
 *     in a user's session fails here instead.
 *
 *     THE DSP DOES WHAT THE PANEL SAYS. Where the processing runs in a worklet,
 *     the real process() is run over real arrays — the actual shipping DSP, not
 *     a description of it.
 */


// One file per plugin under plugins/, imported in the order the suites ran when
// they were all written here. Each registers its own top-level describe().
import './plugins/compressor.mjs';
import './plugins/bussComp.mjs';
import './plugins/reverb.mjs';
import './plugins/tapeDelay.mjs';
import './plugins/chorus.mjs';
import './plugins/drive.mjs';
import './plugins/drumSynth.mjs';
import './plugins/fxBus.mjs';
import './plugins/sampleRate.mjs';
import './plugins/saveRestore.mjs';
