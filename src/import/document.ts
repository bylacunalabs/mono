// Every supported source (.txt, .pdf, .epub, web pages, pasted text) is
// converted into the same intermediate shape: a title, a list of paragraphs
// and optional chapter starts. `prepareBook` turns that into a stored text.

import { paragraphs as splitParagraphs, tokenCount } from '../core/tokenizer'
import type { Chapter } from '../core/book'

export interface ExtractedDocument {
  title?: string
  author?: string
  /** Publication year, e.g. "1947". */
  year?: string
  cover?: CoverImage
  paragraphs: string[]
  /** Chapter titles with the index of their first paragraph. */
  chapters: { title: string; paragraphIndex: number }[]
}

export interface CoverImage {
  data: Uint8Array
  /** Media type, e.g. "image/jpeg". */
  type: string
}

/** The four-digit year in a date such as "1979-03-01" or "March 1979". */
export function yearFrom(date: string | undefined): string | undefined {
  return date?.match(/(?:^|\D)(1[0-9]{3}|20[0-9]{2})(?!\d)/)?.[1]
}

/** What went wrong, so the interface can say it in its own language. */
export type ImportProblem = 'empty' | 'unreadable' | 'invalidEPUB' | 'worker'

const IMPORT_MESSAGES: Record<ImportProblem, string> = {
  empty: 'No readable text was found.',
  unreadable: 'The file could not be read.',
  invalidEPUB: 'This EPUB file is damaged or uses an unsupported format.',
  worker: 'The import worker failed.',
}

export class ImportError extends Error {
  constructor(readonly problem: ImportProblem) {
    super(IMPORT_MESSAGES[problem])
  }
}

export function plainText(text: string, title?: string): ExtractedDocument {
  const paragraphs = splitParagraphs(text)
  const chapters = paragraphs.flatMap((p, i) => (isChapterHeading(p) ? [{ title: p, paragraphIndex: i }] : []))
  return { title, paragraphs, chapters }
}

const CHAPTER_HEADING =
  /^(chapter|capitolo|cap\.|parte|part|libro|book)\s+([0-9]+|[ivxlcdm]+|[a-zà-ù]+)\b|^(prologo|prologue|epilogo|epilogue|introduzione|introduction|prefazione|preface)\b/iu

/** "Capitolo 3", "CHAPTER IV", "Parte prima – Il viaggio", "Prologo"… */
export function isChapterHeading(paragraph: string): boolean {
  return Array.from(paragraph).length <= 60 && CHAPTER_HEADING.test(paragraph)
}

export interface PreparedText {
  /** Normalised text: one paragraph per line, blank line between paragraphs. */
  text: string
  title?: string
  wordCount: number
  chapters?: Chapter[]
  firstWord?: string
}

/**
 * Normalises the document and maps chapter starts to word indices, so they
 * always match what the reader tokenizes later.
 */
export function prepareText(document: ExtractedDocument): PreparedText {
  if (!document.paragraphs.length) throw new ImportError('empty')
  const paragraphStarts: number[] = []
  let wordCount = 0
  for (const paragraph of document.paragraphs) {
    paragraphStarts.push(wordCount)
    wordCount += tokenCount(paragraph)
  }
  let chapters = document.chapters
    .filter(c => c.paragraphIndex >= 0 && c.paragraphIndex < paragraphStarts.length)
    .map(c => ({ title: c.title, wordIndex: paragraphStarts[c.paragraphIndex] }))
  // A single chapter adds nothing to navigation.
  if (chapters.length < 2) chapters = []
  const title = document.title?.trim() || undefined
  return {
    text: document.paragraphs.join('\n\n'),
    title,
    wordCount,
    chapters: chapters.length ? chapters : undefined,
    firstWord: document.paragraphs[0]?.split(' ')[0],
  }
}
