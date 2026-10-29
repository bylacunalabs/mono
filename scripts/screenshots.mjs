// The screenshots shown by install dialogs and the landing page
// (public/screenshots/), taken from the built app in a fresh browser:
//
//     npm run build && npm run screenshots
//
// Dark theme; the guide read up to "RSVP shows one word at a time", so the
// library shows today's words and a streak, then paused with its text in view.

import { chromium, devices } from '@playwright/test'
import { preview } from 'vite'

const SETTLED = { didAskInstall: true, didShowGestures: true, didShowRotateHint: true }

// Sizes as declared in the manifest (vite.config.ts): 780 × 1688 and 1280 × 800.
const PHONE = { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }

const SHOTS = [
  { device: PHONE, reader: 'public/screenshots/reader-narrow.png', library: 'public/screenshots/library-narrow.png' },
  {
    device: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    reader: 'public/screenshots/reader-wide.png',
  },
]

const server = await preview({ preview: { port: 4175, strictPort: true } })
const browser = await chromium.launch()
try {
  for (const shot of SHOTS) {
    const context = await browser.newContext({ ...shot.device, colorScheme: 'dark' })
    const page = await context.newPage()
    await page.addInitScript(value => localStorage.setItem('mono.settings', value), JSON.stringify(SETTLED))
    await page.goto('http://localhost:4175/app/')
    await page.getByText('Welcome to Mono').first().click()
    await page.locator('.rsvp-word').waitFor()
    await page.keyboard.press('Space')
    // Pause on the second "RSVP", which opens chapter 1.
    await page.waitForFunction(
      () => {
        const word = document.querySelector('.rsvp')?.getAttribute('aria-label')
        if (word === 'RSVP' && word !== window.lastWord) window.seen = (window.seen ?? 0) + 1
        window.lastWord = word
        return window.seen === 2
      },
      undefined,
      { polling: 'raf' },
    )
    await page.keyboard.press('Space')
    await page.waitForTimeout(800)
    await page.screenshot({ path: shot.reader })
    if (shot.library) {
      await page.getByRole('button', { name: 'Close' }).click()
      await page.waitForTimeout(1200)
      await page.screenshot({ path: shot.library })
    }
    await context.close()
  }
} finally {
  await browser.close()
  server.httpServer.close()
}
