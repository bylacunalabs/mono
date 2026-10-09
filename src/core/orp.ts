// Optimal Recognition Point: the letter the eye rests on, slightly left of
// the middle of the word. Same table as the reference RSVP reader.

import { chars, isLetterOrNumber } from './text'

export function orpIndexForLength(length: number): number {
  if (length <= 1) return 0
  if (length <= 3) return 1
  if (length <= 5) return 2
  if (length <= 9) return 3
  if (length <= 13) return 4
  // Very long words: keep the anchor about a third in.
  return Math.round(length * 0.3)
}

/**
 * ORP index within `word`, ignoring leading and trailing punctuation so
 * `«Perché` and `fine.»` anchor on the same letter as the bare words.
 */
export function orpIndex(word: string): number {
  const c = chars(word)
  const first = c.findIndex(isLetterOrNumber)
  const last = c.findLastIndex(isLetterOrNumber)
  if (first < 0) return orpIndexForLength(c.length)
  return first + orpIndexForLength(last - first + 1)
}

/** A word split around its ORP letter. */
export interface ORPParts {
  prefix: string
  orp: string
  suffix: string
}

export function orpParts(word: string): ORPParts {
  const c = chars(word)
  if (!c.length) return { prefix: '', orp: '', suffix: '' }
  const i = Math.min(orpIndex(word), c.length - 1)
  return { prefix: c.slice(0, i).join(''), orp: c[i], suffix: c.slice(i + 1).join('') }
}
