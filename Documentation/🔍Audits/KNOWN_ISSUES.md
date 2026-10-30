# Known Issues & Task Tracking — AUDIO.Sampler

## 🔍 Active Issues & Edge Cases
* `test/chroma.test.mjs` ("scans inside the budget") fails on a loaded machine: a 12 s budget for a
  three-minute deep scan took 13–34 s at load average 50–70 on 2026-10-30, with no code change.
* `libControl/MusicChart/LensesView.jsx` comments cite `SCAN/Web_Front/src/perfSchema.json`,
  `lensPerfExportSchema.json` and `peakSchema.ts`; the Scanalyzer front end is now
  `Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/`.
* `display.json` declares `topic` `APK.audio/Gui/Display/Sampler`; nothing publishes on it.
* Nothing in this repo checks the service worker registers on the published https origin.
