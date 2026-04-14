/* CrowdPilot AI — optional offline shell (HTML, CSS, JS, JSON). */
const CACHE_NAME = 'crowdpilot-ai-v1';
const PRECACHE = [
  './',
  './index.html',
  './dashboard.html',
  './map.html',
  './assistant.html',
  './queue.html',
  './routes.html',
  './alerts.html',
  './emergency.html',
  './profile.html',
  './signin.html',
  './shared.css',
  './shared.js',
  './polish.js',
  './dashboard.js',
  './map.js',
  './assistant.js',
  './queue.js',
  './routes.js',
  './alerts.js',
  './emergency.js',
  './profile.js',
  './onboarding.js',
  './signin.js',
  './data/crowd-data.json',
  './data/routes-data.json',
  './data/alerts-data.json',
  './data/queue-data.json',
  './favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Remove outdated caches logic
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      );
    })
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isAsset =
    /\.(html|css|js|json|svg)$/i.test(path) || path.includes('/data/') || path.endsWith('/');

  if (!isAsset) return;

  // Stale-while-revalidate caching strategy
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback logic handled gracefully
        return cachedResponse;
      });
      return cachedResponse || networkFetch;
    })
  );
});
