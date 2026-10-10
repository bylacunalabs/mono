// Timing model. Every word gets a time made of two parts:
//
//     delay = base × factor + pause
//
// • factor: how long the word takes to recognise, relative to an average
//   word. Longer words take longer (a gentler slope past ten letters, as
//   very long words are also split into syllables on screen); the most
//   frequent words (articles, prepositions…) take less; numbers take a
//   little more per digit; punctuation adds a proportional share.
// • pause: a fixed number of milliseconds after punctuation, paragraph ends
//   and headings. Taking in a sentence takes about as long at any speed, so
//   this part doesn't shrink as the words speed up.
//
// `base` and the pauses' scale are worked out per text and speed so the
// average word, pauses included, lasts exactly 60 / WPM: the WPM setting is
// the real average speed. At very high speeds the pauses are scaled down so
// they never take more than MAX_PAUSE_SHARE of the reading time.

import { isFrequent } from './frequent'
import { CLAUSE_ENDERS, endsSentence, SENTENCE_ENDERS, trailingPunctuation, type Token } from './tokenizer'
import { chars, isLetterOrNumber, isNumber } from './text'

export const MIN_WPM = 100
export const MAX_WPM = 1200
export const WPM_STEP = 25
export const DEFAULT_WPM = 300
/** Words over which playback eases in from half speed after each resume. */
export const RAMP_UP_WORDS = 8

export const clampWPM = (value: number) => Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(value)))

/** Every tunable number of the model. */
export const TIMING = {
  /** Length factor: 1 at five letters, +0.08 per letter up to ten, then +0.03. */
  letterStep: 0.08,
  longWordLetters: 10,
  longLetterStep: 0.03,
  shortestFactor: 0.7,
  longestFactor: 1.8,
  /** Frequent words ("il", "the"…). */
  frequentFactor: 0.8,
  /** Numbers: +5% per digit, at most +50%. */
  digitStep: 0.05,
  maxDigitBonus: 0.5,
  /** No word goes below this factor. */
  minimumFactor: 0.55,
  /** A paragraph of at most this many words without final punctuation is a heading. */
  headingWords: 10,
  /** Proportional share and fixed milliseconds of each kind of pause. */
  pauses: {
    sentence: { factor: 1.5, ms: 120 },
    ellipsis: { factor: 1.7, ms: 170 },
    /** ; : — – */
    strong: { factor: 1.3, ms: 70 },
    comma: { factor: 1.15, ms: 45 },
    /** A word that closes a parenthesis. */
    bracket: { factor: 1.05, ms: 25 },
    /** Added at a paragraph end. */
    paragraph: { factor: 1.2, ms: 80 },
    /** Instead of a sentence pause, after a heading. */
    heading: { factor: 1.6, ms: 220 },
  },
  /** At most this share of the reading time goes to fixed pauses. */
  maxPauseShare: 0.25,
}

export function lengthFactor(t: Token): number {
  const { letterStep, longWordLetters, longLetterStep, shortestFactor, longestFactor } = TIMING
  const letters = chars(t.text).filter(isLetterOrNumber).length
  const factor =
    letters <= longWordLetters
      ? 1 + (letters - 5) * letterStep
      : 1 + (longWordLetters - 5) * letterStep + (letters - longWordLetters) * longLetterStep
  return Math.min(longestFactor, Math.max(shortestFactor, factor))
}

/** Frequent words are recognised faster; numbers take a little longer per digit. */
export function recognitionFactor(t: Token): number {
  const digits = chars(t.text).filter(isNumber).length
  if (digits) return 1 + Math.min(TIMING.maxDigitBonus, digits * TIMING.digitStep)
  return isFrequent(t.text) ? TIMING.frequentFactor : 1
}

export interface Pause {
  factor: number
  ms: number
}

const NO_PAUSE: Pause = { factor: 1, ms: 0 }

/**
 * The pause after `t`. `next` tells abbreviations from sentence ends;
 * `isHeading` marks a short paragraph without final punctuation.
 */
export function pauseAfter(t: Token, next?: Token, isHeading = false): Pause {
  const { pauses } = TIMING
  if (isHeading) return pauses.heading
  const mark = trailingPunctuation(t.text)
  let pause = NO_PAUSE
  if (mark === '…' || /\.\.\.["'»”’)\]]*$/u.test(t.text)) pause = pauses.ellipsis
  else if (mark !== undefined && SENTENCE_ENDERS.has(mark)) pause = endsSentence(t, next) ? pauses.sentence : NO_PAUSE
  else if (mark === ',') pause = pauses.comma
  else if (mark !== undefined && CLAUSE_ENDERS.has(mark)) pause = pauses.strong
  else if (/[)\]]/.test(t.text)) pause = pauses.bracket
  if (t.endsParagraph) pause = { factor: pause.factor * pauses.paragraph.factor, ms: pause.ms + pauses.paragraph.ms }
  return pause
}

/** Per-token timing of a text, and its averages. */
export interface TextTiming {
  /** Recognition factor × proportional pause share of each token. */
  factors: number[]
  /** Fixed pause after each token, in milliseconds. */
  pausesMs: number[]
  meanFactor: number
  meanPauseMs: number
}

export function textTiming(tokens: Token[]): TextTiming {
  const factors: number[] = []
  const pausesMs: number[] = []
  let paragraphStart = 0
  tokens.forEach((t, i) => {
    const isHeading =
      t.endsParagraph && i - paragraphStart + 1 <= TIMING.headingWords && !/[\p{P}]$/u.test(t.text)
    const pause = pauseAfter(t, tokens[i + 1], isHeading)
    const recognition = Math.max(TIMING.minimumFactor, lengthFactor(t) * recognitionFactor(t))
    factors.push(recognition * pause.factor)
    pausesMs.push(pause.ms)
    if (t.endsParagraph) paragraphStart = i + 1
  })
  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
  return { factors, pausesMs, meanFactor: mean(factors) || 1, meanPauseMs: mean(pausesMs) }
}

/** How a text's timing maps to milliseconds at one speed. */
export interface Pace {
  /** Milliseconds per unit of factor. */
  base: number
  /** Multiplier for the fixed pauses (1 unless the speed is very high). */
  pauseScale: number
}

export function pace(timing: TextTiming, wpm: number): Pace {
  const average = 60_000 / wpm
  const pauseScale =
    timing.meanPauseMs > 0 ? Math.min(1, (TIMING.maxPauseShare * average) / timing.meanPauseMs) : 1
  return { base: (average - pauseScale * timing.meanPauseMs) / timing.meanFactor, pauseScale }
}

/** The time token `i` stays on screen, in milliseconds. */
export const delayMs = (timing: TextTiming, p: Pace, i: number) =>
  p.base * timing.factors[i] + p.pauseScale * timing.pausesMs[i]

/** 2× slower on the first word after resuming, easing linearly to 1×. */
export function rampUpFactor(wordsSinceResume: number): number {
  const remaining = Math.max(0, RAMP_UP_WORDS - wordsSinceResume)
  return 1 + remaining / RAMP_UP_WORDS
}
