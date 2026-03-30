/**
 * KeyQuest Service Worker
 * Cache-first strategy — serves all app files offline after first install.
 */

const CACHE_NAME = 'keyquest-v2';

// All files to cache for offline use
const CACHE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/app.js',
  '/js/lessons.js',
  '/js/keyboard.js',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

// ----- Install: cache all app files -----
self.addEventListener('install', (event) => {
  console.log('[SW] Installing KeyQuest service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app files');
        return cache.addAll(CACHE_FILES);
      })
      .then(() => {
        console.log('[SW] All files cached successfully');
        // Force immediate activation without waiting for old SW to die
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Cache install failed:', err);
      })
  );
});

// ----- Activate: clean up old caches -----
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating KeyQuest service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        // Take control of all clients immediately
        return self.clients.claim();
      })
  );
});

// ----- Fetch: cache-first strategy -----
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise fetch from network and cache it
        return fetch(event.request)
          .then((networkResponse) => {
            // Only cache valid responses
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone because response body can only be consumed once
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          })
          .catch(() => {
            // Network failed — return offline fallback if available
            return caches.match('/index.html');
          });
      })
  );
});
