// Splits a word that doesn't fit the reticle into as few pieces as possible,
// breaking between syllables ("fre-quen-tas-se-ro") or after a hyphen the
// word already has. Only words wider than the screen are split, and only for
// display.
//
// The syllable rules are Italian (they also give reasonable breaks in
// English and other Latin-script languages):
// • one consonant between vowels starts the next syllable (ca-sa);
// • double consonants are split (tas-se);
// • s + consonant starts the next syllable (pe-sce, ve-sti);
// • consonant + l/r and ch, gh, gn, ph, th, qu stay together (ca-pra,
//   ba-gno, fre-quen);
// • any other cluster splits after its first consonant (quan-to, den-tro).
// Adjacent vowels are never separated.

import { chars, isLetter } from './text'

/** Shortest piece of a word, in letters, on either side of a break. */
const MINIMUM_PIECE = 2

const VOWELS = new Set(chars('aeiouyàáâäèéêëìíîïòóôöùúûü'))
const INSEPARABLE = new Set([
  'bl', 'br', 'cl', 'cr', 'dl', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr',
  'tl', 'tr', 'vl', 'vr', 'ch', 'gh', 'gn', 'ph', 'th', 'sh',
  // "qu"/"gu" before a vowel: the u is a glide (fre-quen, se-guen-te).
  'qu', 'gu',
])
const DASHES = new Set(['-', '‐', '–', '—', '/'])

/**
 * `word` as display pieces that each satisfy `fits`. Pieces that end at a
 * syllable break get a trailing "-"; a piece ending at the word's own hyphen
 * keeps just that. Falls back to fitting characters when no syllable break
 * is narrow enough.
 */
export function pieces(word: string, fits: (piece: string) => boolean): string[] {
  if (fits(word)) return [word]

  const c = chars(word)
  const breaks = breakPositions(word)
  const result: string[] = []
  let start = 0

  const piece = (from: number, to: number) => {
    const text = c.slice(from, to).join('')
    return DASHES.has(c[to - 1]) ? text : text + '-'
  }

  while (start < c.length) {
    const rest = c.slice(start).join('')
    if (fits(rest)) { result.push(rest); break }
    // Prefer the word's own hyphens, then syllables: the longest prefix
    // ending at such a break that still fits.
    const candidates = breaks.filter(b => b > start)
    const hyphenBreaks = candidates.filter(b => DASHES.has(c[b - 1]))
    const end = [...hyphenBreaks.reverse(), ...candidates.reverse()].find(b => fits(piece(start, b)))
    if (end !== undefined) {
      result.push(piece(start, end))
      start = end
      continue
    }
    // Nothing fits at a syllable boundary: cut as late as possible.
    let cut = c.length - 1
    while (cut > start + 1 && !fits(piece(start, cut))) cut--
    if (cut <= start) { result.push(rest); break }
    result.push(piece(start, cut))
    start = cut
  }
  return result
}

/** Offsets `i` at which the word may break (between characters i-1 and i). */
export function breakPositions(word: string): number[] {
  const c = chars(word).map(ch => chars(ch.toLowerCase())[0] ?? ch)
  const count = c.length
  const positions = new Set<number>()

  // After the word's own hyphens and slashes.
  for (let i = 1; i < count; i++) if (DASHES.has(c[i - 1])) positions.add(i)

  const isVowel = (i: number) => {
    if (!VOWELS.has(c[i])) return false
    // The u of "qu"/"gu" before a vowel is a glide, not a nucleus.
    if (c[i] === 'u' && i > 0 && 'qg'.includes(c[i - 1]) && i + 1 < count && VOWELS.has(c[i + 1])) return false
    return true
  }

  let lastVowel: number | undefined
  for (let i = 0; i < count; i++) {
    if (!isLetter(c[i])) { lastVowel = undefined; continue }
    if (!isVowel(i)) continue
    if (lastVowel !== undefined) {
      const clusterLength = i - lastVowel - 1
      if (clusterLength >= 1) positions.add(lastVowel + 1 + splitOffset(c, lastVowel + 1, clusterLength))
    }
    lastVowel = i
  }

  const letters = (from: number, to: number) => c.slice(from, to).filter(isLetter).length
  return [...positions]
    .sort((a, b) => a - b)
    .filter(p => letters(0, p) >= MINIMUM_PIECE && letters(p, count) >= MINIMUM_PIECE)
}

/** Where a consonant cluster starting at `start` splits, relative to `start`. */
function splitOffset(c: string[], start: number, length: number): number {
  if (length < 2) return 0
  const first = c[start]
  const second = c[start + 1]
  if (first === second) return 1
  if (first === 's') return 0
  if (length === 2 && INSEPARABLE.has(first + second)) return 0
  return 1
}
