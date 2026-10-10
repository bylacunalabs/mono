// Picks the right importer for a file and turns its document into what the
// library stores. Everything here runs in the import worker too, so PDF
// (pdf.js, which needs the main thread to start its own worker) lives in
// importer.ts instead.

import { sourceForExtension, type Source } from '../core/book'
import { decodeText } from './textDecoding'
import { htmlArticle } from './html'
import { parseEPUB } from './epub'
import {
  EMPTY_ERROR, ImportError, plainText, prepareText, type CoverImage, type ExtractedDocument, type PreparedText,
} from './document'

export const ACCEPTED_FILES = '.txt,.text,.md,.pdf,.epub,.html,.htm,.xhtml,text/plain,application/pdf,application/epub+zip,text/html'

export interface ExtractedFile {
  document: ExtractedDocument
  fallbackTitle: string
  source: Source
}

/** A document ready to be added to the library. */
export interface ImportedDocument {
  prepared: PreparedText
  fallbackTitle: string
  source: Source
  author?: string
  year?: string
  cover?: CoverImage
}

/** Lower-case extension, or one guessed from the media type. */
export function fileExtension(file: { name: string; type: string }): string {
  const dot = file.name.lastIndexOf('.')
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : ''
  if (ext) return ext
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === 'application/epub+zip') return 'epub'
  if (file.type === 'text/html') return 'html'
  return ''
}

export const fileTitle = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/** Any supported file except PDF. */
export async function extractFile(file: File): Promise<ExtractedFile> {
  const ext = fileExtension(file)
  const data = new Uint8Array(await file.arrayBuffer())
  let document: ExtractedDocument
  switch (ext) {
    case 'epub':
      document = parseEPUB(data)
      break
    case 'html': case 'htm': case 'xhtml': {
      const article = htmlArticle(decodeText(data))
      document = { title: article.title, paragraphs: article.paragraphs, chapters: [] }
      break
    }
    default:
      document = plainText(decodeText(data))
  }
  return checked({ document, fallbackTitle: fileTitle(file.name), source: sourceForExtension(ext) })
}

export function checked(file: ExtractedFile): ExtractedFile {
  if (!file.document.paragraphs.length) throw new ImportError(EMPTY_ERROR)
  return file
}

export function importDocument({ document, fallbackTitle, source }: ExtractedFile): ImportedDocument {
  return {
    prepared: prepareText(document),
    fallbackTitle,
    source,
    author: document.author?.trim() || undefined,
    year: document.year,
    cover: document.cover,
  }
}
