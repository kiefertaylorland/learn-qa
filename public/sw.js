const CACHE = `qa-quest-shell-v1-${self.registration.scope}`;
const offline = new URL('offline.html', self.registration.scope).href;
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(offline))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.includes('/api/') ||
    url.pathname.endsWith('/live')
  )
    return;
  // Only an anonymous offline document is cached. Account/API responses never enter Cache Storage.
  if (event.request.mode === 'navigate')
    event.respondWith(fetch(event.request).catch(() => caches.match(offline)));
});
