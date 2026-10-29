// The import worker: parses files, prepares texts and tokenizes them off the
// main thread, so a long book never freezes the interface.

import { tokenize } from '../core/tokenizer'
import { ImportError } from './document'
import { extractFile, importDocument, type ExtractedFile } from './extract'

export type WorkerRequest =
  { kind: 'import'; file: File } | { kind: 'prepare'; extracted: ExtractedFile } | { kind: 'tokenize'; text: string }

/** Tokens in a compact shape that's cheap to send between threads. */
export interface PackedTokens {
  words: string[]
  /** 1 where a paragraph ends. */
  ends: Uint8Array
}

export async function handle(request: WorkerRequest) {
  switch (request.kind) {
    case 'import':
      return importDocument(await extractFile(request.file))
    case 'prepare':
      return importDocument(request.extracted)
    case 'tokenize': {
      const tokens = tokenize(request.text)
      const ends = new Uint8Array(tokens.length)
      tokens.forEach((t, i) => (ends[i] = t.endsParagraph ? 1 : 0))
      return { words: tokens.map(t => t.text), ends } satisfies PackedTokens
    }
  }
}

// Only when actually running as a worker (not when imported by tests).
if (typeof window === 'undefined' && typeof self !== 'undefined') {
  self.onmessage = async (event: MessageEvent<{ id: number; request: WorkerRequest }>) => {
    const { id, request } = event.data
    try {
      const result = await handle(request)
      const transfer: Transferable[] = []
      if (result && 'ends' in result) transfer.push(result.ends.buffer)
      if (result && 'cover' in result && result.cover) transfer.push(result.cover.data.buffer)
      self.postMessage({ id, result }, { transfer })
    } catch (error) {
      const problem = error instanceof ImportError ? error.problem : undefined
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error), problem })
    }
  }
}
