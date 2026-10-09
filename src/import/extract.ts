// Picks the right importer for a file.

import { sourceForExtension, type Source } from '../core/book'
import { decodeText } from './textDecoding'
import { htmlArticle } from './html'
import { parseEPUB } from './epub'
import { EMPTY_ERROR, ImportError, plainText, type ExtractedDocument } from './document'

export const ACCEPTED_FILES = '.txt,.text,.md,.pdf,.epub,.html,.htm,.xhtml,text/plain,application/pdf,application/epub+zip,text/html'

export interface ExtractedFile {
  document: ExtractedDocument
  fallbackTitle: string
  source: Source
}

export async function extractFile(file: File): Promise<ExtractedFile> {
  const dot = file.name.lastIndexOf('.')
  let ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : ''
  if (!ext) {
    if (file.type === 'application/pdf') ext = 'pdf'
    else if (file.type === 'application/epub+zip') ext = 'epub'
    else if (file.type === 'text/html') ext = 'html'
  }
  const data = new Uint8Array(await file.arrayBuffer())

  let document: ExtractedDocument
  switch (ext) {
    case 'pdf':
      document = await (await import('./pdf')).parsePDF(data)
      break
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
  if (!document.paragraphs.length) throw new ImportError(EMPTY_ERROR)
  return {
    document,
    fallbackTitle: dot > 0 ? file.name.slice(0, dot) : file.name,
    source: sourceForExtension(ext),
  }
}
