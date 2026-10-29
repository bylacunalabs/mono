// The landing page's reader: the app's own tokenizer, recognition point and
// timing model (src/core), driving the reticle in the hero. Built with the
// app as app/demo.js (see vite.config.ts).

import { orpParts } from '../src/core/orp'
import { DEFAULT_WPM, delayMs, MAX_WPM, MIN_WPM, pace, rampUpFactor, textTiming, WPM_STEP } from '../src/core/timing'
import { tokenize } from '../src/core/tokenizer'

const TEXT =
  'Mono shows you one word at a time. Your eyes stay still, and the words come to them. ' +
  'The red letter is the optimal recognition point: where your gaze naturally lands. ' +
  'With no lines to chase, your attention goes to the meaning. ' +
  'Sentences end with a short pause, frequent words pass a little quicker, and longer ones linger. ' +
  'Import a book, an article or a PDF, choose your speed, and simply read.'

/** Rest on the last word before starting over. */
const LOOP_PAUSE_MS = 1400

/** Shows `word` in a .reticle, its focus letter on the centre line. */
function showWord(reticle: HTMLElement, word: string) {
  const { prefix, orp, suffix } = orpParts(word)
  const [pre, focus, post] = reticle.querySelectorAll('.word span')
  pre.textContent = prefix
  focus.textContent = orp
  post.textContent = suffix
  reticle.style.setProperty('--pre', String(Array.from(prefix).length))
  reticle.style.setProperty('--suf', String(Array.from(suffix).length))
}

document.querySelectorAll<HTMLElement>('.reticle[data-word]').forEach(r => showWord(r, r.dataset.word ?? ''))

const demo = document.getElementById('demo')
const reticle = document.getElementById('reticle')
const playButton = document.getElementById('play')
const speed = document.getElementById('speed') as HTMLInputElement | null
const progress = document.getElementById('progress')

if (demo && reticle && playButton && speed && progress) {
  const tokens = tokenize(TEXT)
  const timing = textTiming(tokens)
  let current = pace(timing, DEFAULT_WPM)
  let index = 0
  let sinceResume = 0
  let timer = 0
  let playing = false
  let pausedByHand = matchMedia('(prefers-reduced-motion: reduce)').matches

  speed.min = String(MIN_WPM)
  speed.max = String(MAX_WPM)
  speed.step = String(WPM_STEP)
  speed.value = String(DEFAULT_WPM)

  const render = () => {
    showWord(reticle, tokens[index].text)
    reticle.setAttribute('aria-label', tokens[index].text)
    progress.textContent = `${index + 1} / ${tokens.length}`
  }

  const step = () => {
    const last = index === tokens.length - 1
    const wait = delayMs(timing, current, index) * rampUpFactor(sinceResume) + (last ? LOOP_PAUSE_MS : 0)
    timer = window.setTimeout(() => {
      index = last ? 0 : index + 1
      sinceResume = last ? 0 : sinceResume + 1
      render()
      step()
    }, wait)
  }

  const setPlaying = (value: boolean) => {
    if (value === playing) return
    playing = value
    demo.classList.toggle('playing', playing)
    playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play')
    clearTimeout(timer)
    if (playing) {
      sinceResume = 0
      step()
    }
  }

  const toggle = () => {
    pausedByHand = playing
    setPlaying(!playing)
  }

  playButton.addEventListener('click', toggle)
  reticle.addEventListener('click', toggle)

  const duration = (minutes: number) => {
    if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`
    const hours = minutes / 60
    return `${hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)} h`
  }

  const setText = (id: string, text: string) => {
    const element = document.getElementById(id)
    if (element) element.textContent = text
  }

  const setSpeed = () => {
    const wpm = Number(speed.value)
    current = pace(timing, wpm)
    speed.style.setProperty('--value', `${((wpm - MIN_WPM) / (MAX_WPM - MIN_WPM)) * 100}%`)
    setText('wpm-value', String(wpm))
    // The WPM setting is the real average speed, so these hold for any text.
    // Typical lengths: an article ~1,500 words, a short story ~7,500, a novel ~90,000.
    setText('t-article', duration(1500 / wpm))
    setText('t-story', duration(7500 / wpm))
    setText('t-novel', duration(90000 / wpm))
  }

  speed.addEventListener('input', setSpeed)
  setSpeed()
  render()

  // Plays while in view, unless paused by hand.
  new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) setPlaying(false)
      else if (!pausedByHand) setPlaying(true)
    },
    { threshold: 0.4 },
  ).observe(reticle)
}
