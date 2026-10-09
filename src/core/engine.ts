// Drives Rapid Serial Visual Presentation: holds the tokenized word stream,
// advances through it on a dynamic timer, and exposes what the reader needs
// to render the word, navigate and show the text while paused.
//
// Each word is scheduled against an absolute deadline so timer overhead
// doesn't accumulate as drift at high speeds (1200 WPM = 50 ms per word).

import { clampWPM, DEFAULT_WPM, rampUpFactor, WPM_STEP, weights as computeWeights } from './timing'
import { endsSentence, type Token } from './tokenizer'

export class RSVPEngine {
  tokens: Token[] = []
  currentIndex = 0
  /** Display pieces of the current word (usually just the word) and which one is showing. */
  pieces: string[] = []
  pieceIndex = 0
  isPlaying = false
  wpm: number
  rampUpEnabled: boolean
  /** Token index where each paragraph begins (sorted). */
  paragraphStarts: number[] = []
  /** Token range [start, end) of every paragraph, for the text panel. */
  paragraphRanges: [number, number][] = []

  /** Splits a word too wide for the screen into display pieces. */
  private split: (word: string) => string[] = w => [w]
  private weights: number[] = []
  /** `remainingWeight[i]` is the total weight of tokens `i...`. */
  private remainingWeight: number[] = [0]
  private timer: ReturnType<typeof setTimeout> | undefined
  private deadline = 0
  private wordsSinceResume = 0
  private listeners = new Set<() => void>()

  // Reading-session accounting for statistics.
  private sessionWords = 0
  private sessionSeconds = 0
  private playStartedAt: number | undefined

  constructor(options: { wpm?: number; rampUp?: boolean; onWPMChange?: (wpm: number) => void } = {}) {
    this.wpm = clampWPM(options.wpm || DEFAULT_WPM)
    this.rampUpEnabled = options.rampUp ?? true
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
    this.weights = computeWeights(tokens)
    this.paragraphStarts = tokens.length ? [0] : []
    for (let i = 0; i < tokens.length - 1; i++) if (tokens[i].endsParagraph) this.paragraphStarts.push(i + 1)
    this.paragraphRanges = this.paragraphStarts.map((start, i) => [start, this.paragraphStarts[i + 1] ?? tokens.length])
    const sums = new Array<number>(tokens.length + 1).fill(0)
    for (let i = tokens.length - 1; i >= 0; i--) sums[i] = sums[i + 1] + this.weights[i]
    this.remainingWeight = sums
    this.setIndex(this.clampIndex(startIndex))
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

  get isFinished(): boolean {
    return this.tokens.length > 0 && this.currentIndex >= this.tokens.length - 1 && this.pieceIndex >= this.pieces.length - 1
  }

  get progress(): number {
    return this.tokens.length > 1 ? this.currentIndex / (this.tokens.length - 1) : 0
  }

  /** Exact reading time left at the current speed, pauses included. */
  get secondsRemaining(): number {
    if (this.currentIndex >= this.tokens.length) return 0
    return (this.remainingWeight[this.currentIndex] * 60) / this.wpm
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
    while (i > 0 && !endsSentence(this.tokens[i - 1])) i--
    return i
  }

  sentenceEnd(index: number): number {
    let i = this.clampIndex(index)
    while (i < this.tokens.length - 1 && !endsSentence(this.tokens[i])) i++
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
    this.onWPMChange?.(wpm)
    this.emit()
  }

  // Run loop

  private schedule() {
    if (!this.isPlaying || this.currentIndex >= this.tokens.length) return
    let multiplier = this.weights[this.currentIndex]
    if (this.rampUpEnabled) multiplier *= rampUpFactor(this.wordsSinceResume)
    // A split word shares its time among its pieces by length, plus a little
    // extra per piece for carrying the word over.
    if (this.pieces.length > 1) {
      const letters = this.pieces.map(p => Math.max(1, Array.from(p).length))
      multiplier = (multiplier * letters[this.pieceIndex]) / letters.reduce((a, b) => a + b, 0) + 0.15
    }
    const now = performance.now()
    this.deadline += (60_000 / this.wpm) * multiplier
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
