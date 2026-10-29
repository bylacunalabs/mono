// App-wide list of books and every way of adding to it: file picker, drag
// and drop, "Open with" (file handling), sharing to Mono (share target),
// pasted text and restoring a backup. Other open tabs are told about every
// change so they show the same library. Deleting can be undone for a few
// seconds: the text leaves the list at once and the disk only afterwards.

import { BackupError, booksToRestore, mergeStats } from '../core/backup'
import { titleFromText, type Book, type SentenceContext, type Source } from '../core/book'
import { SAMPLE_BODY, SAMPLE_BODY_IT, SAMPLE_TITLE, SAMPLE_TITLE_IT } from '../core/sample'
import * as stats from '../core/stats'
import { ImportError, plainText } from '../import/document'
import { importDocument, type ImportedDocument } from '../import/extract'
import { importFile } from '../import/importer'
import { createBackup, readBackup, restoreBooks } from '../storage/backup'
import * as db from '../storage/db'
import { covers, coverThumbnail } from './covers'
import { language, t } from './i18n'
import { settings } from './settings'
import { Store } from './store'

/** How long a deletion can be undone. */
export const UNDO_SECONDS = 6

/** The built-in guide in each language, seeded in the language of the first launch. */
const SAMPLES = {
  en: { title: SAMPLE_TITLE, body: SAMPLE_BODY },
  it: { title: SAMPLE_TITLE_IT, body: SAMPLE_BODY_IT },
}
const SAMPLE_TITLES = new Set(Object.values(SAMPLES).map(sample => sample.title))

export interface LibraryError {
  title: string
  message: string
}

class Library extends Store {
  books: Book[] = []
  days: stats.Days = {}
  loaded = false
  pendingImports = 0
  /** Pages read so far while a long PDF is read. */
  importProgress: { done: number; total: number } | undefined
  error: LibraryError | undefined
  /** Deleted, but still within its undo window. */
  pendingDeletion: Book | undefined
  private deletionTimer: ReturnType<typeof setTimeout> | undefined

  private channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('mono-library') : undefined

  constructor() {
    super()
    this.channel?.addEventListener('message', () => this.reload())
    // Leaving the app ends the undo window: don't lose a deletion.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.commitDeletion()
    })
  }

  async load() {
    await this.reload()
    this.loaded = true
    this.emit()
    db.requestPersistence()
    await this.seedSampleIfNeeded()
    await this.importShared()
  }

  /** Reads the library from disk again, e.g. after another tab changed it. */
  private async reload() {
    try {
      const [books, days] = await Promise.all([db.loadBooks(), db.loadStats()])
      this.books = books.filter(b => b.id !== this.pendingDeletion?.id).sort((a, b) => b.dateAdded - a.dateAdded)
      this.days = days
    } catch (error) {
      this.error = { title: t.libraryUnavailable, message: t.libraryNotOpened(describe(error)) }
    }
    this.emit()
  }

  /** Tells the other tabs to reload. */
  private broadcast() {
    this.channel?.postMessage('changed')
  }

  get isImporting() {
    return this.pendingImports > 0
  }

  // Adding

  async importFiles(files: File[]) {
    for (const file of files) {
      await this.add(() =>
        importFile(file, (done, total) => {
          this.importProgress = total > 5 ? { done, total } : undefined
          this.emit()
        }),
      )
    }
  }

  async addText(text: string, title?: string) {
    const trimmed = text.trim()
    await this.add(async () =>
      importDocument({
        document: plainText(trimmed, title),
        fallbackTitle: titleFromText(trimmed, t.untitled),
        source: 'text' as Source,
      }),
    )
  }

  /** Imports whatever was shared to Mono from other apps (see sw.ts). */
  async importShared() {
    let items: db.SharedItem[]
    try {
      items = await db.takeInbox()
    } catch {
      return
    }
    for (const item of items) {
      if (item.files.length) {
        await this.importFiles(item.files)
        continue
      }
      const text = item.text?.trim()
      if (text) await this.addText(item.url && !text.includes(item.url) ? `${text}\n\n${item.url}` : text, item.title)
      else if (item.url) {
        this.fail(t.nothingToRead, t.noWebPages)
      }
    }
  }

  /** First run only: adds the built-in guide. */
  private async seedSampleIfNeeded() {
    if (settings.value.didSeedSample) return
    if (this.books.length) return settings.set('didSeedSample', true)
    // Flag it only once added, so a failed first attempt is retried.
    const { title, body } = SAMPLES[language]
    const added = await this.add(async () =>
      importDocument({
        document: plainText(body, title),
        fallbackTitle: title,
        source: 'text' as Source,
      }),
    )
    if (added) settings.set('didSeedSample', true)
  }

  /** Imports one document; false if it failed (the error is shown). */
  private async add(work: () => Promise<ImportedDocument>): Promise<boolean> {
    this.pendingImports++
    this.emit()
    try {
      const { prepared, fallbackTitle, source, author, year, cover } = await work()
      const thumbnail = cover ? await coverThumbnail(cover) : undefined
      const book: Book = {
        id: newID(),
        title: prepared.title ?? fallbackTitle,
        wordCount: prepared.wordCount,
        currentIndex: 0,
        dateAdded: Date.now(),
        chapters: prepared.chapters,
        source,
        currentWord: prepared.firstWord,
        author,
        year,
        hasCover: thumbnail ? true : undefined,
      }
      await db.addBook(book, prepared.text, thumbnail)
      this.books = [book, ...this.books]
      this.broadcast()
      return true
    } catch (error) {
      this.fail(t.importFailed, describe(error))
      return false
    } finally {
      this.pendingImports--
      if (!this.pendingImports) this.importProgress = undefined
      this.emit()
    }
  }

  // Updating

  /** Saves the reader's position. */
  updateProgress(id: string, index: number, total: number, word: string | undefined, sentence?: SentenceContext) {
    this.update(id, {
      currentIndex: index,
      wordCount: total,
      currentWord: word,
      currentSentence: sentence,
      lastOpened: Date.now(),
    })
  }

  rename(id: string, title: string) {
    const trimmed = title.trim()
    if (trimmed) this.update(id, { title: trimmed })
  }

  /** Back to the first word, e.g. to re-read a finished book. */
  resetProgress(id: string) {
    this.update(id, { currentIndex: 0, currentWord: undefined, currentSentence: undefined })
  }

  /** Removes a text from the list; it's deleted from disk once the undo window closes. */
  delete(id: string) {
    void this.commitDeletion()
    const book = this.books.find(b => b.id === id)
    if (!book) return
    this.books = this.books.filter(b => b.id !== id)
    this.pendingDeletion = book
    this.deletionTimer = setTimeout(() => void this.commitDeletion(), UNDO_SECONDS * 1000)
    this.emit()
  }

  undoDelete() {
    const book = this.pendingDeletion
    if (!book) return
    clearTimeout(this.deletionTimer)
    this.pendingDeletion = undefined
    this.books = [...this.books, book].sort((a, b) => b.dateAdded - a.dateAdded)
    this.emit()
  }

  /** Deletes the pending text for good. */
  async commitDeletion() {
    const book = this.pendingDeletion
    if (!book) return
    clearTimeout(this.deletionTimer)
    this.pendingDeletion = undefined
    this.emit()
    covers.forget(book.id)
    await db.deleteBook(book.id).then(
      () => this.broadcast(),
      error => this.saveFailed(error),
    )
  }

  recordReading(words: number, seconds: number) {
    if (words <= 0) return
    this.days = stats.record(this.days, words, seconds)
    this.emit()
    db.saveStats(this.days).then(
      () => this.broadcast(),
      error => this.saveFailed(error),
    )
  }

  // Backup

  /** The whole library, statistics and settings as a backup file. */
  async backup(): Promise<Blob> {
    await this.commitDeletion()
    return createBackup({ ...settings.value })
  }

  /** Merges a backup file into the library; resolves to the number of texts added or updated. */
  async restore(file: File): Promise<number | undefined> {
    try {
      await this.commitDeletion()
      const backup = await readBackup(file)
      // On a fresh install, bring the preferences along too.
      if (this.books.every(b => SAMPLE_TITLES.has(b.title)))
        settings.assign({ ...backup.settings, didSeedSample: true })
      const restored = booksToRestore(this.books, backup.books)
      await restoreBooks(
        backup,
        restored.map(b => b.id),
      )
      await db.saveStats(mergeStats(this.days, backup.stats))
      for (const book of restored) covers.forget(book.id)
      await this.reload()
      this.broadcast()
      return restored.length
    } catch (error) {
      this.fail(t.restoreFailed, describe(error))
      return undefined
    }
  }

  dismissError() {
    this.error = undefined
    this.emit()
  }

  private update(id: string, changes: Partial<Book>) {
    let updated: Book | undefined
    this.books = this.books.map(b => (b.id === id ? (updated = { ...b, ...changes }) : b))
    if (!updated) return
    this.emit()
    db.saveBook(updated).then(
      () => this.broadcast(),
      error => this.saveFailed(error),
    )
  }

  private fail(title: string, message: string) {
    this.error = { title, message }
    this.emit()
  }

  private saveFailed(error: unknown) {
    this.fail(t.notSaved, t.libraryNotSaved(describe(error)))
  }
}

/**
 * A random UUID. `crypto.randomUUID` exists only in secure contexts (HTTPS,
 * localhost), so plain-HTTP access on the local network builds one from
 * `getRandomValues`, which is always available.
 */
function newID(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** The error's message, in the interface's language where Mono itself raised it. */
function describe(error: unknown): string {
  if (error instanceof ImportError) return t.importProblems[error.problem]
  if (error instanceof BackupError) return t.backupProblems[error.problem]
  return error instanceof Error ? error.message : String(error)
}

export const library = new Library()
