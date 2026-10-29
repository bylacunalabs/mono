// Mono used to live at the site's root, with its service worker here. The app
// is now in app/ with a worker of its own; this one replaces the old worker,
// which would otherwise keep serving the app in place of the landing page.
// It removes the old worker's caches (not app/'s), unregisters and reloads
// open pages, which then load the landing page from the network.

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const appScope = new URL('app/', self.registration.scope).href
      for (const name of await caches.keys()) {
        if (!name.includes(appScope)) await caches.delete(name)
      }
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
    })(),
  )
})
