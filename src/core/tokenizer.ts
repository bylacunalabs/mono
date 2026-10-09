// The unit the RSVP engine flashes on screen — one word of the text — plus
// the tokenizer that turns raw text into paragraphs and tokens.
//
// Words are never split here: indices stay stable whatever the screen size
// or font. A word too wide for the reticle is split into syllables only at
// display time (see hyphenation.ts).

import { chars, isLetter, isLowercase, words } from './text'

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

export function endsSentence(t: Token): boolean {
  if (t.endsParagraph) return true
  const mark = trailingPunctuation(t.text)
  return mark !== undefined && SENTENCE_ENDERS.has(mark)
}
