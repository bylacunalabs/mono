// Everything on disk lives in IndexedDB: the library index, each text
// (normalised, one paragraph per line) and the reading statistics.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Book } from '../core/book'
import type { Days } from '../core/stats'

interface MonoDB extends DBSchema {
  books: { key: string; value: Book }
  texts: { key: string; value: string }
  meta: { key: string; value: unknown }
}

let database: Promise<IDBPDatabase<MonoDB>> | undefined

function db() {
  database ??= openDB<MonoDB>('mono', 1, {
    upgrade(db) {
      db.createObjectStore('books', { keyPath: 'id' })
      db.createObjectStore('texts')
      db.createObjectStore('meta')
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

export async function addBook(book: Book, text: string) {
  const tx = (await db()).transaction(['books', 'texts'], 'readwrite')
  await Promise.all([tx.objectStore('books').put(book), tx.objectStore('texts').put(text, book.id), tx.done])
}

export async function deleteBook(id: string) {
  const tx = (await db()).transaction(['books', 'texts'], 'readwrite')
  await Promise.all([tx.objectStore('books').delete(id), tx.objectStore('texts').delete(id), tx.done])
}

export async function loadText(id: string): Promise<string> {
  return (await (await db()).get('texts', id)) ?? ''
}

export async function loadStats(): Promise<Days> {
  return ((await (await db()).get('meta', 'stats')) as Days | undefined) ?? {}
}

export async function saveStats(days: Days) {
  await (await db()).put('meta', days, 'stats')
}

/** Asks the browser not to evict the library under storage pressure. */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {})
}
