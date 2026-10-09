// Every supported source (.txt, .pdf, .epub, web pages, pasted text) is
// converted into the same intermediate shape: a title, a list of paragraphs
// and optional chapter starts. `prepareBook` turns that into a stored text.

import { paragraphs as splitParagraphs, tokenCount } from '../core/tokenizer'
import type { Chapter } from '../core/book'

export interface ExtractedDocument {
  title?: string
  paragraphs: string[]
  /** Chapter titles with the index of their first paragraph. */
  chapters: { title: string; paragraphIndex: number }[]
}

export class ImportError extends Error {}

export const EMPTY_ERROR = 'No readable text was found.'
export const UNREADABLE_ERROR = 'The file could not be read.'

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
  if (!document.paragraphs.length) throw new ImportError(EMPTY_ERROR)
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
