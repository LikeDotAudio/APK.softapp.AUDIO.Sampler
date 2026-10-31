# Architecture — AUDIO.Sampler

How to use it, and how it works inside.

## Using it

* **Open**: serve the folder over HTTP and open `index.html` (the service worker and sample fetches
  need HTTP), or use <https://apk.audio/APK%3ASoftapps/AUDIO/AUDIO.Sampler/index.html> or
  <https://Sampler.Like.audio/>. A fresh clone runs as is: the bundles are committed.
* **Play**: sixteen velocity pads over a sample kit (`APK 404` … `APK 484`, or drop your own files on
  a pad); MIDI notes from `midiBase` (36) and the numpad also hit pads. The sequencer is 16 steps per
  track with a song arranger; the mixer has one strip per pad with effect sends; the sound browser
  reads `SampleLibrary/` and `.PEAK` sidecars.
* **Edit**: change `libControl/…`, run `./build.sh` (tests first), commit sources and `dist/`.
* **Sidecar CLI**: `python3 extract_note_root_beat_map.py <audio>` (numpy + ffmpeg) writes or merges the
  root-key / beat-marker map into the file's `.PEAK`.

## How it is built

No module imports another. Every file in `libControl/` registers itself on `window`
(`window.Pads`, `window.oaBusSubscribe`, `window.OA_DRUM_KIT`, …), so **the list order is the
dependency order**. `build.mjs`:

1. runs `test/check_case_floor.mjs` (all `test/*.test.mjs` under `node --test`, held to
   `test/cases.baseline.json`); red → exit, nothing written (`--skip-tests` exists for bisecting);
2. compiles each `.jsx` with Babel (`@babel/preset-react`), wraps each file in its own scope, and
   concatenates three lists into three bundles, each stamped with a hash of its sources and
   `OA_BUILD_VERSION` from the last commit that touched a source:

| Bundle | List | Files | Who loads it |
|---|---|---:|---|
| `dist/app.js` | `sources.json` | 108 | `index.html` (this app); the OS **midi** sound page |
| `dist/fx.js` | `sources.fx.json` | 22 | the OS **host** and **mixer** sound pages — engines only |
| `dist/gui.js` | `sources.gui.json` | 18 | the OS **mixer** sound page, on top of `fx.js` — faceplates only |

   and writes `dist/precache.json` (untracked). `--check [app|gui|fx]` only compares stamps.

A page must never hold both `app.js` and `fx.js`: the second load re-registers every plugin.

## The bundle contract (`exports.json`)

APK:OS loads the bundles by path (`OS/system/sound.modules.json`) and reads `window.*` names off
them. `exports.json` is that API, written down:

* per bundle, the `globals` it must define when loaded **alone** (`app` also `includes` fx's and
  gui's), and for `fx` the plugin ids it must register (`comp drive gate eq reverb delay chorus
  drumsynth buss`, the list `OS/Mixer/dsp/sampler-package.js` checks);
* `version` — package.json's semver. Removing/renaming a name is a major bump, adding one minor.
  Each bundle announces it as `window.OA_FX_API` / `OA_GUI_API` / `OA_APP_API` (written by
  `build.mjs`; `exports.json` is part of every bundle's stamp, so a bump without a rebuild is a
  stale bundle). A consumer pins on the major;
* `consumes` — what the page takes from APK:OS (`Midi/site/agent/sound-agent.js`, loaded first by a
  relative URL; it redefines `window.oaBusUrl` when the desk frames the page).

`test/exports.test.mjs` boots each committed bundle alone in a fresh fake window
(`test/bootScripts.mjs`) and checks every name, the plugins, the API global, and that `index.html`
loads exactly the OS files `consumes` declares. `test/page.test.mjs` runs `index.html`'s own script
chain the same way and fails on a script error or a page that does not mount the App.

Third-party copies in `vendor/` are listed with version, source and sha256 in `vendor/VENDOR.json`
(React/ReactDOM 18.3.1), held by `test/manifests.test.mjs`. mqtt.js is not vendored here (WS-05).

Two monorepo contracts are pinned by `test/contracts.test.mjs`: every `oaTopics` topic equals
`Topics.gui.state(...)` from `contracts/generated/web/apk-contracts.mjs` and parses as `guiState`
(skipped, with the reason, in a standalone clone), and every static copy of the accent equals the
vendored `tokens/brand.json` (= `contracts/tokens/brand.json`); canvas and inline styles read
`window.oaAccent()` / `oaAccentRgba()`.

## Source map (`libControl/`)

| Folder | Holds |
|---|---|
| `App/` | App shell, `mqttBus.js` (bus + LocalStorage store), `oaTopics.js` (topics + payload shapes), theme, mocks |
| `Pads/` | Pad grid, MIDI/keyboard input, pitch wheel, kit sets, per-pad state |
| `Sequencer/` | Steps, song arranger, transport |
| `SoundBrowser/` | Library browser |
| `SoundSynth/` | Shared kit, sample rate (`oaAudioRate.js`), pad grid, residency |
| `Mixer/` | Channel strips, faders, knobs, per-pad sample editor |
| `MusicChart/` | Lenses, deep scan (`oaDeepScanAudio`), chroma |
| `Effects/` | `PluginHost/` (the plugin contract: `oaPlugin.js`, `useOaPlugin.js`, generated console surface), and BussCompressor, Chorus, Compressor, Drive, DrumSynth, Equalizer, FxBus, Gate, Reverb, TapeDelay — each an engine (`oa*.js`), presets, and a faceplate (`*Editor.jsx`) |
| `Ui/`, `Header/`, `Footer/` | Shared widgets and chrome |

The plugin contract: a back end measures into one `Float32Array` frame allocated at start-up; a
faceplate reads slots from it through the four hooks in `useOaPlugin.js` and never names an audio
node. Per-sample units (tape delay and others) run in AudioWorklets with native-node fallbacks; the
reverb is a convolution reverb whose program parameters are drawn into the impulse response.

## Bus

`libControl/App/mqttBus.js` provides `useMqttState`, `useMqttMessages`, `useMqttPublish`,
`oaBusSubscribe`. It reaches a broker only through the shared softapp helper `window.APKBus`
(`/FrontEnd/shared/apk-bus.js`, WEB.Frontend-Assets), which owns the seed order (`oa_bus_url`, the
shell's broker when framed, the same-origin `/mqtt` gateway door; nothing on a public origin) and the
one vendored mqtt.js. `window.oaBusUrl` names a broker only when one was named (the saved override, or
the OS sound agent's `apk-sound-port://shell`, whose `window.mqtt` port client is then used directly).
Where the helper is not served (the standalone host) there is no bus and the local store is the app.

Every topic is built by `libControl/App/oaTopics.js` (`window.oaTopics`) and every payload has a
declared shape there (`window.OA_BUS_PAYLOADS`, checked by `window.oaBusPayloadProblem(topic, payload)`).
`test/payloads.test.mjs` drives the real hooks through a fake broker and holds every publish to its
shape. A shape change that removes or retypes a field is an API change (bump `exports.json` version).

| Topic | Payload | Direction |
|---|---|---|
| `APK.audio/Gui/DrumKit/<pad>/sample` | `{ name, folder }` | publish (retained) + read |
| `APK.audio/Gui/DrumKit/<pad>/eq/<hiGain\|midGain\|loGain>` | `{ value }` dB (bare number accepted) | subscribe (`Effects/Equalizer/oaEqBridge.js`) |
| `APK.audio/Gui/DrumSets` | `{ items: { <name>: Array<null \| { name, folder?, pitch?, loop?, fade?, offset?, url? }> } }` | shared state |
| `APK.audio/Gui/SoundFavorites` | `{ items: [{ name, folder }] }` | shared state |
| `APK.audio/Gui/Sequencer/<label>/pattern` | `{ grid: number[][], bpm, steps, swing?, toneTrack?, toneRoot? }` | shared state |
| `…/Sequencer/<label>/{clickVol,masterVol}` | `{ value }` | shared state |
| `…/Sequencer/<label>/{mutes,solos}` · `{trackVol,trackPan}` | `{ items: boolean[] }` · `{ items: number[] }` | shared state |
| `…/Sequencer/<label>/{library,song}` | `{ items: [] }` | shared state |

`<label>` is the sequencer's name with every run of non-alphanumerics as `_` (`oaTopics.seqSegment`).

## Deep links

`index.html#/<view>` opens the page on one panel (`libControl/App/oaDeepLink.js`, on load and on
`hashchange`): `pads`, `sequencer`, `song`, `browser` (sound browser), `lenses`, `mixer`, `plugins`
(pads + mixer), and the effect faceplates in the Mixer — `reverb`, `tapedelay`, `chorus`, `buss`,
`drumsynth`, `compressor`, `eq`, `gate`, `drive` (unit / pad 0). It raises tabs through `oa-open-tab`
and opens a faceplate through `oa-open-fx` (Mixer.jsx), so no panel reads the URL. The list is
declared in `exports.json` (`bundles.app.deepLinks`) because the AUDIO.* launcher tiles link to it;
`test/deeplink.test.mjs` holds it, and that each effect link really opens its editor.

## Pitch detection

`oaEstimatePitch` (`MusicChart/oaScanMeasure.js`) runs the shared detector
`window.PitchDetect.autoCorrelate` (`/FrontEnd/shared/pitch-detect.js`, WEB.Frontend-Assets), loaded
when the page is served under `/APK:Softapps/`; elsewhere (standalone host, the scan worker, tests)
`oaAutoCorrelateLocal`, the same algorithm, answers. `test/pitch.test.mjs` holds the two identical.
On top of it the estimator keeps its own refusals: 55–1000 Hz, a clarity floor, the median of 16 windows.

## Offline

`sw.js` (`CACHE` `sampler-v4`): install precaches `dist/precache.json` if served, else the shell
`./`, `./index.html`, `./manifest.json`, `./dist/app.js`; shell requests go network-first, everything
else cache-first, and same-origin fetches (samples) are folded into the cache as they are used.

## Other files

`Gui_Frames/4_Console/100_Sampler/Sampler.json` is a frame description in APK:OS's vocabulary that
nothing here reads. `Documentation/📌Changelogs/Audit/Performance_Tab_UI_Mockup.html` is a static mockup.
