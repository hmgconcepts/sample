/**
 * School Connect — Service Worker v8
 * Caches: HTML, CSS, JS, fonts, images. Offline fallback: offline.html.
 * Strategy: Cache-first for assets, network-first for HTML.
 */
const CACHE_NAME = 'sc-v8-2026-07-23';
const PRECACHE_URLS = [
  './',
  './index.html',
  './login.html',
  './dashboard.html',
  './offline.html',
  './assets/css/style.css',
  './assets/js/config.js',
  './assets/js/app.js',
  './assets/js/crud.js',
  './assets/img/logo.svg',
  './manifest.json'
];

// Install: cache each shell asset independently. cache.addAll() is atomic,
// so one unavailable optional resource must not leave the offline cache empty.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    const results = await Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed) console.warn('[SW] Skipped', failed, 'unavailable precache resource(s)');
    await self.skipWaiting();
  }));
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for assets, network-first for navigation
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests (CDN fonts, etc. handled separately)
  if (url.origin !== location.origin && !url.href.includes('fonts.googleapis') && !url.href.includes('fonts.gstatic')) {
    return;
  }

  // Navigation: network-first WITH A 4-SECOND TIMEOUT (ENTERPRISE V8, issue 14:
  // on slow/patchy networks the cached page is served instead of hanging),
  // falling back to cache, then offline.html.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      try {
        const net = await Promise.race([
          fetch(request),
          new Promise((_, rej) => setTimeout(() => rej(new Error('slow-network')), 4000))
        ]);
        const clone = net.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return net;
      } catch (e) {
        if (cached) return cached;
        return (await caches.match('./offline.html')) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // Assets: stale-while-revalidate (ENTERPRISE V8, issue 14) — serve the cached
  // copy INSTANTLY on slow networks while refreshing it in the background.
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then(cached => {
        const refresh = fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || refresh;
      })
    );
  }
});

// Push notification handler
self.addEventListener('push', event => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'School Connect';
    const body = data.body || 'You have a new notification';
    const icon = data.icon || './assets/img/logo.svg';
    const url = data.url || './';

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon,
        badge: './assets/img/logo.svg',
        data: { url },
        requireInteraction: false,
        vibrate: [200, 100, 200]
      })
    );
  } catch (e) {
    console.warn('[SW] Push handler failed:', e.message);
  }
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});

console.log('[SW] School Connect service worker loaded — v8');
