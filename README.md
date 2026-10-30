# AUDIO.Sampler

> 🥁 **Sampler.Like.Audio** — a drum sampler and 16-step sequencer that runs entirely in the browser.
> Sixteen velocity pads over a loaded sample folder, chop and pitch, a sequencer and song arranger, a
> channel-strip mixer with effects, and a sound browser. MIT, by Anthony P. Kuzub —
> https://Sampler.Like.audio. It is also the one home of the effect engines and faceplates the APK:OS
> sound pages load.

---

## 🧩 Architectural Role
* **Family**: AUDIO — `PODS/POD.THIN/Softapps/AUDIO/`
* **Category**: Launch Pad group `Utilities`, sub-group `Sound` (`display.json`), `kind: "web"`, `class: "execution"`
* **Pipeline Stage**: EXECUTION (`class: "execution"`) — an instrument; and a library of DSP engines for APK:OS

---

## ⚙️ Repository Overview
An independent Git repository, registered as a submodule of APK.audio at
`PODS/POD.THIN/Softapps/AUDIO/AUDIO.Sampler`.

| Path | What it is |
|---|---|
| `index.html` | The app page: loads APK:OS's sound agent (if beside it), React from `vendor/`, then `dist/app.js` |
| `libControl/` | The source — `.jsx` and plain `window`-global `.js` modules, no imports: `App/` (app shell, `mqttBus.js`, theme, mocks), `Pads/`, `Sequencer/`, `SoundBrowser/`, `SoundSynth/` (shared kit, sample rate, pad grid), `Mixer/`, `MusicChart/` (lenses, deep scan), `Effects/` (BussCompressor, Chorus, Compressor, Drive, DrumSynth, Equalizer, FxBus, Gate, PluginHost, Reverb, TapeDelay), `Ui/`, `Header/`, `Footer/` |
| `sources.json` / `sources.gui.json` / `sources.fx.json` | The ordered source lists of the three bundles (106 / 20 / 24 files). The GUI and FX lists must stay subsequences of `sources.json` |
| `build.mjs`, `build.sh` | The build (below) |
| `dist/app.js`, `dist/gui.js`, `dist/fx.js` | The three bundles — **tracked**; `dist/precache.json` is generated and ignored |
| `test/` | `node --test` suite (`*.test.mjs`), a fake React/Web Audio harness, `cases.baseline.json` (the case floor) |
| `vendor/` | `react`, `react-dom` (production builds) and `mqtt.min.js` |
| `sw.js`, `manifest.json`, `ICON and LOGO/` | Progressive Web App: service worker, manifest, icons |
| `SampleLibrary/` | Demo samples (`APK 404` … `APK 484` kits, two demo tracks) with `.PEAK` analyzer sidecars and `sample_cloud_manifest.json` |
| `extract_note_root_beat_map.py` | CLI: root key / beat-marker / chunk map for one audio file, merged into its `.PEAK` sidecar |
| `Gui_Frames/4_Console/100_Sampler/Sampler.json` | A frame description in APK:OS's `Gui_Frames` vocabulary; nothing in this repository reads it |
| `Documentation/` | Notes, issues, and `Changelog/Audit/Performance_Tab_UI_Mockup.html` (a static UI mockup) |

### Who else loads it
APK:OS does not carry effects of its own. `WEB.OsApi/SRC/server.py` (`SOUND_SITE_PACKAGES`) and
`OS/Mixer/dsp/sampler-package.js` load this repository's bundles onto the sound pages by portal path:
the **host** page takes `dist/fx.js` (engines only), the **mixer** page takes React + `dist/fx.js` +
`dist/gui.js` (engines and faceplates), the **midi** page takes React + `dist/app.js` (the whole
Sampler). A page must not hold both `app.js` and `fx.js` — the second load re-registers every plugin.
The placeholder repos `AUDIO.Reverb`, `AUDIO.TapeDelay`, `AUDIO.Sequencer`, `AUDIO.SoundBrowser` and
`AUDIO.SoundSynth` point here for their code.

---

## 🚀 Usage & Integration
* **Web Portal Entry**: `APK:Softapps/AUDIO/AUDIO.Sampler/index.html` — served by the portal at
  `/APK:Softapps/AUDIO/AUDIO.Sampler/index.html`; also published at https://Sampler.Like.audio.
* **Run**: serve the folder over HTTP (the service worker and the sample fetches need it) and open
  `index.html`. A fresh clone runs as is — the bundles are committed.
* **Build**: `./build.sh` (installs the two Babel dev-dependencies once, then `node build.mjs`). It runs
  the test suite **first**; a red test stops the build and leaves the last good bundles in place. It
  then writes `dist/app.js`, `dist/gui.js`, `dist/fx.js` and `dist/precache.json`. Commit the bundles
  with the sources — nothing downstream rebuilds them: the parent repository's
  `.github/workflows/ci.yml` uploads the checkout as it stands.
* **Check**: `npm run check` (`node build.mjs --check [app|gui|fx]`) hashes the sources against the
  committed bundles and exits 1 if any is stale. Checked 2026-10-30: all three up to date.
* **Test**: `npm test` — `test/check_case_floor.mjs` (every `test/*.test.mjs` under `node --test`, held
  to the case/suite/file floor in `test/cases.baseline.json`) then `test/padmeta.test.mjs`. Checked
  2026-10-30: 300 cases / 52 suites / 20 files against a floor of 293/50/20, plus 12 pad-metadata
  cases, all passing.
* **Sidecar CLI**: `python3 extract_note_root_beat_map.py <audio file>` — needs `numpy` and `ffmpeg`.
  It writes the analyzer's `.PEAK` shape beside the audio and, when a full analyzer sidecar is already
  there, merges the map into it rather than overwriting it.
* **Remote Repository**: https://github.com/LikeDotAudio/APK.softapp.AUDIO.Sampler.git (branch `main`)

### The bus
`libControl/App/mqttBus.js` provides `window.useMqttState`, `useMqttMessages`, `useMqttPublish` and
`oaBusSubscribe`. LocalStorage (`mqtt_cache_<topic>`) is always the store; a broker, when there is one,
is a second writer into it.

* **Where it dials**: only from a local origin (`localhost`, `127.0.0.1`, `file:`, `192.168.*`, `10.*`)
  to `ws://<page host>:9001` (`wss` under https), or to `localStorage['oa_bus_url']` if set. On the
  public site it never dials, and `vendor/mqtt.min.js` is only fetched when it does.
* **Publishes** (retained, JSON): `APK.audio/Gui/DrumKit/<pad>/sample` (pad assignments),
  `APK.audio/Gui/DrumSets`, `APK.audio/Gui/SoundFavorites`, and under
  `APK.audio/Gui/Sequencer/<label>/` — `pattern`, `song`, `library`, `mutes`, `solos`, `trackVol`,
  `trackPan`, `masterVol`, `clickVol`.
* **Subscribes**: each topic it binds, plus `APK.audio/Gui/DrumKit/+/eq/+` (the EQ bridge,
  `libControl/Effects/Equalizer/oaEqBridge.js`).
* `display.json` declares `topic: "APK.audio/Gui/Display/Sampler"`; the app does not publish on it.

---

## 🏛 Philosophy
The principles this app follows, and where the code shows them:

* **Works with nothing behind it.** The local store is the store, not a fallback; a page that has never
  reached a broker behaves exactly as one that has. — `libControl/App/mqttBus.js` (header)
* **Do not reach for what is not there.** Off a bench it does not dial a broker (mixed content, a
  console full of red, for nothing), and it does not download the 330 KB MQTT client. "Am I on a
  bench?" is answered in one place. — `libControl/App/mqttBus.js` (`oaIsLocalOrigin`, `oaBusUrl`,
  `withMqttLib`)
* **State is retained; echoes are not sent.** Every publish is retained, because a tab opened later
  must show the move; an inbound value is applied without being published back, so two tabs agree
  instead of shouting. — `libControl/App/mqttBus.js` (`publishState`, `inboundTopics`)
* **A red test keeps the last good bundle.** The build runs the suite before writing anything, through
  the same floor-holding runner `npm test` uses, so "nothing ran" cannot pass as "nothing broke". —
  `build.mjs`, `test/check_case_floor.mjs`, `test/cases.baseline.json`
* **What ships is what is committed, and the check says when it is stale.** The bundles are tracked
  and `--check` compares them with the sources by hash. — `.gitignore`, `build.sh`, `build.mjs`
* **One home for an engine; a copy is a fork.** APK:OS loads the engines and faceplates out of this
  folder as packages (`dist/fx.js`, `dist/gui.js`) rather than carrying copies, and the sibling
  placeholder repos had their copies deleted (PLAN-3324.01). — `build.mjs`, `sources.fx.json`,
  `sources.gui.json`
* **Degrade instead of lying.** When `dist/precache.json` is not published the service worker falls
  back to a four-entry shell and warms up as samples are played; one 404 never abandons the precache.
  — `sw.js`
* **Never clobber a measurement.** The sidecar CLI merges into an existing analyzer `.PEAK` and touches
  nothing else. — `extract_note_root_beat_map.py`
* **An instrument, not a document.** Text selection and the touch callout are off everywhere except
  input fields, so a press-and-hold plays a pad. — `index.html`
* **Homage, not affiliation.** Faceplates echo classic hardware; the licence header on 100 of the
  106 bundled sources says there is no affiliation. — the file headers, `build.sh`, `index.html`
* **Where it does not hold:** Soft Apps law 2 says the bus is the only door out and an app does not read
  another app's files. APK:OS's sound pages load this repository's `dist/*.js` by path
  (`WEB.OsApi/SRC/server.py`, `OS/Mixer/dsp/sampler-package.js`): the engines are shared as files,
  not as messages.

---

## 📚 Documentation
See [`Documentation/README.md`](Documentation/README.md).

<!-- wiki:smoke -->
**Smoke test** — ✅ PASS 2/2 since 2026-10-30 12:50 EDT — [results](Documentation/%F0%9F%A7%A9Manual%20and%20Artifacts/SMOKE.md)
<!-- /wiki:smoke -->
