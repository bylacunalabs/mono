// The optional audio tick: a short, soft click as each word appears, like a
// metronome for reading. Its pitch tells what comes next: the plain tick for
// a word running on, a little lower before a bracket, comma or semicolon,
// lower still at a sentence end, lowest before a heading's pause, and a
// step down more at a paragraph end. Shorter words tick a touch higher and
// longer ones a touch lower, so the rhythm doesn't sound mechanical.
//
// Synthesised with the Web Audio API (no sound files). Browsers only allow
// audio after a user gesture, so unlock() runs when playback starts from a
// tap or key press. On iOS the ringer switch silences it, like other
// interface sounds.

import type { PauseKind } from '../core/timing'

/** Pitch of the plain tick. */
const BASE_HZ = 1320
/** Semitones below the plain tick for each kind of pause after the word. */
const PAUSE_SEMITONES: Record<PauseKind, number> = {
  none: 0,
  bracket: -1,
  comma: -3,
  strong: -4,
  sentence: -7,
  ellipsis: -8,
  heading: -10,
}
const PARAGRAPH_SEMITONES = -2
const VOLUME = 0.07

let audio: AudioContext | undefined

/** Creates or resumes the audio context; call from a user gesture. */
export function unlockTicks() {
  const Context = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return
  try {
    audio ??= new Context()
    // Mix with whatever else is playing; respect the ringer switch (Safari 16.4+).
    const session = (navigator as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'ambient'
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    audio = undefined
  }
}

/** Ticks for a word of `letters` letters followed by a `pause`. */
export function tick(letters: number, pause: PauseKind, endsParagraph: boolean) {
  if (!audio || audio.state !== 'running') return
  // ±1 semitone with the word's length: short words higher.
  const lengthSemitones = Math.max(-1, Math.min(1, (5 - letters) / 4))
  const semitones = PAUSE_SEMITONES[pause] + (endsParagraph ? PARAGRAPH_SEMITONES : 0) + lengthSemitones
  const frequency = BASE_HZ * 2 ** (semitones / 12)
  // Lower ticks ring slightly longer, as a resting point.
  const decay = 0.025 + Math.max(0, -semitones) * 0.004

  const now = audio.currentTime
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(frequency, now)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(VOLUME, now + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + decay)
  oscillator.connect(gain).connect(audio.destination)
  oscillator.start(now)
  oscillator.stop(now + decay + 0.01)
}

/** A short sample phrase, for when the tick is switched on in Settings. */
export function previewTicks() {
  unlockTicks()
  const phrase: [number, PauseKind, boolean][] = [
    [3, 'none', false], [6, 'none', false], [4, 'comma', false], [2, 'none', false], [7, 'none', false], [5, 'sentence', true],
  ]
  phrase.forEach(([letters, pause, paragraph], i) => setTimeout(() => tick(letters, pause, paragraph), 120 + i * 260))
}
