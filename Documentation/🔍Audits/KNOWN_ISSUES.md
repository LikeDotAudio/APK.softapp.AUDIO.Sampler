# Known Issues & Task Tracking — AUDIO.Sampler

## 🔍 Active Issues & Edge Cases
* No CI runs `npm test` or `build.mjs --check`; the parent repository's `ci.yml` uploads the checkout as
  it stands. A source edit committed without `./build.sh` ships the old bundle.
* Comments in `build.mjs`, `test/check_case_floor.mjs`, `sw.js` and `.gitignore` cite `check.sh`,
  `check_mixer_dsp.mjs` and `check_sampler_service_worker.mjs`; none of those exists in the tree any
  in the checkout (copies survive only in an old worktree under `~/.cache/apk.audio/worktrees/`). So
  the rule that `sources.gui.json` and `sources.fx.json` stay subsequences of `sources.json` is checked
  by nothing — it holds on 2026-10-30 — and neither is the service worker's fallback.
* `extract_note_root_beat_map.py`'s docstring cites `APK:Softapps/SCAN/Web_Front/src/analyzerPeakSchema.json`
  and `Scananalyzers/Musical/note_map.rs`; they now live at
  `Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/src/analyzerPeakSchema.json` and
  `Softapps/PROCESSOR/PROCESSOR.SampleAnalyzer/src/Scananalyzers/Musical/note_map.rs`.
