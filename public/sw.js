/* Offline service worker.
 *
 * Strategy:
 *  - Navigations: network first, falling back to the cached shell. That keeps
 *    a fresh deploy from being pinned behind a stale index.html while still
 *    working with no connection.
 *  - Everything else (hashed JS/CSS/icons): cache first, since Vite's build
 *    fingerprints filenames so a cached hit is always correct.
 *
 * All user data lives in localStorage, so the app is fully usable offline
 * once the shell is cached — there is no API to fall back to.
 */

const VERSION = 'v1'
const CACHE = `pantry-${VERSION}`

// Resolved relative to the worker's own location so a sub-path deploy works.
const SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A failed pre-cache must not block activation; runtime caching recovers.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Never touch cross-origin requests — let the network handle them.
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy))
          return response
        })
        .catch(() =>
          caches
            .match('./index.html')
            .then((cached) => cached ?? caches.match('./'))
            .then(
              (cached) =>
                cached ??
                new Response('<h1>Offline</h1><p>Open the app once while online.</p>', {
                  headers: { 'Content-Type': 'text/html' },
                  status: 503,
                }),
            ),
        ),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        // Only cache real, same-origin successes.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
