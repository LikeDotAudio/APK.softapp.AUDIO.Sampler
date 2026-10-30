# Architecture Notes & Technical Specs — AUDIO.Sampler

## 🛠 Technical Specifications & Integration
* **Load order, no imports.** Every module in `libControl/` registers itself on `window`
  (`window.Pads`, `window.oaBusSubscribe`, `window.OA_DRUM_KIT` …). `sources.json` is the dependency
  order; `build.mjs` compiles the `.jsx` with Babel, wraps each file in its own scope and concatenates
  the list into `dist/app.js`.
* **Three bundles.** `dist/app.js` — the whole app (106 sources). `dist/fx.js` — the effect engines and
  the three `SoundSynth` files they size against, nothing with a face (24). `dist/gui.js` — the
  faceplates only, loaded on top of `fx.js` (20). APK:OS's sound pages load `fx.js`, `fx.js + gui.js`, or
  `app.js` (`WEB.OsApi/SRC/server.py` `SOUND_SITE_PACKAGES`, `OS/Mixer/dsp/sampler-package.js`), never
  `app.js` with `fx.js`.
* **Bus.** `libControl/App/mqttBus.js`: LocalStorage is the store; on a local origin it also connects
  to `ws://<host>:9001` (override `localStorage['oa_bus_url']`) and publishes state retained. Topics:
  `APK.audio/Gui/DrumKit/<pad>/sample`, `APK.audio/Gui/DrumKit/+/eq/+` (subscribed),
  `APK.audio/Gui/DrumSets`, `APK.audio/Gui/SoundFavorites`, `APK.audio/Gui/Sequencer/<label>/…`.
* **Audio.** Web Audio. The tape delay and other per-sample units run in AudioWorklets with native-node
  fallbacks; the reverb is a convolution reverb whose program parameters are drawn into the impulse
  response (`libControl/Effects/*/`).
* **Offline.** `sw.js` precaches `dist/precache.json` when it is published, otherwise a four-entry shell,
  and caches same-origin fetches (samples) as they are used.
* **Gates.** `npm test` (`test/check_case_floor.mjs` + `test/padmeta.test.mjs`) and
  `node build.mjs --check`; `build.mjs` runs the floor runner before it writes a bundle.
