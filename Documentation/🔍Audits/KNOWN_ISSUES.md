# Known Issues & Task Tracking — AUDIO.Sampler

## 🔍 Active Issues & Edge Cases
* Nothing in this repo checks the service worker registers on the published https origin. `test/page.test.mjs` runs the page's script chain headless, in the suite's fake window; a real browser on the published origin is still outside the suite.
* The bus adapter (`libControl/App/mqttBus.js`) still lazy-loads its own `vendor/mqtt.min.js`; moving it onto the shared `/FrontEnd/shared/apk-bus.js` is waiting on WEB.Frontend-Assets (audit IMPROVEMENTS).

## ✅ Resolved 2026-10-30
* `display.json` declared `topic` `APK.audio/Gui/Display/Sampler` and nothing published on it — removed.
* Pads `kitMeta` JSON.parsed a bus value `mqttBus.js` had already parsed, so a kit published by another client never reached "restore" — fixed in `libControl/Pads/useSamplerState.js`, held by `test/payloads.test.mjs`.
