import { epub, expect, openLibrary, pdf, test } from './fixtures'

test('the library starts with the guide, which opens in the reader', async ({ page }) => {
  await openLibrary(page)
  await page.getByText('Welcome to Mono').first().click()
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible()
  await expect(page.locator('.rsvp-word')).toBeVisible()
})

test('reading advances word by word and pauses', async ({ page }) => {
  await openLibrary(page)
  await page.getByText('Welcome to Mono').first().click()
  const word = page.locator('.rsvp')
  const first = await word.getAttribute('aria-label')
  await page.keyboard.press('Space')
  await expect(word).not.toHaveAttribute('aria-label', first ?? '')
  await page.keyboard.press('Space')
  const paused = await word.getAttribute('aria-label')
  await page.waitForTimeout(600)
  await expect(word).toHaveAttribute('aria-label', paused ?? '')
})

test('an EPUB is imported with its title and author and can be read', async ({ page }) => {
  await openLibrary(page)
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'test-book.epub',
    mimeType: 'application/epub+zip',
    buffer: epub(),
  })
  await expect(page.getByText('The Test Book').first()).toBeVisible()
  await page.getByText('The Test Book').first().click()
  await expect(page.locator('.rsvp')).toHaveAttribute('aria-label', /\S/)
})

test('a PDF is imported and read', async ({ page }) => {
  await openLibrary(page)
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'Spot.pdf',
    mimeType: 'application/pdf',
    buffer: pdf(),
  })
  await page.getByText('Spot').first().click()
  await expect(page.locator('.rsvp')).toHaveAttribute('aria-label', 'Every')
})

for (const font of ['mono', 'sans', 'serif', 'georgia']) {
  test.describe(`in ${font}`, () => {
    test.use({ settings: { didAskInstall: true, didShowGestures: true, didShowRotateHint: true, readingFont: font } })

    test('the focus letter stays on the centre line', async ({ page }) => {
      await openLibrary(page)
      await page.getByText('Welcome to Mono').first().click()
      for (let i = 0; i < 6; i++) {
        const [box, orp] = await Promise.all([
          page.locator('.rsvp').boundingBox(),
          page.locator('.rsvp-orp').boundingBox(),
        ])
        expect(box && orp).toBeTruthy()
        const centre = box!.x + box!.width / 2
        expect(Math.abs(orp!.x + orp!.width / 2 - centre)).toBeLessThan(1.5)
        await page.keyboard.press('ArrowRight')
      }
    })
  })
}

test('the app registers its service worker for app/ only', async ({ page }) => {
  await openLibrary(page)
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(new URL(scope).pathname).toBe('/app/')
})
