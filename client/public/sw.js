// ponytail: Native lightweight Service Worker with tier-based caching strategies
const STATIC_CACHE = 'mlh-judge-static-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/vite.svg',
  '/manifest.webmanifest'
];

// Install: Pre-cache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache warning', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Purge stale caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch handler with explicit tiered routing
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Never intercept WebSocket or Socket.io requests
  if (url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // 2. Non-GET requests (mutations) must never be served from HTTP cache
  if (request.method !== 'GET') {
    return;
  }

  // 3. Admin routes are Network-Only to protect operational integrity
  if (url.pathname.includes('/admin') || url.pathname.includes('/auth/login')) {
    event.respondWith(fetch(request));
    return;
  }

  // 4. Judging API endpoints: Network-First with offline JSON fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If response is valid, clone into cache
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Network failed: attempt to retrieve cached response
          const cached = await caches.match(request);
          if (cached) return cached;

          // Otherwise return structured offline response so client knows to check IndexedDB
          return new Response(
            JSON.stringify({ offline: true, error: 'Network unavailable (offline)' }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // 5. Static assets & Navigation (App Shell): Cache-First with Network fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-while-revalidate for HTML and app shell
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // On cache miss, fetch and cache
      return fetch(request).then((networkResponse) => {
        if (networkResponse.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.woff2'))) {
          const clone = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(async () => {
        // If navigation request fails, return cached index.html
        if (request.mode === 'navigate') {
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
