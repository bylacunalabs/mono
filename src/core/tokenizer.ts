// The unit the RSVP engine flashes on screen — one word of the text — plus
// the tokenizer that turns raw text into paragraphs and tokens.
//
// Words are never split here: indices stay stable whatever the screen size
// or font. A word too wide for the reticle is split into syllables only at
// display time (see hyphenation.ts).

import { chars, isLetter, isLetterOrNumber, isLowercase, words } from './text'

export interface Token {
  text: string
  /** Last token of a paragraph: longer pause and a paragraph break in the text panel. */
  endsParagraph: boolean
}

export const token = (text: string, endsParagraph = false): Token => ({ text, endsParagraph })

/** Bumped when tokenization changes in a way that shifts word indices. */
export const TOKENIZER_VERSION = 2

const NEWLINE = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/
const isBlank = (line: string) => line.trim() === ''

/**
 * Splits raw text into paragraphs, each collapsed to a single line.
 *
 * If the text uses blank lines anywhere, those are the paragraph separators
 * (so hard-wrapped files read as flowing prose) and a word hyphenated across
 * a line break ("frequen-" / "tassero") is joined back together. Otherwise
 * every line is its own paragraph. Invisible soft hyphens are removed.
 */
export function paragraphs(text: string): string[] {
  const lines = text.split(NEWLINE)

  let sawContent = false
  let usesBlankLines = false
  for (const line of lines) {
    if (isBlank(line)) {
      if (sawContent) { usesBlankLines = true; break }
    } else {
      sawContent = true
    }
  }

  const result: string[] = []
  let current: string[] = []
  const flush = () => {
    if (current.length) {
      result.push(current.join(' '))
      current = []
    }
  }

  for (const line of lines) {
    if (isBlank(line)) { flush(); continue }
    const lineWords = words(line).map(w => w.replaceAll('­', ''))
    const last = current[current.length - 1]
    if (last !== undefined && lineWords.length && isLineBreakHyphenation(last, lineWords[0])) {
      current[current.length - 1] = last.slice(0, -1) + lineWords.shift()
    }
    current.push(...lineWords)
    if (!usesBlankLines) flush()
  }
  flush()
  return result
}

/** "frequen-" at the end of a line followed by "tassero". */
export function isLineBreakHyphenation(end: string, next: string): boolean {
  const e = chars(end)
  if (e.length < 3 || e[e.length - 1] !== '-') return false
  const before = e[e.length - 2]
  const start = chars(next)[0]
  return !!start && isLetter(before) && isLowercase(before) && isLetter(start) && isLowercase(start)
}

export const tokenize = (text: string): Token[] => tokensInParagraphs(paragraphs(text))

export function tokensInParagraphs(paras: string[]): Token[] {
  const tokens: Token[] = []
  for (const paragraph of paras) {
    for (const word of words(paragraph)) tokens.push(token(word))
    if (tokens.length) tokens[tokens.length - 1].endsParagraph = true
  }
  return tokens
}

/** Number of tokens a paragraph produces. */
export const tokenCount = (paragraph: string) => words(paragraph).length

// Punctuation

/** Characters that can trail a sentence end: `fine.»`, `(sì!)`, `"ok."`. */
export const CLOSING = new Set(['"', "'", '»', '”', '’', ')', ']', '}', '*', '_'])
export const SENTENCE_ENDERS = new Set(['.', '!', '?', '…'])
export const CLAUSE_ENDERS = new Set([',', ';', ':', '—', '–'])

/** Last meaningful punctuation mark, looking past closing quotes/brackets. */
export function trailingPunctuation(word: string): string | undefined {
  const c = chars(word)
  for (let i = c.length - 1; i >= 0; i--) if (!CLOSING.has(c[i])) return c[i]
  return undefined
}

/**
 * Whether `t` ends a sentence. With the following token, a full stop that
 * belongs to an abbreviation ("Sig. Rossi", "p. es.", "J. R. R. Tolkien")
 * doesn't count.
 */
export function endsSentence(t: Token, next?: Token): boolean {
  if (t.endsParagraph) return true
  const mark = trailingPunctuation(t.text)
  if (mark === undefined || !SENTENCE_ENDERS.has(mark)) return false
  return !(mark === '.' && next && isAbbreviation(t.text, next.text))
}

/** Titles usually followed by a capitalised name. */
const TITLES = new Set([
  'sig', 'sigg', 'dott', 'dr', 'prof', 'ing', 'avv', 'arch', 'geom',
  'on', 'sen', 'gen', 'mons', 'mr', 'mrs', 'ms', 'mx', 'st', 'rev', 'capt', 'lt', 'sgt', 'vs', 'cfr',
])

/**
 * A word ending in a full stop that isn't a sentence end: one followed by a
 * lower-case word or a number ("ecc. e così via", "pag. 12"), an initial
 * ("J. Tolkien") or a title ("Dott. Rossi").
 */
export function isAbbreviation(word: string, next: string): boolean {
  const c = chars(word)
  // "fine.»" closes a quotation and "..." is an ellipsis: real ends.
  if (c[c.length - 1] !== '.' || c[c.length - 2] === '.') return false
  const following = chars(next).find(isLetterOrNumber)
  if (following === undefined) return false
  if (isLowercase(following) || /\p{N}/u.test(following)) return true
  const core = c.slice(0, -1).join('').replace(/^[«"“‘'(\[]+/u, '')
  if (chars(core).length === 1 && isLetter(core) && !isLowercase(core)) return true
  return TITLES.has(core.toLowerCase())
}

/**
 * The sentence containing `tokens[index]`, split around that word and
 * trimmed to at most `maxBefore` / `maxAfter` words on each side (with "…").
 */
export function sentenceAround(
  tokens: Token[],
  index: number,
  maxBefore = 14,
  maxAfter = 24,
): { before: string; word: string; after: string } | undefined {
  const t = tokens[index]
  if (!t) return undefined
  let start = index
  while (start > 0 && index - start < maxBefore && !endsSentence(tokens[start - 1], tokens[start])) start--
  let end = index
  while (end < tokens.length - 1 && end - index < maxAfter && !endsSentence(tokens[end], tokens[end + 1])) end++
  const text = (from: number, to: number) => tokens.slice(from, to).map(t => t.text).join(' ')
  const cutBefore = start > 0 && !endsSentence(tokens[start - 1], tokens[start])
  const cutAfter = end < tokens.length - 1 && !endsSentence(tokens[end], tokens[end + 1])
  return {
    before: (cutBefore ? '… ' : '') + text(start, index),
    word: t.text,
    after: text(index + 1, end + 1) + (cutAfter ? ' …' : ''),
  }
}
