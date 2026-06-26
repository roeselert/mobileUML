const CACHE = 'mobileuml-v1';

const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/notebook.js',
  './js/cell.js',
  './js/editor.js',
  './js/markdown.js',
  './js/plantuml.js',
  './js/sandbox.js',
  './js/fileio.js',
  './manifest.webmanifest',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache PlantUML diagram requests
  if (url.hostname.includes('plantuml.com')) return;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const networkReq = fetch(e.request).then(res => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => null);

      // Serve cached immediately; update in background for CDN assets
      if (cached) {
        if (url.origin !== self.location.origin) networkReq;
        return cached;
      }
      return (await networkReq) || new Response('Offline', { status: 503 });
    })
  );
});
