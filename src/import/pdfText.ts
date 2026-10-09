// PDF text comes out as hard-wrapped lines with no paragraph markup. This
// rebuilds paragraphs: joins lines, repairs end-of-line hyphenation, and
// breaks where a short line ends a sentence (the usual paragraph shape).

import { SENTENCE_ENDERS, trailingPunctuation } from '../core/tokenizer'
import { isLowercase, length } from '../core/text'

const NEWLINE = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/

export function pdfParagraphs(pages: string[]): { paragraphs: string[]; pageStarts: number[] } {
  const allLines = pages.flatMap(p => p.split(NEWLINE)).map(l => l.trim()).filter(Boolean)
  const lengths = allLines.map(length).sort((a, b) => a - b)
  const typicalLength = lengths.length ? lengths[Math.floor((lengths.length * 3) / 4)] : 0

  const paragraphs: string[] = []
  const pageStarts: number[] = []
  let current = ''
  const flush = () => {
    const trimmed = current.trim()
    if (trimmed) paragraphs.push(trimmed)
    current = ''
  }

  for (const page of pages) {
    pageStarts.push(paragraphs.length)
    for (const rawLine of page.split(NEWLINE)) {
      const line = rawLine.trim()
      if (!line) { flush(); continue }
      // Bare page numbers.
      if (/^\p{N}{1,4}$/u.test(line)) continue

      const first = Array.from(line)[0]
      if (current.endsWith('-') && isLowercase(first)) {
        current = current.slice(0, -1) + line
      } else {
        current += current ? ' ' + line : line
      }

      const mark = trailingPunctuation(line)
      if (mark !== undefined && (SENTENCE_ENDERS.has(mark) || mark === ':') && length(line) < typicalLength * 0.8) {
        flush()
      }
    }
  }
  flush()
  return { paragraphs, pageStarts }
}
