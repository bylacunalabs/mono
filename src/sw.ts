// The service worker: precaches the app for offline use, serves index.html
// for every navigation, waits for the page's go-ahead before updating (so a
// new version never swaps files under an open page) and receives what other
// apps share to Mono (Web Share Target), parking it in the IndexedDB inbox
// for the page to import.

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { addToInbox } from './storage/db'

declare const self: ServiceWorkerGlobalScope

const SHARE_TARGET = new URL('share-target', self.registration.scope).pathname

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== SHARE_TARGET) return
  event.respondWith(receiveShare(event.request))
})

async function receiveShare(request: Request): Promise<Response> {
  const text = (value: FormDataEntryValue | null) =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined
  try {
    const form = await request.formData()
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
    await addToInbox({
      title: text(form.get('title')),
      text: text(form.get('text')),
      url: text(form.get('url')),
      files,
    })
    for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'shared' })
  } catch {
    // Nothing usable was shared: just open the app.
  }
  return Response.redirect(new URL('./?action=shared', self.registration.scope).href, 303)
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// A new version activates only when the page asks (the Update banner), then
// takes over open pages, which reload. On first install this makes the page
// that installed it controlled straight away.
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
clientsClaim()
