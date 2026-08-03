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

const VERSION = 'v2'
const CACHE = `pantry-${VERSION}`

/**
 * `ignoreVary` is essential, not a tweak.
 *
 * Vite emits <script crossorigin>, so the page requests its own bundle with an
 * `Origin` header. Static hosts commonly answer with `Vary: Origin`. Entries
 * precached by the worker carry no Origin, so a strict match rejects them and
 * the request falls through to a network that isn't there — the app shell is
 * cached, and the app is still blank offline. Everything here is same-origin,
 * so ignoring Vary is safe.
 */
const MATCH_OPTS = { ignoreVary: true }

// Resolved relative to the worker's own location so a sub-path deploy works.
const SHELL = ['./', './index.html', './manifest.webmanifest']

/**
 * Reads index.html and returns the assets it references.
 *
 * This matters more than it looks: a service worker does not control the page
 * that registers it, so on a first visit the hashed JS and CSS are fetched
 * around the worker and never enter the cache. Without this, going offline
 * after one visit yields a blank page — the shell is cached but the script
 * that fills it is not. Parsing the entry document keeps the worker honest
 * about whatever filenames the build produced, with no build-time coupling.
 */
async function precacheAssets(cache) {
  const response = await fetch('./index.html', { cache: 'reload' })
  if (!response.ok) return
  // Clone before reading: a Response body can only be consumed once, and
  // cloning afterwards throws.
  const copy = response.clone()
  const html = await response.text()
  await cache.put('./index.html', copy)

  const urls = new Set()
  const attr = /(?:src|href)\s*=\s*["']([^"']+)["']/gi
  let match
  while ((match = attr.exec(html))) {
    const url = match[1]
    // Same-origin, non-anchor references only.
    if (!url || url.startsWith('#') || url.startsWith('data:') || /^https?:/i.test(url)) continue
    urls.add(url)
  }

  await Promise.all(
    [...urls].map((url) => cache.add(url).catch(() => undefined)),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(SHELL).catch(() => undefined)
        await precacheAssets(cache).catch(() => undefined)
      })
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
            .match('./index.html', MATCH_OPTS)
            .then((cached) => cached ?? caches.match('./', MATCH_OPTS))
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
    caches.match(request, MATCH_OPTS).then((cached) => {
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
