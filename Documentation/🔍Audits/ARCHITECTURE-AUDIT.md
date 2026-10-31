# 🔍 Architecture audit — AUDIO.Sampler (2026-10-30)

Audited against the APK.audio multi-repo architecture standard: coupling, boundaries, duplication, contracts.
← [Audits](INDEX.md) · Improvements: [🛣Roadmap/IMPROVEMENTS.md](../%F0%9F%9B%A3Roadmap/IMPROVEMENTS.md)

## Bounded context
Sampler.Like.audio: the in-browser drum sampler, 16-step sequencer, channel-strip mixer, effect engines (DSP plugins) and their faceplates. Plain React (global `window.*` modules, 107 sources in `sources.json`) compiled by Babel into three committed bundles: `dist/app.js`, `dist/gui.js` and `dist/fx.js`. 353 tracked files. About 140 of them are the `SampleLibrary/` audio.

Sampled: `index.html`, `build.mjs`, `build.sh`, `package.json`, `sources*.json`, `display.json`, `libControl/App/mqttBus.js`, topic usage across `libControl/`, `test/contract.test.mjs`, `test/boundary.test.mjs`, `test/manifests.test.mjs` (by name), `.github/workflows/test.yml`. Consumers checked: `POD.THIN/OS/system/sound.modules.json` and the sibling AUDIO.* softapp pointers.

## Context map
| Talks to | How (topic / endpoint / file / import) | Relationship |
|---|---|---|
| MQTT broker | `libControl/App/mqttBus.js` (`useMqttState` / `useMqttPublish` / `oaBusSubscribe`) through the shared `window.APKBus` helper when served; localStorage is the main store and the broker is a second writer | Conformist to the bus |
| Other bus clients (OS desk console strips) | topics and payload shapes declared in `libControl/App/oaTopics.js` (`OA_BUS_PAYLOADS`) | Published Language, with a schema and a test |
| APK:OS (POD.THIN/OS) | OS loads `dist/fx.js`, `dist/gui.js`, `dist/app.js` and `vendor/react*.js` by portal path (`OS/system/sound.modules.json`) | Customer–Supplier, contract in `exports.json` (versioned, tested) |
| APK:OS sound watchdog | `index.html` loads `../../../APK:OS/Midi/site/agent/sound-agent.js` | Customer, declared in `exports.json` `consumes` |
| AUDIO.Mixer.PluginHost, AUDIO.TapeDelay, AUDIO.PROCESS.*, MIDI.DRUM.pads, AUDIO.SYNTH.Drum | pointer repos that name `AUDIO.Sampler/libControl/...` as the single home of their code | Supplier (owns the code) |
| OS launch grid | `display.json`, `Gui_Frames/4_Console/100_Sampler/Sampler.json` | Conformist |

## Scorecard
| Category | Score (0–3) | Finding |
|---|---|---|
| Coupling & Cohesion | 3 | The source tree is self-contained. Both run-time path couplings are declared in `exports.json` and tested |
| Boundary Integrity | 3 | One bus adapter (`mqttBus.js`) and one plugin-host API (`useOaPlugin`) hold the boundaries. A lint test enforces that display code never names an audio node |
| Duplication Control | 3 | Topics are built in one module; mqtt.js comes from the shared helper when served; the remaining vendored copies are recorded with version and hash for the standalone host |
| Testing & Contracts | 3 | 24 test files, 324 cases, a case floor, a bundle-staleness check and CI on every push; the bundle surface, the bus payloads and the page load are tested |
| Change management | 3 | Bundles are content-stamped and carry the contract version (`OA_*_API`, = `package.json` 1.1.0) with a semver rule. The OS side does not pin on it yet (handed off to APK:OS) |
Score key: 3 meets the standard · 2 minor gaps · 1 significant gaps · 0 absent / violated.

## Findings
1. **Good: a single bus adapter.** All bus access goes through `libControl/App/mqttBus.js`. It has a clear WHAT-THIS-OWNS / MUST-NOT contract, one broker-URL predicate (`window.oaBusUrl`), and echo suppression (`inboundTopics`). No other file in `libControl/` dials a broker.
2. **Good: the boundary is enforced by a test.** `test/boundary.test.mjs` fails if any drawing source names an audio node. `test/contract.test.mjs` checks every registered plugin's frame and slot contract against the live registry, not a hand-written list.
3. **Good: the build gate and the CI gate are one assertion.** `build.sh` runs the tests before it writes a bundle. `.github/workflows/test.yml` runs `npm test` (case floor) and `build.mjs --check`, so a stale committed bundle goes red.
4. **Good: the bundle surface is a declared, versioned contract.** `exports.json` + `test/exports.test.mjs` (see DELIVERY). Remaining on the consumer side only: APK:OS does not yet read `OA_FX_API`/`OA_GUI_API` to refuse a different major (handoff filed).

Everything else from this audit was delivered — see [🌍Publishing/DELIVERY.md](../%F0%9F%8C%8DPublishing/DELIVERY.md) "Delivered from the 2026-10-30 audit".
