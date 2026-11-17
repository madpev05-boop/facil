// Guarda la app en caché para que abra sin internet.
// Responde desde la caché y, si hay internet, la actualiza por detrás (la versión nueva se ve al siguiente arranque).
// Cambiar C cuando cambie la lista de archivos.
const C = 'facil-v3';
const FILES = ['./', './index.html', './styles.css', './logic.js', './app.js', './manifest.webmanifest',
  './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(C).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || (e.request.mode === 'navigate' ? cache.match('./index.html') : Response.error());
  }));
});
