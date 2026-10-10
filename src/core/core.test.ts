// Ported from the iOS app's TextProcessingTests, HyphenationTests and
// EngineTests, so both apps read texts identically.

import { describe, expect, it, vi } from 'vitest'
import { RSVPEngine } from './engine'
import { breakPositions, pieces } from './hyphenation'
import { orpIndex, orpIndexForLength } from './orp'
import { addDays, averageWPM, currentStreak, record, recentDays, totalWords, type Days } from './stats'
import {
  delayMs, lengthFactor, MAX_WPM, MIN_WPM, pace, pauseAfter, RAMP_UP_WORDS, rampUpFactor, recognitionFactor, textTiming, TIMING,
} from './timing'
import { endsSentence, isAbbreviation, paragraphs, sentenceAround, token, tokenCount, tokenize } from './tokenizer'
import { booksToRestore, mergeStats, validateBackup } from './backup'
import type { Book } from './book'
import { titleFromText } from './book'

describe('Tokenizer', () => {
  it('uses blank lines as paragraph separators and joins hard wraps', () => {
    expect(paragraphs('First line\nwraps here.\n\nSecond   paragraph.\n')).toEqual(['First line wraps here.', 'Second paragraph.'])
  })

  it('treats every line as a paragraph without blank lines', () => {
    expect(paragraphs('One.\nTwo.\r\nThree.')).toEqual(['One.', 'Two.', 'Three.'])
  })

  it('marks the last token of each paragraph', () => {
    const tokens = tokenize('Ciao mondo.\n\nSecondo')
    expect(tokens.map(t => t.text)).toEqual(['Ciao', 'mondo.', 'Secondo'])
    expect(tokens.map(t => t.endsParagraph)).toEqual([false, true, true])
  })

  it('never splits words into tokens', () => {
    expect(tokenize('precipitevolissimevolmente socio-economico').map(t => t.text)).toEqual([
      'precipitevolissimevolmente',
      'socio-economico',
    ])
  })

  it('joins line-break hyphenation', () => {
    expect(paragraphs('Se loro frequen-\ntassero la scuola.\n\nFine.')).toEqual(['Se loro frequentassero la scuola.', 'Fine.'])
  })

  it('keeps real hyphens and capitalised continuations', () => {
    expect(paragraphs('Nord-\nEst e poi -\naltro.\n\nX')).toEqual(['Nord- Est e poi - altro.', 'X'])
  })

  it('removes soft hyphens', () => {
    expect(tokenize('fre­quen­tassero').map(t => t.text)).toEqual(['frequentassero'])
  })

  it('counts tokens like tokenize', () => {
    const paragraph = 'Una parola lunghissima: precipitevolissimevolmente, e poi basta.'
    expect(tokenCount(paragraph)).toBe(tokenize(paragraph).length)
  })

  it.each(['fine.', 'fine.»', '(sì!)', '“davvero?”', 'dunque…'])('sees a sentence end in %s', word => {
    expect(endsSentence(token(word))).toBe(true)
  })

  it('does not treat a clause as a sentence end', () => {
    expect(endsSentence(token('però,'))).toBe(false)
    expect(endsSentence(token('però', true))).toBe(true)
  })

  it('titles untitled text with its first words', () => {
    expect(titleFromText('uno due tre')).toBe('uno due tre')
    expect(titleFromText('a b c d e f g h')).toBe('a b c d e f…')
  })
})

describe('Hyphenation', () => {
  const syllables = (word: string) => {
    const c = Array.from(word)
    let start = 0
    return [...breakPositions(word), c.length].map(p => {
      const part = c.slice(start, p).join('')
      start = p
      return part
    })
  }

  it.each([
    ['frequentassero', ['fre', 'quen', 'tas', 'se', 'ro']],
    ['particolarmente', ['par', 'ti', 'co', 'lar', 'men', 'te']],
    ['capra', ['ca', 'pra']],
    ['bagno', ['ba', 'gno']],
    ['pesce', ['pe', 'sce']],
    ['dentro', ['den', 'tro']],
    ['understanding', ['un', 'der', 'stan', 'ding']],
  ])('splits %s into syllables', (word, expected) => {
    expect(syllables(word as string)).toEqual(expected)
  })

  it('breaks after an existing hyphen', () => {
    expect(breakPositions('socio-economico')).toContain(6)
  })

  it('leaves a fitting word whole', () => {
    expect(pieces('frequentassero', () => true)).toEqual(['frequentassero'])
  })

  it('splits into the fewest fitting pieces at syllables', () => {
    const result = pieces('precipitevolissimevolmente', p => p.length <= 12)
    expect(result.every(p => p.length <= 12)).toBe(true)
    expect(result.slice(0, -1).every(p => p.endsWith('-'))).toBe(true)
    expect(result.join('').replaceAll('-', '')).toBe('precipitevolissimevolmente')
    expect(result.length).toBe(3)
  })

  it('does not double an existing hyphen', () => {
    expect(pieces('socio-economico', p => p.length <= 10)).toEqual(['socio-', 'economico'])
  })

  it('falls back to characters when no syllable fits', () => {
    const result = pieces('xxxxxxxxxxxx', p => p.length <= 5)
    expect(result.every(p => p.length <= 5)).toBe(true)
    expect(result.join('').replaceAll('-', '')).toBe('xxxxxxxxxxxx')
  })
})

describe('ORP', () => {
  it.each([
    [1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 3], [9, 3], [10, 4], [13, 4], [14, 4], [20, 6],
  ])('length %i → %i', (length, expected) => {
    expect(orpIndexForLength(length)).toBe(expected)
  })

  it('skips leading and trailing punctuation', () => {
    expect(orpIndex('Perché')).toBe(3)
    expect(orpIndex('«Perché')).toBe(4)
    expect(orpIndex('fine.»')).toBe(orpIndex('fine'))
  })

  it('stays in bounds for punctuation-only tokens', () => {
    expect(orpIndex('—')).toBe(0)
  })
})

describe('Timing', () => {
  it('gives longer words more time', () => {
    const factors = ['a', 'il', 'casa', 'parola', 'leggerezza', 'comprensione'].map(w => lengthFactor(token(w)))
    expect(factors).toEqual([...factors].sort((a, b) => a - b))
    expect(lengthFactor(token('parole'))).toBeCloseTo(1.08, 9)
    expect(lengthFactor(token('ciao'))).toBe(lengthFactor(token('«ciao.»')))
  })

  it('keeps growing, more slowly, past ten letters', () => {
    expect(lengthFactor(token('e'))).toBe(0.7)
    expect(lengthFactor(token('importante'))).toBeCloseTo(1.4, 9)
    expect(lengthFactor(token('comprensione'))).toBeCloseTo(1.46, 9)
    expect(lengthFactor(token('precipitevolissimevolmente'))).toBe(TIMING.longestFactor)
    expect(lengthFactor(token('precipitevolissimevolmente'))).toBeGreaterThan(lengthFactor(token('importante')))
  })

  it('speeds up frequent words and slows down long numbers', () => {
    expect(recognitionFactor(token('della,'))).toBe(TIMING.frequentFactor)
    expect(recognitionFactor(token('The'))).toBe(TIMING.frequentFactor)
    expect(recognitionFactor(token('gatto'))).toBe(1)
    expect(recognitionFactor(token('3'))).toBeCloseTo(1.05, 9)
    expect(recognitionFactor(token('1984'))).toBeCloseTo(1.2, 9)
    expect(recognitionFactor(token('1.234.567'))).toBeCloseTo(1.35, 9)
  })

  it('pauses by punctuation, with a fixed part', () => {
    const { pauses } = TIMING
    expect(pauseAfter(token('ciao'))).toEqual({ factor: 1, ms: 0 })
    expect(pauseAfter(token('ciao,'))).toEqual(pauses.comma)
    expect(pauseAfter(token('ciao;'))).toEqual(pauses.strong)
    expect(pauseAfter(token('ciao.»'))).toEqual(pauses.sentence)
    expect(pauseAfter(token('ciao…'))).toEqual(pauses.ellipsis)
    expect(pauseAfter(token('ciao...'))).toEqual(pauses.ellipsis)
    expect(pauseAfter(token('casa)'))).toEqual(pauses.bracket)
    expect(pauseAfter(token('fine.', true))).toEqual({
      factor: pauses.sentence.factor * pauses.paragraph.factor,
      ms: pauses.sentence.ms + pauses.paragraph.ms,
    })
  })

  it("doesn't pause after abbreviations", () => {
    expect(pauseAfter(token('Sig.'), token('Rossi'))).toEqual({ factor: 1, ms: 0 })
    expect(pauseAfter(token('fine.'), token('Poi'))).toEqual(TIMING.pauses.sentence)
  })

  it('pauses longer after a heading', () => {
    const timing = textTiming(tokenize('Capitolo primo\n\nEra una notte buia.'))
    expect(timing.pausesMs[1]).toBe(TIMING.pauses.heading.ms)
    expect(timing.pausesMs[5]).toBe(TIMING.pauses.sentence.ms + TIMING.pauses.paragraph.ms)
  })

  it('keeps the average word at 60 / WPM, pauses included', () => {
    const timing = textTiming(tokenize('Il gatto dorme profondamente, sul divano di casa. Poi si sveglia!'))
    for (const wpm of [100, 300, 1200]) {
      const p = pace(timing, wpm)
      const total = timing.factors.reduce((sum, _, i) => sum + delayMs(timing, p, i), 0)
      expect(total / timing.factors.length).toBeCloseTo(60_000 / wpm, 6)
      expect(p.base).toBeGreaterThan(0)
    }
  })

  it('keeps fixed pauses fixed until they would take too much time', () => {
    const timing = textTiming(tokenize('Uno due tre. Quattro cinque sei. Sette otto nove.'))
    expect(pace(timing, 150).pauseScale).toBe(1)
    expect(pace(timing, 300).pauseScale).toBe(1)
    const fast = pace(timing, 1200)
    expect(fast.pauseScale).toBeLessThan(1)
    expect(fast.pauseScale * timing.meanPauseMs).toBeCloseTo(TIMING.maxPauseShare * 50, 6)
  })

  it('makes sentence pauses relatively longer at higher speeds', () => {
    const timing = textTiming(tokenize('Il gatto dorme sul divano. Poi si sveglia e mangia.'))
    const ratio = (wpm: number) => {
      const p = pace(timing, wpm)
      return delayMs(timing, p, 4) / delayMs(timing, p, 1)
    }
    expect(ratio(600)).toBeGreaterThan(ratio(150))
  })

  it('ramps up from double to normal', () => {
    expect(rampUpFactor(0)).toBe(2)
    expect(rampUpFactor(RAMP_UP_WORDS / 2)).toBe(1.5)
    expect(rampUpFactor(RAMP_UP_WORDS)).toBe(1)
    expect(rampUpFactor(100)).toBe(1)
  })
})

describe('Abbreviations', () => {
  it('recognises titles, initials and lower-case continuations', () => {
    expect(isAbbreviation('Sig.', 'Rossi')).toBe(true)
    expect(isAbbreviation('Dott.', 'Bianchi')).toBe(true)
    expect(isAbbreviation('J.', 'R.')).toBe(true)
    expect(isAbbreviation('ecc.', 'e')).toBe(true)
    expect(isAbbreviation('pag.', '12')).toBe(true)
    expect(isAbbreviation('(Mr.', 'Smith')).toBe(true)
  })

  it('keeps real sentence ends', () => {
    expect(isAbbreviation('casa.', 'Poi')).toBe(false)
    expect(isAbbreviation('ecc.', 'Poi')).toBe(false)
    expect(isAbbreviation('fine.»', 'e')).toBe(false)
    expect(isAbbreviation('così...', 'e')).toBe(false)
    expect(isAbbreviation('Io.', '«Ciao')).toBe(false)
  })

  it('navigates sentences across abbreviations', () => {
    // Indices:              0      1     2      3     4    5    6     7
    const engine = new RSVPEngine()
    engine.load(tokenize('Ho visto il Dott. Rossi ieri. Poi basta.'), 1)
    engine.nextSentence()
    expect(engine.currentIndex).toBe(6)
    const tokens = tokenize('Ho visto il Dott. Rossi ieri.')
    expect(endsSentence(tokens[3], tokens[4])).toBe(false)
    expect(endsSentence(tokens[3])).toBe(true)
  })
})

describe('Engine navigation', () => {
  const make = (text: string, at = 0) => {
    const engine = new RSVPEngine()
    engine.load(tokenize(text), at)
    return engine
  }
  // Indices:    0   1   2    3       4       5   6     7
  const text = 'Uno due tre. Quattro cinque! Sei sette otto.'

  it('jumps to the next sentence', () => {
    const engine = make(text, 1)
    engine.nextSentence()
    expect(engine.currentIndex).toBe(3)
    engine.nextSentence()
    expect(engine.currentIndex).toBe(5)
  })

  it('rewinds to the sentence start, then the previous one', () => {
    const engine = make(text, 7)
    for (const expected of [5, 3, 0, 0]) {
      engine.previousSentence()
      expect(engine.currentIndex).toBe(expected)
    }
  })

  it('navigates paragraphs', () => {
    const engine = make('Uno due tre.\n\nQuattro cinque.\n\nSei sette.', 1)
    expect(engine.paragraphStarts).toEqual([0, 3, 5])
    expect(engine.paragraphRanges).toEqual([[0, 3], [3, 5], [5, 7]])
    for (const expected of [3, 5, 6]) {
      engine.nextParagraph()
      expect(engine.currentIndex).toBe(expected)
    }
    engine.previousParagraph()
    expect(engine.currentIndex).toBe(3)
    engine.previousParagraph()
    expect(engine.currentIndex).toBe(0)
    engine.seek(2)
    engine.previousParagraph()
    expect(engine.currentIndex).toBe(0)
    expect(engine.paragraphIndex(4)).toBe(1)
  })

  it('navigates chapters by the given starts', () => {
    const engine = make(text, 4)
    engine.nextIn([0, 5])
    expect(engine.currentIndex).toBe(5)
    engine.nextIn([0, 5])
    expect(engine.currentIndex).toBe(5)
    engine.previousIn([0, 5])
    expect(engine.currentIndex).toBe(0)
  })

  it('computes remaining time from weights and speed', () => {
    expect(make('ab cd.').secondsRemaining).toBeCloseTo((2 * 60) / 300, 4)
  })

  it('shows words that are too wide in pieces', () => {
    const engine = make('una frequentassero due')
    engine.splitForDisplay = w => (w.length > 10 ? pieces(w, p => p.length <= 9) : [w])
    engine.seek(1)
    expect(engine.pieces).toEqual(['frequen-', 'tassero'])
    expect(engine.currentWord).toBe('frequen-')
    expect(engine.currentToken?.text).toBe('frequentassero')
    engine.seek(2)
    expect(engine.pieces).toEqual(['due'])
  })

  it('clamps and reports speed', () => {
    const onWPMChange = vi.fn()
    const engine = new RSVPEngine({ onWPMChange })
    engine.adjustWPM(1000)
    expect(engine.wpm).toBe(MAX_WPM)
    engine.adjustWPM(-1000)
    expect(engine.wpm).toBe(MIN_WPM)
    expect(onWPMChange).toHaveBeenLastCalledWith(MIN_WPM)
  })

  it('clamps seeks', () => {
    const engine = make(text)
    engine.seek(999)
    expect(engine.currentIndex).toBe(7)
    engine.seek(-5)
    expect(engine.currentIndex).toBe(0)
  })

  it('goes back a few words within the sentence on resuming', () => {
    // Indices:   0   1   2   3   4    5     6     7     8     9
    const engine = make('Uno due tre. Uno due tre quattro cinque sei sette.', 8)
    engine.play()
    engine.pause()
    expect(engine.currentIndex).toBe(4)
    // Never before the sentence start.
    const short = make(text, 4)
    short.play()
    expect(short.currentIndex).toBe(3)
  })

  it('resumes exactly where the reader chose to', () => {
    const engine = make(text)
    engine.seek(6)
    engine.play()
    expect(engine.currentIndex).toBe(6)
    engine.pause()
    // A short pause keeps the thread.
    engine.play()
    expect(engine.currentIndex).toBe(6)
    engine.pause()
    const off = make(text, 6)
    off.rewindOnResume = false
    off.play()
    expect(off.currentIndex).toBe(6)
  })

  it('advances during playback and counts session words', async () => {
    const engine = make('a b c d e f g h i j')
    engine.rampUpEnabled = false
    engine.adjustWPM(1000) // 1200 WPM = 50 ms per word
    engine.play()
    await new Promise(resolve => setTimeout(resolve, 400))
    engine.pause()
    expect(engine.currentIndex).toBeGreaterThan(2)
    const session = engine.takeSessionStats()
    expect(session.words).toBe(engine.currentIndex)
    expect(session.seconds).toBeGreaterThan(0.3)
    expect(engine.takeSessionStats().words).toBe(0)
  })
})

describe('Reading stats', () => {
  it('counts a streak ending today or yesterday', () => {
    const now = new Date()
    let days: Days = {}
    days = record(days, 100, 30, addDays(now, -1))
    days = record(days, 100, 30, addDays(now, -2))
    days = record(days, 100, 30, addDays(now, -4))
    expect(currentStreak(days)).toBe(2)
    days = record(days, 10, 3, now)
    expect(currentStreak(days)).toBe(3)
  })

  it('totals words and average speed', () => {
    let days: Days = {}
    days = record(days, 300, 60)
    days = record(days, 300, 30, addDays(new Date(), -3))
    days = record(days, 0, 99)
    expect(totalWords(days)).toBe(600)
    expect(averageWPM(days)).toBe(400)
    expect(recentDays(days)).toHaveLength(7)
    expect(recentDays(days).at(-1)?.stats.words).toBe(300)
  })
})

describe('Sentence around the bookmark', () => {
  const tokens = tokenize('First one. The quick brown fox jumps. Last!')

  it('returns the sentence split around the word', () => {
    expect(sentenceAround(tokens, 4)).toEqual({ before: 'The quick', word: 'brown', after: 'fox jumps.' })
    expect(sentenceAround(tokens, 2)).toEqual({ before: '', word: 'The', after: 'quick brown fox jumps.' })
    expect(sentenceAround(tokens, 7)).toEqual({ before: '', word: 'Last!', after: '' })
  })

  it('trims long sentences with an ellipsis', () => {
    const long = tokenize(Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ') + '.')
    const sentence = sentenceAround(long, 30, 3, 4)!
    expect(sentence).toEqual({ before: '… w27 w28 w29', word: 'w30', after: 'w31 w32 w33 w34 …' })
  })

  it('is undefined past the end', () => {
    expect(sentenceAround(tokens, 99)).toBeUndefined()
  })
})

describe('Backup', () => {
  const book = (id: string, lastOpened?: number): Book => ({
    id, title: id, wordCount: 10, currentIndex: 0, dateAdded: 1, lastOpened,
  })

  it('restores new books and more recently read copies only', () => {
    const local = [book('a', 100), book('b', 300)]
    const incoming = [book('a', 200), book('b', 250), book('c')]
    expect(booksToRestore(local, incoming).map(b => b.id)).toEqual(['a', 'c'])
  })

  it('keeps the larger total for each day', () => {
    const merged = mergeStats(
      { '2026-10-01': { words: 500, seconds: 120 }, '2026-10-02': { words: 50, seconds: 10 } },
      { '2026-10-01': { words: 300, seconds: 60 }, '2026-10-02': { words: 80, seconds: 20 }, '2026-10-03': { words: 5, seconds: 1 } },
    )
    expect(merged).toEqual({
      '2026-10-01': { words: 500, seconds: 120 },
      '2026-10-02': { words: 80, seconds: 20 },
      '2026-10-03': { words: 5, seconds: 1 },
    })
  })

  it('rejects other files and drops books without text', () => {
    expect(() => validateBackup({ hello: 'world' })).toThrow('not a Mono backup')
    expect(() => validateBackup({ format: 'mono-backup', version: 99, books: [] })).toThrow('newer version')
    const backup = validateBackup({ format: 'mono-backup', version: 1, books: [book('a'), book('b')], texts: { a: 'Text' } })
    expect(backup.books.map(b => b.id)).toEqual(['a'])
  })
})
