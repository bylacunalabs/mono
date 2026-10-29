import { expect, test } from './fixtures'

test('the landing page demo reads and follows the speed', async ({ page }) => {
  await page.goto('/')
  const reticle = page.locator('#reticle')
  // The demo plays once it's in view.
  await reticle.scrollIntoViewIfNeeded()
  await expect(reticle).toHaveAttribute('aria-label', /\S/)
  const first = await reticle.getAttribute('aria-label')
  await expect(reticle).not.toHaveAttribute('aria-label', first ?? '')

  await page.locator('#speed').fill('600')
  await expect(page.locator('#wpm-value')).toHaveText('600')
  await expect(page.locator('#t-novel')).toHaveText('2.5 h')
})

test('the landing page links to the app and the brand guidelines', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Brand' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('One red o')
  await page.getByRole('link', { name: 'Open Mono' }).first().click()
  await expect(page).toHaveURL(/\/app\/$/)
})

test('the root service worker retires itself and keeps the app’s caches', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    await caches
      .open('workbox-precache-v2-' + new URL('app/', location.href).href)
      .then(c => c.put('/x', new Response('x')))
    await caches.open('old-app-cache').then(c => c.put('/y', new Response('y')))
    const registration = await navigator.serviceWorker.register('/sw.js')
    await new Promise(resolve => setTimeout(resolve, 1500))
    return {
      registrations: (await navigator.serviceWorker.getRegistrations()).map(r => r.scope),
      caches: await caches.keys(),
      unregistered: !(await navigator.serviceWorker.getRegistration('/'))?.active && registration !== undefined,
    }
  })
  expect(result.registrations).toEqual([])
  expect(result.caches.some(name => name.includes('/app/'))).toBe(true)
  expect(result.caches).not.toContain('old-app-cache')
})
