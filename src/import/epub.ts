// Extracts reading-order text and chapter titles from an EPUB 2/3 file:
// container.xml → package (.opf) → spine documents, with titles taken from
// the EPUB 3 nav document or the EPUB 2 NCX table of contents.

import { unzipSync } from 'fflate'
import { decodeText } from './textDecoding'
import { allMatches, decodeEntities, firstMatch, htmlParagraphs } from './html'
import { ImportError, type ExtractedDocument } from './document'

const INVALID = 'This EPUB file is damaged or uses an unsupported format.'

interface ManifestItem {
  href: string
  mediaType: string
  properties: string
}

export function parseEPUB(data: Uint8Array): ExtractedDocument {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(data)
  } catch {
    throw new ImportError(INVALID)
  }
  const read = (path: string): string => {
    const bytes = files[path]
    if (!bytes) throw new ImportError(INVALID)
    return decodeText(bytes)
  }
  const tryRead = (path: string) => (files[path] ? decodeText(files[path]) : undefined)

  // 1. Locate the package document.
  const container = read('META-INF/container.xml')
  const opfPath = firstMatch(`<rootfile\\b[^>]*full-path\\s*=\\s*["']([^"']+)["']`, container)
  if (!opfPath) throw new ImportError(INVALID)
  const opf = read(opfPath)
  const baseDirectory = dirname(opfPath)

  // 2. Manifest and spine.
  const manifest = new Map<string, ManifestItem>()
  for (const tag of tags('item', opf)) {
    const id = attribute('id', tag)
    const href = attribute('href', tag)
    if (!id || !href) continue
    manifest.set(id, {
      href: resolve(href, baseDirectory),
      mediaType: attribute('media-type', tag) ?? '',
      properties: attribute('properties', tag) ?? '',
    })
  }
  const spine = tags('itemref', opf).flatMap(tag => attribute('idref', tag) ?? [])
  if (!spine.length) throw new ImportError(INVALID)

  const rawTitle = firstMatch('<dc:title[^>]*>(.*?)</dc:title>', opf)
  const title = rawTitle !== undefined ? decodeEntities(rawTitle) : undefined

  // 3. Table of contents: file path → chapter title.
  const toc = new Map<string, string>()
  const addEntry = (href: string, rawTitle: string, base: string) => {
    const path = resolve(href.split('#')[0] ?? '', base)
    const entry = htmlParagraphs(rawTitle).join(' ')
    if (!toc.has(path) && entry) toc.set(path, entry)
  }
  const nav = [...manifest.values()].find(item => item.properties.split(' ').includes('nav'))
  const navHTML = nav && tryRead(nav.href)
  if (nav && navHTML) {
    const tocNav = firstMatch('<nav\\b[^>]*toc[^>]*>(.*?)</nav>', navHTML) ?? navHTML
    for (const [href, text] of allMatches(`<a\\b[^>]*href\\s*=\\s*["']([^"']+)["'][^>]*>(.*?)</a>`, tocNav)) {
      addEntry(href, text, dirname(nav.href))
    }
  }
  if (!toc.size) {
    const ncxID = firstMatch(`<spine\\b[^>]*toc\\s*=\\s*["']([^"']+)["']`, opf)
    const ncx =
      (ncxID && manifest.get(ncxID)) ||
      [...manifest.values()].find(item => item.mediaType === 'application/x-dtbncx+xml')
    const xml = ncx && tryRead(ncx.href)
    if (ncx && xml) {
      for (const [text, src] of allMatches(`<text>(.*?)</text>.*?<content\\b[^>]*src\\s*=\\s*["']([^"']+)["']`, xml)) {
        addEntry(src, text, dirname(ncx.href))
      }
    }
  }

  // 4. Reading order.
  const paragraphs: string[] = []
  const chapters: ExtractedDocument['chapters'] = []
  for (const idref of spine) {
    const item = manifest.get(idref)
    if (!item || !item.mediaType.includes('html')) continue
    const html = tryRead(item.href)
    if (!html) continue
    const body = firstMatch('<body\\b[^>]*>(.*)</body>', html) ?? html
    const section = htmlParagraphs(body)
    if (!section.length) continue
    const chapterTitle = toc.get(item.href)
    if (chapterTitle) {
      chapters.push({ title: chapterTitle, paragraphIndex: paragraphs.length })
    } else if (!toc.size && Array.from(section[0]).length <= 80) {
      chapters.push({ title: section[0], paragraphIndex: paragraphs.length })
    }
    paragraphs.push(...section)
  }
  return { title, paragraphs, chapters }
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/** Resolves `href` (percent-encoded, possibly with `../`) against a directory inside the archive. */
function resolve(href: string, base: string): string {
  let decoded = href
  try {
    decoded = decodeURIComponent(href)
  } catch {
    // keep as is
  }
  const joined = base ? `${base}/${decoded}` : decoded
  const parts: string[] = []
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

const tags = (name: string, xml: string) => allMatches(`(<(?:\\w+:)?${name}\\b[^>]*>)`, xml).map(m => m[0])

const attribute = (name: string, tag: string) =>
  firstMatch(`\\s${name.replace(/[-]/g, '\\-')}\\s*=\\s*["']([^"']*)["']`, tag)
