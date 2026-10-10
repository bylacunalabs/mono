// Writing and reading backup files (see core/backup.ts for the format).

import { BackupError, BACKUP_FORMAT, BACKUP_VERSION, validateBackup, type Backup } from '../core/backup'
import * as db from './db'

export async function createBackup(settings: Record<string, unknown>): Promise<Blob> {
  const books = await db.loadBooks()
  const texts: Record<string, string> = {}
  const covers: Record<string, string> = {}
  for (const book of books) {
    texts[book.id] = await db.loadText(book.id)
    const cover = book.hasCover ? await db.loadCover(book.id) : undefined
    if (cover) covers[book.id] = await dataURL(cover)
  }
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    books,
    texts,
    covers,
    stats: await db.loadStats(),
    settings,
  }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

export async function readBackup(file: File): Promise<Backup> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new BackupError('This file is not a Mono backup.')
  }
  return validateBackup(parsed)
}

/** Writes the given books (with their texts and covers) from a backup. */
export async function restoreBooks(backup: Backup, ids: string[]) {
  for (const id of ids) {
    const book = backup.books.find(b => b.id === id)
    if (!book) continue
    const cover = backup.covers[id] ? await (await fetch(backup.covers[id])).blob() : undefined
    await db.addBook({ ...book, hasCover: !!cover }, backup.texts[id], cover)
  }
}

const dataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** Offers `blob` as a download named `name`. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
