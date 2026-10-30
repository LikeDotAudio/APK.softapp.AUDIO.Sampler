# Principles — AUDIO.Sampler

The ecosystem's rules are in the monorepo's
[`Documentation/🏛Philosophy/Soft Apps/readme.Soft Apps.md`](https://github.com/LikeDotAudio/APK.audio/blob/main/Documentation/%F0%9F%8F%9BPhilosophy/Soft%20Apps/readme.Soft%20Apps.md);
this page says which the Sampler keeps, where the code keeps it, and where it does not.

## Kept

1. **Works with nothing behind it.** LocalStorage (`mqtt_cache_<topic>`) is the store; a broker is
   a second writer into it, so a page that never reached one behaves the same. —
   `libControl/App/mqttBus.js` (header, `useMqttState`).
2. **Do not reach for what is not there.** "Am I on a bench?" is answered once
   (`window.oaIsLocalOrigin`, `mqttBus.js:87`); off a bench `oaBusUrl` (`:95`) returns `null`, so
   no socket is opened and `vendor/mqtt.min.js` (330 KB) is never fetched (`withMqttLib`, `:207`).
3. **State is retained; echoes are not sent.** `publishState` (`:111`) publishes retained; a value
   that arrived from the bus is marked in `inboundTopics` (`:44`, `:192`) and not published back
   (`:282`), so two tabs agree instead of shouting.
4. **A red test keeps the last good bundle** (law 7, ship the gate). `build.mjs` runs
   `test/check_case_floor.mjs` before writing anything (`runTests`, `build.mjs:128`), and that runner
   holds the suite to a case/suite/file floor (`floorVerdict`, `test/check_case_floor.mjs:112`;
   `test/cases.baseline.json`), so "nothing ran" cannot pass as "nothing broke".
5. **What ships is what is committed, and a check says when it is stale.** `dist/app.js`,
   `dist/gui.js`, `dist/fx.js` are tracked (`.gitignore`) and `npm run check` (`build.mjs --check`)
   compares each with its sources by hash. `.github/workflows/test.yml` runs it with `npm test`.
6. **One home for an engine; a copy is a fork.** The effect engines and faceplates live here once;
   APK:OS loads them as packages (`dist/fx.js`, `dist/gui.js`) and the sibling placeholder repos carry
   no copies (PLAN-3324.01; `AUDIO.SYNTH.Drum` and `MIDI.DRUM.pads` 2026-10-30). The three bundle
   lists share one dependency order — `sources.gui.json` and `sources.fx.json` are subsequences of
   `sources.json`, asserted by `test/manifests.test.mjs`.
7. **Degrade instead of lying.** `dist/precache.json` is a declared drop; `sw.js` then installs a
   four-entry shell (`sw.js:25`), adds each entry on its own so one 404 never abandons the rest, and
   warms up as samples are fetched. `test/manifests.test.mjs` holds every shell entry to a tracked file.
8. **Never clobber a measurement.** The sidecar CLI merges its map into an analyzer `.PEAK` that
   already has `metadata.analyzer_version` and touches nothing else
   (`extract_note_root_beat_map.py:276`).
9. **An instrument, not a document.** Selection and the touch callout are off outside inputs, so a
   press-and-hold plays a pad (`index.html:70`–`72`).

## Broken here

* **Law 2 — the bus is the only door out.** APK:OS's sound pages load this repository's files by
  path (`SOUND_SITE_PACKAGES` in `PODS/POD.THIN/WEB.OsApi/SRC/server.py`,
  `PODS/POD.THIN/OS/Mixer/dsp/sampler-package.js`): engines are shared as files, not messages.
* **`display.json`'s `topic`** (`APK.audio/Gui/Display/Sampler`) is declared and never published.
* **A timing test depends on the machine.** `test/chroma.test.mjs` asserts a three-minute deep scan
  finishes under 12 s; under heavy load (load average ~50–70, 2026-10-30) it took 13–34 s and the
  suite went red with no code change.

Measured against the code on 2026-10-30.
