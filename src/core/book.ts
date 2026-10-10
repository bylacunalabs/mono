// Metadata describing an imported text. The text itself is stored separately
// (see storage/db.ts) so the library stays cheap to load.

export type Source = 'text' | 'pdf' | 'epub' | 'web'

export interface Chapter {
  title: string
  /** Index of the chapter's first word token. */
  wordIndex: number
}

export interface Book {
  id: string
  title: string
  wordCount: number
  /** Automatic bookmark: index of the word the reader last stopped on. */
  currentIndex: number
  dateAdded: number
  lastOpened?: number
  chapters?: Chapter[]
  source?: Source
  /** Word at the bookmark, shown in the "continue reading" card. */
  currentWord?: string
  /** The sentence around the bookmark, for the "continue reading" card. */
  currentSentence?: SentenceContext
  author?: string
  /** Publication year, e.g. "1947". */
  year?: string
  /** A cover image is stored under the book's id (see storage/db.ts). */
  hasCover?: boolean
}

/** A sentence split around one of its words. */
export interface SentenceContext {
  before: string
  word: string
  after: string
}

/** "Italo Calvino · 1979", or undefined when neither is known. */
export const byline = (b: Book) => [b.author, b.year].filter(Boolean).join(' · ') || undefined

export const SOURCE_LABEL: Record<Source, string> = { text: 'TXT', pdf: 'PDF', epub: 'EPUB', web: 'WEB' }

export function sourceForExtension(ext: string): Source {
  switch (ext.toLowerCase()) {
    case 'pdf': return 'pdf'
    case 'epub': return 'epub'
    case 'html': case 'htm': case 'xhtml': return 'web'
    default: return 'text'
  }
}

export const isFinished = (b: Book) => b.wordCount > 1 && b.currentIndex >= b.wordCount - 1

export const progress = (b: Book) => (b.wordCount > 1 ? Math.min(1, b.currentIndex / (b.wordCount - 1)) : 0)

/** Chapter containing the bookmark. */
export const currentChapter = (b: Book) => b.chapters?.findLast(c => c.wordIndex <= b.currentIndex)

/**
 * Rough time left at `wpm`. Punctuation and long-word pauses make real
 * reading ~20% slower than the raw word rate; the reader shows an exact figure.
 */
export const estimatedSecondsRemaining = (b: Book, wpm: number) =>
  ((Math.max(0, b.wordCount - b.currentIndex) * 60) / Math.max(wpm, 1)) * 1.2

/** The first few words, for untitled pasted text. */
export function titleFromText(text: string): string {
  const words = text.split(/\s+/).filter(Boolean).slice(0, 6)
  const title = words.join(' ')
  return title ? (words.length === 6 ? title + '…' : title) : 'Untitled'
}

export type LibrarySort = 'recent' | 'added' | 'title'

export const SORT_TITLES: Record<LibrarySort, string> = {
  recent: 'Recently Read',
  added: 'Recently Added',
  title: 'Title',
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function sortBooks(books: Book[], sort: LibrarySort): Book[] {
  const copy = [...books]
  switch (sort) {
    case 'recent': return copy.sort((a, b) => (b.lastOpened ?? b.dateAdded) - (a.lastOpened ?? a.dateAdded))
    case 'added': return copy.sort((a, b) => b.dateAdded - a.dateAdded)
    case 'title': return copy.sort((a, b) => collator.compare(a.title, b.title))
  }
}

/** The book to offer in "continue reading": most recently opened, started, not finished. */
export function continueReading(books: Book[]): Book | undefined {
  return books
    .filter(b => b.lastOpened !== undefined && b.currentIndex > 0 && !isFinished(b))
    .sort((a, b) => b.lastOpened! - a.lastOpened!)[0]
}
