// The main thread's way into the import worker. PDFs are read here with
// pdf.js (which runs its own worker) and only prepared in the import worker.

import { token, type Token } from '../core/tokenizer'
import { ImportError } from './document'
import { checked, fileExtension, fileTitle, type ImportedDocument } from './extract'
import type { PackedTokens, WorkerRequest } from './worker'

let worker: Worker | undefined
let nextID = 0
const pending = new Map<number, { resolve: (value: never) => void; reject: (error: Error) => void }>()

function run<T>(request: WorkerRequest): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const { id, result, error } = event.data
      const job = pending.get(id)
      pending.delete(id)
      if (error !== undefined) job?.reject(new ImportError(error))
      else job?.resolve(result as never)
    }
    worker.onerror = event => {
      // A worker that can't even start fails every job, not just one.
      for (const job of pending.values()) job.reject(new Error(event.message || 'The import worker failed.'))
      pending.clear()
      worker = undefined
    }
  }
  const id = nextID++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: never) => void, reject })
    worker!.postMessage({ id, request })
  })
}

/** Reads and prepares any supported file; `onProgress` reports PDF pages. */
export async function importFile(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportedDocument> {
  if (fileExtension(file) !== 'pdf') return run({ kind: 'import', file })
  const { parsePDF } = await import('./pdf')
  const document = await parsePDF(new Uint8Array(await file.arrayBuffer()), onProgress)
  const extracted = checked({ document, fallbackTitle: fileTitle(file.name), source: 'pdf' })
  return run({ kind: 'prepare', extracted })
}

export async function tokenizeText(text: string): Promise<Token[]> {
  const { words, ends } = await run<PackedTokens>({ kind: 'tokenize', text })
  return words.map((word, i) => token(word, ends[i] === 1))
}
