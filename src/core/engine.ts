// Drives Rapid Serial Visual Presentation: holds the tokenized word stream,
// advances through it on a dynamic timer, and exposes what the reader needs
// to render the word, navigate and show the text while paused.
//
// Word times come from the timing model (timing.ts). Each word is scheduled
// against an absolute deadline so timer overhead doesn't accumulate as drift
// at high speeds (1200 WPM = 50 ms per word on average).

import {
  clampWPM,
  DEFAULT_WPM,
  delayMs,
  pace,
  rampUpFactor,
  textTiming,
  WPM_STEP,
  type Pace,
  type PauseKind,
  type TextTiming,
} from './timing'
import { endsSentence, type Token } from './tokenizer'

/** Words the reader goes back on resuming after a pause, within the sentence. */
export const REWIND_WORDS = 4
/** Pauses shorter than this don't lose the thread: no rewind. */
export const REWIND_AFTER_MS = 1500

export class RSVPEngine {
  tokens: Token[] = []
  currentIndex = 0
  /** Display pieces of the current word (usually just the word) and which one is showing. */
  pieces: string[] = []
  pieceIndex = 0
  isPlaying = false
  wpm: number
  rampUpEnabled: boolean
  /** Go back a few words on resuming after a pause (see play()). */
  rewindOnResume: boolean
  /** Token index where each paragraph begins (sorted). */
  paragraphStarts: number[] = []
  /** Token range [start, end) of every paragraph, for the text panel. */
  paragraphRanges: [number, number][] = []

  /** Splits a word too wide for the screen into display pieces. */
  private split: (word: string) => string[] = w => [w]
  private timing: TextTiming = textTiming([])
  private pace: Pace = { base: 0, pauseScale: 1 }
  /** Totals of factors and fixed pauses from token `i` to the end. */
  private remainingFactor: number[] = [0]
  private remainingPauseMs: number[] = [0]
  private timer: ReturnType<typeof setTimeout> | undefined
  private deadline = 0
  private wordsSinceResume = 0
  /** The position was picked (seek, skip) since the last pause: resume exactly there. */
  private positionChosen = false
  private pausedAt = -Infinity
  /** Where the last resume started: rewinding never goes further back, so short pauses don't creep backwards. */
  private resumedFrom = 0
  private listeners = new Set<() => void>()

  // Reading-session accounting for statistics.
  private sessionWords = 0
  private sessionSeconds = 0
  private playStartedAt: number | undefined

  constructor(
    options: { wpm?: number; rampUp?: boolean; rewindOnResume?: boolean; onWPMChange?: (wpm: number) => void } = {},
  ) {
    this.wpm = clampWPM(options.wpm || DEFAULT_WPM)
    this.rampUpEnabled = options.rampUp ?? true
    this.rewindOnResume = options.rewindOnResume ?? true
    this.onWPMChange = options.onWPMChange
  }

  private onWPMChange?: (wpm: number) => void

  // Observation

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }

  // Loading

  load(tokens: Token[], startIndex: number) {
    this.pause()
    this.tokens = tokens
    this.timing = textTiming(tokens)
    this.paragraphStarts = tokens.length ? [0] : []
    for (let i = 0; i < tokens.length - 1; i++) if (tokens[i].endsParagraph) this.paragraphStarts.push(i + 1)
    this.paragraphRanges = this.paragraphStarts.map((start, i) => [start, this.paragraphStarts[i + 1] ?? tokens.length])
    const factors = new Array<number>(tokens.length + 1).fill(0)
    const pauses = new Array<number>(tokens.length + 1).fill(0)
    for (let i = tokens.length - 1; i >= 0; i--) {
      factors[i] = factors[i + 1] + this.timing.factors[i]
      pauses[i] = pauses[i + 1] + this.timing.pausesMs[i]
    }
    this.remainingFactor = factors
    this.remainingPauseMs = pauses
    this.pace = pace(this.timing, this.wpm)
    this.setIndex(this.clampIndex(startIndex))
    // Opening a book is like resuming after a long pause.
    this.positionChosen = false
    this.pausedAt = -Infinity
    this.resumedFrom = 0
  }

  set splitForDisplay(split: (word: string) => string[]) {
    this.split = split
    this.refreshPieces()
    this.emit()
  }

  // Derived state

  /** What's on screen: the current word, or the current piece of it. */
  get currentWord(): string | undefined {
    return this.pieces[this.pieceIndex]
  }

  get currentToken(): Token | undefined {
    return this.tokens[this.currentIndex]
  }

  /** The kind of pause after the current word. */
  get currentPause(): PauseKind {
    return this.timing.kinds[this.currentIndex] ?? 'none'
  }

  get isFinished(): boolean {
    return (
      this.tokens.length > 0 && this.currentIndex >= this.tokens.length - 1 && this.pieceIndex >= this.pieces.length - 1
    )
  }

  get progress(): number {
    return this.tokens.length > 1 ? this.currentIndex / (this.tokens.length - 1) : 0
  }

  /** Exact reading time left at the current speed, pauses included. */
  get secondsRemaining(): number {
    const i = this.currentIndex
    if (i >= this.tokens.length) return 0
    return (this.pace.base * this.remainingFactor[i] + this.pace.pauseScale * this.remainingPauseMs[i]) / 1000
  }

  private refreshPieces() {
    const t = this.currentToken
    this.pieces = t ? this.split(t.text) : []
    this.pieceIndex = 0
  }

  private setIndex(index: number) {
    this.currentIndex = index
    this.refreshPieces()
  }

  // Transport

  toggle() {
    this.isPlaying ? this.pause() : this.play()
  }

  play() {
    if (this.isPlaying || !this.tokens.length) return
    // Restart from the beginning if parked on the final word.
    if (this.isFinished) this.setIndex(0)
    else if (this.rewindOnResume && !this.positionChosen && performance.now() - this.pausedAt >= REWIND_AFTER_MS) {
      const i = this.currentIndex
      const target = Math.max(i - REWIND_WORDS, this.sentenceStart(i), Math.min(i, this.resumedFrom))
      if (target !== i) this.setIndex(target)
    }
    this.resumedFrom = this.currentIndex
    this.isPlaying = true
    this.playStartedAt = performance.now()
    this.deadline = performance.now()
    this.wordsSinceResume = 0
    this.schedule()
    this.emit()
  }

  pause() {
    if (!this.isPlaying) return
    this.isPlaying = false
    this.positionChosen = false
    this.pausedAt = performance.now()
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.playStartedAt !== undefined) {
      this.sessionSeconds += (performance.now() - this.playStartedAt) / 1000
      this.playStartedAt = undefined
    }
    this.emit()
  }

  seek(index: number) {
    const clamped = this.clampIndex(index)
    if (clamped !== this.currentIndex || this.pieceIndex !== 0) this.setIndex(clamped)
    this.positionChosen = true
    this.emit()
  }

  /** Words flashed and seconds spent playing since the last call. */
  takeSessionStats(): { words: number; seconds: number } {
    if (this.isPlaying && this.playStartedAt !== undefined) {
      const now = performance.now()
      this.sessionSeconds += (now - this.playStartedAt) / 1000
      this.playStartedAt = now
    }
    const result = { words: this.sessionWords, seconds: this.sessionSeconds }
    this.sessionWords = 0
    this.sessionSeconds = 0
    return result
  }

  // Sentence navigation

  /** Rewinds to the start of the current sentence, or the previous one if already at its start. */
  previousSentence() {
    const start = this.sentenceStart(this.currentIndex)
    this.seek(this.currentIndex - start > 1 ? start : this.sentenceStart(Math.max(0, start - 1)))
  }

  nextSentence() {
    this.seek(this.sentenceEnd(this.currentIndex) + 1)
  }

  sentenceStart(index: number): number {
    let i = this.clampIndex(index)
    while (i > 0 && !endsSentence(this.tokens[i - 1], this.tokens[i])) i--
    return i
  }

  sentenceEnd(index: number): number {
    let i = this.clampIndex(index)
    while (i < this.tokens.length - 1 && !endsSentence(this.tokens[i], this.tokens[i + 1])) i++
    return i
  }

  // Paragraph and chapter navigation

  previousParagraph() {
    this.seek(previousStart(this.paragraphStarts, this.currentIndex))
  }

  nextParagraph() {
    this.seek(nextStart(this.paragraphStarts, this.currentIndex) ?? this.tokens.length - 1)
  }

  previousIn(starts: number[]) {
    this.seek(previousStart(starts, this.currentIndex))
  }

  nextIn(starts: number[]) {
    const next = nextStart(starts, this.currentIndex)
    if (next !== undefined) this.seek(next)
  }

  paragraphIndex(containing: number): number {
    return lastPosition(this.paragraphStarts, containing) ?? 0
  }

  // Speed

  adjustWPM(steps: number) {
    this.setWPM(this.wpm + steps * WPM_STEP)
  }

  setWPM(value: number) {
    const wpm = clampWPM(value)
    if (wpm === this.wpm) return
    this.wpm = wpm
    this.pace = pace(this.timing, wpm)
    this.onWPMChange?.(wpm)
    this.emit()
  }

  // Run loop

  private schedule() {
    const i = this.currentIndex
    if (!this.isPlaying || i >= this.tokens.length) return
    const ramp = this.rampUpEnabled ? rampUpFactor(this.wordsSinceResume) : 1
    let delay = delayMs(this.timing, this.pace, i) * ramp
    // A split word shares its reading time among its pieces by length, plus
    // a little extra per piece for carrying the word over; the pause after
    // it comes with the last piece.
    if (this.pieces.length > 1) {
      const letters = this.pieces.map(p => Math.max(1, Array.from(p).length))
      const reading = this.pace.base * this.timing.factors[i] * ramp
      const isLast = this.pieceIndex === this.pieces.length - 1
      delay =
        (reading * letters[this.pieceIndex]) / letters.reduce((a, b) => a + b, 0) +
        0.15 * this.pace.base +
        (isLast ? this.pace.pauseScale * this.timing.pausesMs[i] * ramp : 0)
    }
    const now = performance.now()
    this.deadline += delay
    // After a stall (tab hidden, seek) don't race to catch up.
    if (this.deadline < now - 250) this.deadline = now
    this.timer = setTimeout(() => this.tick(), Math.max(0, this.deadline - now))
  }

  private tick() {
    if (!this.isPlaying) return
    if (this.pieceIndex < this.pieces.length - 1) {
      this.pieceIndex++
    } else if (this.currentIndex < this.tokens.length - 1) {
      this.setIndex(this.currentIndex + 1)
      this.sessionWords++
      this.wordsSinceResume++
    } else {
      // Reached the end: stop on the last word.
      this.sessionWords++
      this.pause()
      return
    }
    this.emit()
    this.schedule()
  }

  dispose() {
    this.pause()
    this.listeners.clear()
  }

  private clampIndex(index: number): number {
    return Math.min(Math.max(0, index), Math.max(0, this.tokens.length - 1))
  }
}

/** Start of the unit containing `index`, or of the previous unit when `index` is within its first two words. */
export function previousStart(starts: number[], index: number): number {
  const position = lastPosition(starts, index)
  if (position === undefined) return 0
  const current = starts[position]
  if (index - current > 1) return current
  const previous = lastPosition(starts, current - 1)
  return previous === undefined ? current : starts[previous]
}

export function nextStart(starts: number[], index: number): number | undefined {
  return starts.find(s => s > index)
}

/** Position in sorted `starts` of the last value ≤ `index` (binary search). */
export function lastPosition(starts: number[], index: number): number | undefined {
  let low = 0
  let high = starts.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (starts[mid] <= index) low = mid + 1
    else high = mid
  }
  return low > 0 ? low - 1 : undefined
}
