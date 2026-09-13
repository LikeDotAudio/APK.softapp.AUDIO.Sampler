// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// Every visual representation in this project is an HOMAGE to classic hardware.
// There is no affiliation with, or endorsement by, any of the original designers
// or manufacturers; their layouts appear here only because they are familiar
// interfaces, and every name they are known by remains the property of its owner.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Service worker. build.mjs writes ./dist/precache.json — the whole machine —
 * but that file is a DECLARED DROP and never published, so on apk.audio the
 * fetch below 404s and the four-entry shell list stands in: the site WARMS UP
 * as samples are played. check_sampler_service_worker.mjs holds it there.
 */
const CACHE = 'sampler-v4';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let list = ['./', './index.html', './manifest.json', './dist/app.js'];
    try {
      const res = await fetch('./dist/precache.json', { cache: 'no-cache' });
      if (res.ok) list = await res.json();
    } catch (err) {}
    // Add individually: one 404 must not abandon the whole precache.
    await Promise.all(list.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// The app shell changes on every build; samples never do. Serving the shell
// cache-first pinned an old bundle in the browser forever — a new build only
// landed if CACHE itself was renamed. These few files go to the network first
// and fall back to cache, so an offline start still works.
const SHELL = /(\/|\/index\.html|\/dist\/app\.js|\/manifest\.json)$/;

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const isShell = e.request.mode === 'navigate' || SHELL.test(new URL(e.request.url).pathname);
    if (isShell) {
      try {
        const fresh = await fetch(e.request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(e.request, fresh.clone());
          return fresh;
        }
      } catch (err) { /* offline — fall through to the cached copy */ }
      const cached = await caches.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
    }
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      // Fold anything new (a user's own samples) into the cache as it is used.
      if (res.ok && new URL(e.request.url).origin === self.location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(e.request, res.clone());
      }
      return res;
    } catch (err) {
      if (e.request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
