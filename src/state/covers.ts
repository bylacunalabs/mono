// Cover images: shrunk to a thumbnail on import, and handed to the interface
// as object URLs, loaded from IndexedDB the first time a cover is shown.

import type { Book } from '../core/book'
import type { CoverImage } from '../import/document'
import * as db from '../storage/db'
import { Store } from './store'

const MAX_HEIGHT = 480

/** A cover scaled down to at most MAX_HEIGHT px tall (the original if it can't be decoded). */
export async function coverThumbnail(cover: CoverImage): Promise<Blob> {
  const original = new Blob([cover.data as BlobPart], { type: cover.type })
  try {
    const bitmap = await createImageBitmap(original)
    const scale = Math.min(1, MAX_HEIGHT / bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob && blob.size < original.size ? blob : original
  } catch {
    // SVG and other formats createImageBitmap can't read: keep as is.
    return original
  }
}

class Covers extends Store {
  /** null: there turned out to be no cover. */
  private urls = new Map<string, string | null>()
  private loading = new Set<string>()

  /** The cover's URL, or undefined while it loads (an update is emitted once it has). */
  url(book: Book): string | undefined {
    if (!book.hasCover) return undefined
    const cached = this.urls.get(book.id)
    if (cached !== undefined || this.loading.has(book.id)) return cached ?? undefined
    this.loading.add(book.id)
    db.loadCover(book.id)
      .then(blob => {
        this.urls.set(book.id, blob ? URL.createObjectURL(blob) : null)
      })
      .catch(() => this.urls.set(book.id, null))
      .finally(() => {
        this.loading.delete(book.id)
        this.emit()
      })
    return undefined
  }

  forget(id: string) {
    const url = this.urls.get(id)
    if (url) URL.revokeObjectURL(url)
    this.urls.delete(id)
  }
}

export const covers = new Covers()
