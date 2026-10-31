# Known Issues & Task Tracking — AUDIO.Sampler

## 🔍 Active Issues & Edge Cases
* Nothing in this repo checks the service worker registers on the published https origin. `test/page.test.mjs` runs the page's script chain headless, in the suite's fake window; a real browser on the published origin is still outside the suite.
* The standalone host (Sampler.Like.audio) does not serve `/FrontEnd/shared/apk-bus.js`, so there it has no bus at all — by design since the SDK audit (WS-05); the local store is the whole app there, as it always was on a public origin.

## ✅ Resolved 2026-10-30
* `display.json` declared `topic` `APK.audio/Gui/Display/Sampler` and nothing published on it — removed.
* Pads `kitMeta` JSON.parsed a bus value `mqttBus.js` had already parsed, so a kit published by another client never reached "restore" — fixed in `libControl/Pads/useSamplerState.js`, held by `test/payloads.test.mjs`.
