/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
)

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

// Rest-timer-done notification — sent by the server (via web-push) so it
// arrives even if the app was backgrounded or the screen was off/locked.
self.addEventListener('push', event => {
  let payload = { title: 'Treino IA', body: 'Descanso acabou!' }
  try {
    if (event.data) payload = event.data.json()
  } catch {
    // Non-JSON payload — fall back to the default text above.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'rest-timer-done',
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const existing = clients.find(c => 'focus' in c)
      if (existing) return (existing as WindowClient).focus()
      return self.clients.openWindow('/')
    }),
  )
})
