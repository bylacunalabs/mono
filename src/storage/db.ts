// Everything on disk lives in IndexedDB: the library index, each text
// (normalised, one paragraph per line), cover images, the reading statistics
// and an inbox of items shared to Mono (written by the service worker).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Book } from '../core/book'
import type { Days } from '../core/stats'

/** Something shared to Mono from another app (Web Share Target). */
export interface SharedItem {
  id: number
  title?: string
  text?: string
  url?: string
  files: File[]
}

interface MonoDB extends DBSchema {
  books: { key: string; value: Book }
  texts: { key: string; value: string }
  meta: { key: string; value: unknown }
  covers: { key: string; value: Blob }
  inbox: { key: number; value: SharedItem }
}

let database: Promise<IDBPDatabase<MonoDB>> | undefined

export function db() {
  database ??= openDB<MonoDB>('mono', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('books', { keyPath: 'id' })
        db.createObjectStore('texts')
        db.createObjectStore('meta')
      }
      if (oldVersion < 2) {
        db.createObjectStore('covers')
        db.createObjectStore('inbox', { keyPath: 'id', autoIncrement: true })
      }
    },
    // Another tab (or the service worker) is upgrading: let it.
    blocking() {
      void database?.then(d => d.close())
      database = undefined
    },
  })
  return database
}

export async function loadBooks(): Promise<Book[]> {
  return (await db()).getAll('books')
}

export async function saveBook(book: Book) {
  await (await db()).put('books', book)
}

export async function addBook(book: Book, text: string, cover?: Blob) {
  const tx = (await db()).transaction(['books', 'texts', 'covers'], 'readwrite')
  await Promise.all([
    tx.objectStore('books').put(book),
    tx.objectStore('texts').put(text, book.id),
    cover && tx.objectStore('covers').put(cover, book.id),
    tx.done,
  ])
}

export async function deleteBook(id: string) {
  const tx = (await db()).transaction(['books', 'texts', 'covers'], 'readwrite')
  await Promise.all([
    tx.objectStore('books').delete(id),
    tx.objectStore('texts').delete(id),
    tx.objectStore('covers').delete(id),
    tx.done,
  ])
}

export async function loadText(id: string): Promise<string> {
  return (await (await db()).get('texts', id)) ?? ''
}

export async function loadCover(id: string): Promise<Blob | undefined> {
  return (await db()).get('covers', id)
}

export async function loadStats(): Promise<Days> {
  return ((await (await db()).get('meta', 'stats')) as Days | undefined) ?? {}
}

export async function saveStats(days: Days) {
  await (await db()).put('meta', days, 'stats')
}

// Inbox

export async function addToInbox(item: Omit<SharedItem, 'id'>) {
  await (await db()).add('inbox', item as SharedItem)
}

/** Everything shared since the last call, removed from the inbox. */
export async function takeInbox(): Promise<SharedItem[]> {
  const tx = (await db()).transaction('inbox', 'readwrite')
  const items = await tx.store.getAll()
  await tx.store.clear()
  await tx.done
  return items
}

/** Asks the browser not to evict the library under storage pressure. */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {})
}
