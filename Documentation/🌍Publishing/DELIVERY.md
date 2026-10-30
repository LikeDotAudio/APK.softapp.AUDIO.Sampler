# Delivery — AUDIO.Sampler

How it is built, tested and shipped, and where it lands.

| Step | What happens | Automated? |
|---|---|---|
| Build | `./build.sh` → `npm install` once (Babel), then `node build.mjs`: tests first, then `dist/app.js`, `dist/gui.js`, `dist/fx.js`, `dist/precache.json`. | no — run by whoever edits a source |
| Commit | Sources **and** the three tracked bundles together. `npm run check` says which bundle is stale. | no |
| Test (CI) | `.github/workflows/test.yml` in this repo: on push and pull request, `npm ci`, `npm test` (floor runner + `padmeta.test.mjs`), `npm run check`. Full history (`fetch-depth: 0`) because the stamp reads the last source commit. It commits nothing. | yes (added 2026-10-30; first run happens on the next push) |
| Push | Own repo `https://github.com/LikeDotAudio/APK.softapp.AUDIO.Sampler.git`, submodule of APK.audio at `PODS/POD.THIN/Softapps/AUDIO/AUDIO.Sampler`; the monorepo's `.apk.scripts/deploy_all.py` pushes every submodule and bumps pointers. | by hand |
| Site | The monorepo's `.github/workflows/ci.yml` runs `PODS/POD.THIN/WEB.Frontend-Assets/.apk.scripts/deploy.py` on push to `main`: one FTPS session uploads the checkout. `PODS/POD.THIN/OS/system/published.set.json` names what of this folder is carried (`index.html`, `manifest.json`, `sw.js`, `dist/app.js`, `dist/gui.js`, `dist/fx.js`, `libControl/Effects`, `libControl/SoundSynth`, React from `vendor/`, `ICON and LOGO`, the eight kits) and what is dropped (`vendor/mqtt.min.js`, `dist/precache.json`, the two demo tracks). It builds and tests nothing: the bytes on the site are the committed bytes. | yes, on push |
| Bench image | `PODS/POD.THIN/WEB.Frontend-Assets/Docker/Dockerfile` copies the whole Softapps tree into nginx (`/srv/www/Softapps`, alias `/APK:Softapps`); the OS sound pages on a bench load `dist/*.js` from there. `DATABASE.server.SQL` proxies `/APK:Softapps/` to it (PLAN-3421.01). Rebuild with `up-stack.sh WEB.Frontend-Assets`. | no |

**Live**: <https://apk.audio/APK%3ASoftapps/AUDIO/AUDIO.Sampler/index.html> and
<https://Sampler.Like.audio/> (both HTTP 200 on 2026-10-30). The smoke result is on the
[wiki home](../README.md).

**Not automated**: compiling the bundles (CI only checks they match), registering the service worker
on the published origin in a real browser (the old `check_sampler_service_worker.mjs` did this with
puppeteer; it went with the 2026-09-10 stack split and is not in this suite), rebuilding the bench
image, pushing.
