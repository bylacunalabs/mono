// Extracts reading-order text and chapter titles from an EPUB 2/3 file:
// container.xml → package (.opf) → spine documents, with titles taken from
// the EPUB 3 nav document or the EPUB 2 NCX table of contents. The package
// metadata gives the title, author, year and cover image.

import { unzipSync } from 'fflate'
import { decodeText } from './textDecoding'
import { allMatches, decodeEntities, firstMatch, htmlParagraphs } from './html'
import { ImportError, yearFrom, type CoverImage, type ExtractedDocument } from './document'

const INVALID = 'This EPUB file is damaged or uses an unsupported format.'

interface ManifestItem {
  id: string
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
      id,
      href: resolve(href, baseDirectory),
      mediaType: attribute('media-type', tag) ?? '',
      properties: attribute('properties', tag) ?? '',
    })
  }
  const spine = tags('itemref', opf).flatMap(tag => attribute('idref', tag) ?? [])
  if (!spine.length) throw new ImportError(INVALID)

  const { title, author, year } = packageMetadata(opf)
  const cover = coverImage(opf, manifest, files, baseDirectory)

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
  return { title, author, year, cover, paragraphs, chapters }
}

// Metadata

interface DCElement {
  id?: string
  attributes: string
  value: string
}

/** Every `<dc:name>` element, with its text cleaned up. */
function dcElements(name: string, opf: string): DCElement[] {
  return allMatches(`<dc:${name}\\b([^>]*)>(.*?)</dc:${name}>`, opf)
    .map(([attributes, raw]) => ({ id: attribute('id', attributes), attributes, value: cleanText(raw) }))
    .filter(e => e.value)
}

/** EPUB 3 refinements: `<meta refines="#id" property="name">value</meta>`. */
function refinement(opf: string, id: string | undefined, property: string): string | undefined {
  if (!id) return undefined
  for (const [attributes, value] of allMatches('<meta\\b([^>]*[^/>])>([^<]*)</meta>', opf)) {
    if (attribute('refines', attributes) === `#${id}` && attribute('property', attributes) === property) {
      return cleanText(value)
    }
  }
  return undefined
}

export function packageMetadata(opf: string): { title?: string; author?: string; year?: string } {
  const metadata = firstMatch('<(?:\\w+:)?metadata\\b[^>]*>(.*?)</(?:\\w+:)?metadata>', opf) ?? opf

  // The main title, when the book has several (subtitle, series…).
  const titles = dcElements('title', metadata)
  const title = (titles.find(t => refinement(metadata, t.id, 'title-type') === 'main') ?? titles[0])?.value

  // Authors: creators whose role is "aut" (EPUB 2 attribute or EPUB 3
  // refinement), or every creator when no role is given.
  const creators = dcElements('creator', metadata)
  const role = (c: DCElement) => attribute('opf:role', c.attributes) ?? refinement(metadata, c.id, 'role')
  const authors = creators.filter(c => role(c) === 'aut')
  const unroled = creators.filter(c => !role(c))
  const named = (authors.length ? authors : unroled.length ? unroled : creators).map(c => c.value)
  const author = [...new Set(named)].join(', ') || undefined

  // Publication date: EPUB 2 marks it with opf:event="publication".
  const dates = dcElements('date', metadata)
  const date = dates.find(d => attribute('opf:event', d.attributes) === 'publication') ?? dates[0]
  return { title, author, year: yearFrom(date?.value) }
}

const cleanText = (raw: string) =>
  decodeEntities(raw.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').replace(/<[^>]+>/g, ''))
    .split(/\s+/u)
    .filter(Boolean)
    .join(' ')

// Cover

const COVER_NAME = /(^|[^a-z])cover/i

const isImage = (item: ManifestItem) => item.mediaType.startsWith('image/')

/**
 * The cover image: the EPUB 3 `cover-image` item, the EPUB 2
 * `<meta name="cover">` item, the first image of the guide's cover page, or
 * an image item named like a cover.
 */
export function coverImage(
  opf: string,
  manifest: Map<string, ManifestItem>,
  files: Record<string, Uint8Array>,
  baseDirectory: string,
): CoverImage | undefined {
  const items = [...manifest.values()]
  const candidates: (ManifestItem | undefined)[] = [
    items.find(item => item.properties.split(/\s+/).includes('cover-image')),
  ]
  for (const tag of tags('meta', opf)) {
    if (attribute('name', tag) !== 'cover') continue
    const content = attribute('content', tag)
    if (!content) continue
    candidates.push(manifest.get(content) ?? items.find(item => item.href === resolve(content, baseDirectory)))
  }
  // The guide's (or a manifest item's) cover page: its first image.
  const guideHref = tags('reference', opf).find(tag => attribute('type', tag)?.toLowerCase() === 'cover')
  const coverPage =
    (guideHref && attribute('href', guideHref) && resolve(attribute('href', guideHref)!.split('#')[0], baseDirectory)) ||
    items.find(item => item.mediaType.includes('html') && COVER_NAME.test(item.id + ' ' + item.href))?.href
  const pageHTML = coverPage && files[coverPage] ? decodeText(files[coverPage]) : undefined
  if (coverPage && pageHTML) {
    const src =
      firstMatch(`<img\\b[^>]*\\ssrc\\s*=\\s*["']([^"']+)["']`, pageHTML) ??
      firstMatch(`<image\\b[^>]*href\\s*=\\s*["']([^"']+)["']`, pageHTML)
    if (src) {
      const path = resolve(src, dirname(coverPage))
      candidates.push(items.find(item => item.href === path) ?? { id: '', href: path, mediaType: mediaTypeFor(path), properties: '' })
    }
  }
  candidates.push(items.find(item => isImage(item) && COVER_NAME.test(item.id + ' ' + item.href)))

  for (const item of candidates) {
    if (!item || !files[item.href]) continue
    const type = isImage(item) ? item.mediaType : mediaTypeFor(item.href)
    if (type.startsWith('image/')) return { data: files[item.href], type }
  }
  return undefined
}

function mediaTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const types: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  }
  return types[ext] ?? ''
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
