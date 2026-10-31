// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

// DEEP LINKS: `index.html#/<view>` opens the Sampler on one of its panels.
//
// WHAT THIS OWNS: the list of addresses (`OA_DEEP_LINKS`), reading one off the
// hash (`oaParseDeepLink`) and asking the page to show it (`oaApplyDeepLink`).
// It asks through the two events the panels already answer — `oa-open-tab`
// (App.jsx raises a header tab) and `oa-open-fx` (Mixer.jsx opens an effect's
// faceplate) — so no panel learns about URLs.
//
// WHO USES IT: the AUDIO.* launcher pointers (Mixer, Reverb, TapeDelay,
// Sequencer, SoundBrowser, Lenses, PluginHost, SYNTH.Drum, …) are tiles whose
// code lives here; their `app` names `APK:Softapps/AUDIO/AUDIO.Sampler/index.html#/<view>`
// so a tile opens the panel it is named for, not just the Sampler. The list is
// the contract: a renamed key is a broken tile (test/deeplink.test.mjs).
//
// An unknown or empty hash does nothing — the page opens as it always has.

(function () {
    // tabs: header tabs to raise, most important LAST (each raise goes on top).
    // fx:   an effect faceplate for the Mixer to open; `unit` is its unit or pad.
    window.OA_DEEP_LINKS = Object.freeze({
        pads: { tabs: ['PADS'] },
        sequencer: { tabs: ['SEQ'] },
        song: { tabs: ['SONG'] },
        browser: { tabs: ['EDITOR'] },
        lenses: { tabs: ['LENSES'] },
        mixer: { tabs: ['MIXER'] },
        plugins: { tabs: ['PADS', 'MIXER'] },
        reverb: { tabs: ['MIXER'], fx: { plugin: 'reverb', unit: 0 } },
        tapedelay: { tabs: ['MIXER'], fx: { plugin: 'delay', unit: 0 } },
        chorus: { tabs: ['MIXER'], fx: { plugin: 'chorus', unit: 0 } },
        buss: { tabs: ['MIXER'], fx: { plugin: 'buss', unit: 0 } },
        drumsynth: { tabs: ['MIXER'], fx: { plugin: 'drumsynth', unit: 0 } },
        compressor: { tabs: ['MIXER'], fx: { plugin: 'comp', unit: 0 } },
        eq: { tabs: ['MIXER'], fx: { plugin: 'eq', unit: 0 } },
        gate: { tabs: ['MIXER'], fx: { plugin: 'gate', unit: 0 } },
        drive: { tabs: ['MIXER'], fx: { plugin: 'drive', unit: 0 } },
    });

    /** `#/mixer`, `#mixer`, `#/Mixer/` → the entry (with its `view`), or null. */
    window.oaParseDeepLink = function (hash) {
        const view = String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[0].toLowerCase();
        const entry = view && Object.prototype.hasOwnProperty.call(window.OA_DEEP_LINKS, view)
            ? window.OA_DEEP_LINKS[view] : null;
        return entry ? Object.assign({ view }, entry) : null;
    };

    /** Show what `hash` names. Returns the entry it applied, or null. */
    window.oaApplyDeepLink = function (hash) {
        const entry = window.oaParseDeepLink(hash);
        if (!entry) return null;
        for (const tab of entry.tabs) {
            window.dispatchEvent(new CustomEvent('oa-open-tab', { detail: { tab } }));
        }
        if (entry.fx) {
            window.dispatchEvent(new CustomEvent('oa-open-fx', { detail: Object.assign({}, entry.fx) }));
        }
        return entry;
    };
})();
