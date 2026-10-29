import { test as base, expect, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'

/** Settings that skip the first-launch install prompt and gesture guide. */
export const SETTLED = { didAskInstall: true, didShowGestures: true, didShowRotateHint: true }

/** A page whose app starts with `settings`, failing the test on any page error. */
export const test = base.extend<{ settings: Record<string, unknown> }>({
  settings: [SETTLED, { option: true }],
  page: async ({ page, settings }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.addInitScript(value => {
      if (!localStorage.getItem('mono.settings')) localStorage.setItem('mono.settings', value)
    }, JSON.stringify(settings))
    await use(page)
    expect(errors, 'errors on the page').toEqual([])
  },
})

export { expect }

/** A small EPUB 3 with two chapters. */
export function epub(): Buffer {
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    'OEBPS/content.opf': `<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The Test Book</dc:title><dc:creator>Ada Reader</dc:creator></metadata>
<manifest>
<item id="c1" href="one.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="two.xhtml" media-type="application/xhtml+xml"/>
</manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
    'OEBPS/one.xhtml': `<html><body><h1>First Chapter</h1><p>Reading one word at a time keeps the eyes still.</p></body></html>`,
    'OEBPS/two.xhtml': `<html><body><h1>Second Chapter</h1><p>Every word is anchored on its recognition point.</p></body></html>`,
  }
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)]))))
}

/** Opens the app and waits for the library. */
export async function openLibrary(page: Page) {
  await page.goto('/app/')
  await expect(page.getByRole('heading', { name: 'Mono' })).toBeVisible()
}

/** A one-page PDF with a line of text. */
export function pdf(): Buffer {
  const stream = 'BT /F1 18 Tf 72 720 Td (Every word lands on the same spot.) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = body.length
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}
