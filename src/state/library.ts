// App-wide list of books and every way of adding to it: file picker, drag
// and drop, "Open with" (file handling) and pasted text.

import { titleFromText, type Book, type Source } from '../core/book'
import { SAMPLE_BODY, SAMPLE_TITLE } from '../core/sample'
import * as stats from '../core/stats'
import { plainText, prepareText, type ExtractedDocument } from '../import/document'
import { extractFile } from '../import/extract'
import * as db from '../storage/db'
import { settings } from './settings'
import { Store } from './store'

class Library extends Store {
  books: Book[] = []
  days: stats.Days = {}
  loaded = false
  pendingImports = 0
  errorMessage: string | undefined

  async load() {
    try {
      const [books, days] = await Promise.all([db.loadBooks(), db.loadStats()])
      this.books = books.sort((a, b) => b.dateAdded - a.dateAdded)
      this.days = days
    } catch (error) {
      this.errorMessage = `Your library couldn't be opened: ${describe(error)}`
    }
    this.loaded = true
    this.emit()
    db.requestPersistence()
    await this.seedSampleIfNeeded()
  }

  get isImporting() {
    return this.pendingImports > 0
  }

  // Adding

  async importFiles(files: File[]) {
    for (const file of files) {
      await this.add(async () => {
        return extractFile(file)
      })
    }
  }

  async addText(text: string, title?: string) {
    const trimmed = text.trim()
    await this.add(async () => ({
      document: plainText(trimmed, title),
      fallbackTitle: titleFromText(trimmed),
      source: 'text' as Source,
    }))
  }

  /** First run only: adds the built-in guide. */
  private async seedSampleIfNeeded() {
    if (settings.value.didSeedSample) return
    settings.set('didSeedSample', true)
    if (this.books.length) return
    await this.add(async () => ({
      document: plainText(SAMPLE_BODY, SAMPLE_TITLE),
      fallbackTitle: SAMPLE_TITLE,
      source: 'text' as Source,
    }))
  }

  private async add(work: () => Promise<{ document: ExtractedDocument; fallbackTitle: string; source: Source }>) {
    this.pendingImports++
    this.emit()
    try {
      const { document, fallbackTitle, source } = await work()
      const prepared = prepareText(document)
      const book: Book = {
        id: crypto.randomUUID(),
        title: prepared.title ?? fallbackTitle,
        wordCount: prepared.wordCount,
        currentIndex: 0,
        dateAdded: Date.now(),
        chapters: prepared.chapters,
        source,
        currentWord: prepared.firstWord,
      }
      await db.addBook(book, prepared.text)
      this.books = [book, ...this.books]
    } catch (error) {
      this.errorMessage = describe(error)
    } finally {
      this.pendingImports--
      this.emit()
    }
  }

  // Updating

  /** Saves the reader's position. */
  updateProgress(id: string, index: number, total: number, word: string | undefined) {
    this.update(id, { currentIndex: index, wordCount: total, currentWord: word, lastOpened: Date.now() })
  }

  rename(id: string, title: string) {
    const trimmed = title.trim()
    if (trimmed) this.update(id, { title: trimmed })
  }

  /** Back to the first word, e.g. to re-read a finished book. */
  resetProgress(id: string) {
    this.update(id, { currentIndex: 0, currentWord: undefined })
  }

  async delete(id: string) {
    this.books = this.books.filter(b => b.id !== id)
    this.emit()
    await db.deleteBook(id).catch(error => this.fail(error))
  }

  recordReading(words: number, seconds: number) {
    if (words <= 0) return
    this.days = stats.record(this.days, words, seconds)
    this.emit()
    db.saveStats(this.days).catch(error => this.fail(error))
  }

  dismissError() {
    this.errorMessage = undefined
    this.emit()
  }

  private update(id: string, changes: Partial<Book>) {
    let updated: Book | undefined
    this.books = this.books.map(b => (b.id === id ? (updated = { ...b, ...changes }) : b))
    if (!updated) return
    this.emit()
    db.saveBook(updated).catch(error => this.fail(error))
  }

  private fail(error: unknown) {
    this.errorMessage = `Your library couldn't be saved: ${describe(error)}`
    this.emit()
  }
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const library = new Library()
