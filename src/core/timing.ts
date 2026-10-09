// Timing model. A word's time = base × weight, where base = 60 / WPM and
//
//     weight = length factor × pause factor, divided by the text's mean
//
// • Length factor: longer words take longer to recognise — 1 at five
//   letters, ±0.08 per letter, between 0.7 and 1.5.
// • Pause factor: ×2 after a sentence, ×1.5 after a clause, a little more
//   at a paragraph break and for numbers.
// • Dividing by the mean makes the average word exactly one base unit,
//   pauses included, so the WPM setting is the real average speed.

import { CLAUSE_ENDERS, SENTENCE_ENDERS, trailingPunctuation, type Token } from './tokenizer'
import { chars, isLetterOrNumber, isNumber } from './text'

export const MIN_WPM = 100
export const MAX_WPM = 1200
export const WPM_STEP = 25
export const DEFAULT_WPM = 300
/** Words over which playback eases in from half speed after each resume. */
export const RAMP_UP_WORDS = 8

export const clampWPM = (value: number) => Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(value)))

export function lengthFactor(t: Token): number {
  const letters = chars(t.text).filter(isLetterOrNumber).length
  return Math.min(1.5, Math.max(0.7, 1 + (letters - 5) * 0.08))
}

export function pauseFactor(t: Token): number {
  let factor = 1
  const mark = trailingPunctuation(t.text)
  if (mark !== undefined) {
    if (SENTENCE_ENDERS.has(mark)) factor = 2
    else if (CLAUSE_ENDERS.has(mark)) factor = 1.5
  }
  if (t.endsParagraph) factor *= 1.25
  // Numbers are read digit by digit and take longer to take in.
  if (chars(t.text).some(isNumber)) factor *= 1.15
  return factor
}

/** Delay multiplier for every token of a text; their mean is 1. */
export function weights(tokens: Token[]): number[] {
  if (!tokens.length) return []
  const raw = tokens.map(t => lengthFactor(t) * pauseFactor(t))
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length
  return raw.map(w => w / mean)
}

/** 2× slower on the first word after resuming, easing linearly to 1×. */
export function rampUpFactor(wordsSinceResume: number): number {
  const remaining = Math.max(0, RAMP_UP_WORDS - wordsSinceResume)
  return 1 + remaining / RAMP_UP_WORDS
}
