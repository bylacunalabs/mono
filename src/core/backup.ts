// The backup file format and how a restored backup merges with the library
// already on the device: nothing is ever lost, the most recently read copy
// of a book wins, and a day's statistics keep the larger total (so restoring
// the same backup twice doesn't count the reading twice).

import type { Book } from './book'
import type { Days } from './stats'

export const BACKUP_FORMAT = 'mono-backup'
export const BACKUP_VERSION = 1

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  books: Book[]
  /** Book id → text. */
  texts: Record<string, string>
  /** Book id → cover image as a data: URL. */
  covers: Record<string, string>
  stats: Days
  settings: Record<string, unknown>
}

/** What's wrong with the file, so the interface can say it in its own language. */
export type BackupProblem = 'notBackup' | 'newer'

const BACKUP_MESSAGES: Record<BackupProblem, string> = {
  notBackup: 'This file is not a Mono backup.',
  newer: 'This backup was made by a newer version of Mono. Update the app and try again.',
}

export class BackupError extends Error {
  constructor(readonly problem: BackupProblem) {
    super(BACKUP_MESSAGES[problem])
  }
}

/** Checks the shape of a parsed backup file. */
export function validateBackup(value: unknown): Backup {
  const backup = value as Partial<Backup> | null
  if (!backup || backup.format !== BACKUP_FORMAT || !Array.isArray(backup.books)) {
    throw new BackupError('notBackup')
  }
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new BackupError('newer')
  }
  const books = backup.books.filter(
    (b): b is Book =>
      !!b && typeof b.id === 'string' && typeof b.title === 'string' && typeof backup.texts?.[b.id] === 'string',
  )
  return {
    format: BACKUP_FORMAT,
    version: backup.version,
    exportedAt: String(backup.exportedAt ?? ''),
    books,
    texts: backup.texts ?? {},
    covers: backup.covers ?? {},
    stats: backup.stats && typeof backup.stats === 'object' ? backup.stats : {},
    settings: backup.settings && typeof backup.settings === 'object' ? backup.settings : {},
  }
}

const lastActivity = (b: Book) => Math.max(b.lastOpened ?? 0, b.dateAdded)

/** The backed-up books to write: new ones, and ones read more recently than the local copy. */
export function booksToRestore(local: Book[], incoming: Book[]): Book[] {
  const byID = new Map(local.map(b => [b.id, b]))
  return incoming.filter(b => {
    const existing = byID.get(b.id)
    return !existing || lastActivity(b) > lastActivity(existing)
  })
}

export function mergeStats(local: Days, incoming: Days): Days {
  const merged: Days = { ...local }
  for (const [day, stats] of Object.entries(incoming)) {
    if (!stats || typeof stats.words !== 'number' || typeof stats.seconds !== 'number') continue
    const current = merged[day]
    if (!current || stats.words > current.words) merged[day] = { words: stats.words, seconds: stats.seconds }
  }
  return merged
}
