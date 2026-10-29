// The optional audio tick: a drumstick click as each word appears, like a
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

/** Pitch of the plain tick: two hickory drumsticks struck together. */
const BASE_HZ = 850
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
const VOLUME = 0.6

let audio: AudioContext | undefined
let noise: AudioBuffer | undefined

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
  woodTick(audio, audio.currentTime, tickPitch(letters, pause, endsParagraph))
}

/** Semitones from the plain tick. */
export function tickPitch(letters: number, pause: PauseKind, endsParagraph: boolean): number {
  // ±1 semitone with the word's length: short words higher.
  const lengthSemitones = Math.max(-1, Math.min(1, (5 - letters) / 4))
  return PAUSE_SEMITONES[pause] + (endsParagraph ? PARAGRAPH_SEMITONES : 0) + lengthSemitones
}

/**
 * Two drumsticks struck together: a click of a few milliseconds rung
 * through the sticks' first three bending modes (a free bar's 1 : 2.76 :
 * 5.40, inharmonic, which is what makes it sound like wood rather than a
 * bell), damped hard so it's over in about 20 ms, plus a little of the raw
 * click on top for the "crack" of the hit.
 */
export function woodTick(context: BaseAudioContext, when: number, semitones: number) {
  const frequency = BASE_HZ * 2 ** (semitones / 12)

  if (!noise || noise.sampleRate !== context.sampleRate) {
    const length = Math.round(context.sampleRate * 0.003)
    noise = context.createBuffer(1, length, context.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  }

  const out = context.createGain()
  out.gain.value = VOLUME
  out.connect(context.destination)

  const click = context.createBufferSource()
  click.buffer = noise

  // The sticks' modes: frequency ratio, sharpness (how long it rings), level.
  for (const [ratio, q, level] of [
    [1, 38, 7],
    [2.76, 30, 3.5],
    [5.4, 24, 1.2],
  ]) {
    const mode = context.createBiquadFilter()
    mode.type = 'bandpass'
    mode.frequency.value = frequency * ratio
    mode.Q.value = q
    const gain = context.createGain()
    gain.gain.value = level
    click.connect(mode).connect(gain).connect(out)
  }

  // The crack: the bare click, highs only.
  const crack = context.createBiquadFilter()
  crack.type = 'highpass'
  crack.frequency.value = 2500
  const crackGain = context.createGain()
  crackGain.gain.value = 0.35
  click.connect(crack).connect(crackGain).connect(out)

  click.start(when)
}

/** A short sample phrase: plain words, a comma, a sentence end and a paragraph end. */
// prettier-ignore
export const SAMPLE_PHRASE: [number, PauseKind, boolean][] = [
  [3, 'none', false], [6, 'none', false], [4, 'comma', false], [2, 'none', false], [7, 'none', false], [5, 'sentence', true],
]

/** Plays the sample phrase, for when the tick is switched on in Settings. */
export function previewTicks() {
  unlockTicks()
  SAMPLE_PHRASE.forEach(([letters, pause, paragraph], i) =>
    setTimeout(() => tick(letters, pause, paragraph), 120 + i * 260),
  )
}
