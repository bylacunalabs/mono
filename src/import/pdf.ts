// PDF import with pdf.js (loaded only when a PDF is picked): page text,
// rebuilt into paragraphs, plus chapters from the document outline and the
// title and author from the document information (its creation date is
// when the file was made, not when the work was published, so no year).

import { pdfParagraphs } from './pdfText'
import { ImportError, type ExtractedDocument } from './document'

/** `onProgress` is called after each page with (pages done, total pages). */
export async function parsePDF(
  data: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractedDocument> {
  const pdfjs = await import('pdfjs-dist')
  const workerURL = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerURL

  const task = pdfjs.getDocument({ data })
  let document
  try {
    document = await task.promise
  } catch {
    throw new ImportError('unreadable')
  }

  const pages: string[] = []
  for (let n = 1; n <= document.numPages; n++) {
    const page = await document.getPage(n)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      text += item.str
      if (item.hasEOL) text += '\n'
    }
    pages.push(text)
    page.cleanup()
    onProgress?.(n, document.numPages)
  }
  const { paragraphs, pageStarts } = pdfParagraphs(pages)

  const chapters: ExtractedDocument['chapters'] = []
  try {
    let outline = (await document.getOutline()) ?? []
    // A single top-level entry usually just wraps the real chapters.
    if (outline.length === 1 && outline[0].items.length) outline = outline[0].items
    for (const item of outline) {
      if (!item.title || !item.dest) continue
      const dest = typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest
      const ref = dest?.[0]
      if (ref === undefined || ref === null) continue
      const pageIndex = typeof ref === 'number' ? ref : await document.getPageIndex(ref)
      if (pageIndex < 0 || pageIndex >= pageStarts.length) continue
      chapters.push({
        title: item.title,
        paragraphIndex: Math.min(pageStarts[pageIndex], Math.max(0, paragraphs.length - 1)),
      })
    }
  } catch {
    // An unreadable outline just means no chapters.
  }

  let title: string | undefined
  let author: string | undefined
  try {
    const { info } = await document.getMetadata()
    const field = (name: string) => {
      const value = (info as Record<string, unknown>)[name]
      return typeof value === 'string' && value.trim() ? value.trim() : undefined
    }
    title = field('Title')
    author = field('Author')
  } catch {
    // no metadata
  }
  await task.destroy()
  return { title, author, paragraphs, chapters }
}
