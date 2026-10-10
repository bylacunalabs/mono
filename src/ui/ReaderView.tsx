// The distraction-free reading surface: pure black, a single centred word at
// a time.
//
// • Tap anywhere: play / pause (or, in touch-and-hold mode, words run only
//   while a finger is down). While paused the full text (scrollable, with
//   chapter marks), progress and controls fade in; tapping a word jumps
//   there. In "keep text visible" mode the text stays on screen while
//   playing too, following the current word.
// • Swipe left / right, ⏪ ⏩, ← →: previous / next sentence, paragraph or
//   chapter (picked in the controls).
// • Swipe up / down, ↑ ↓: speed.
// • Pinch (or ctrl + scroll on a trackpad): text size, the same for every
//   word. It can't grow past the size at which the widest word still fits.
//
// Swipes that start at the screen's edges are left to the system (Android's
// back gesture, iOS's Notification Centre and home indicator). Scrubbing the
// position slider previews the chapter and sentence under the thumb. The
// gestures are explained the first time the reader opens.
//
// Back (button or gesture) and Escape close the reader. The text is
// tokenized in the import worker, so opening a long book doesn't freeze.
// The screen is kept awake while the reader is open (Screen Wake Lock).
// The position is saved on every pause, every 100 words, when the page is
// hidden and when the reader closes.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Book, Chapter } from '../core/book'
import { RSVPEngine } from '../core/engine'
import { pieces } from '../core/hyphenation'
import { formatReadingTime } from '../core/stats'
import { MAX_WPM, MIN_WPM, WPM_STEP } from '../core/timing'
import { sentenceAround, tokenize } from '../core/tokenizer'
import { tokenizeText } from '../import/importer'
import { library } from '../state/library'
import { settings, type NavigationUnit } from '../state/settings'
import { useObserve } from '../state/store'
import { loadText } from '../storage/db'
import { formatNumber, Menu } from './components'
import { GestureGuide } from './GestureGuide'
import {
  availableHalfWidth, BASE_FONT_SIZE, extents, maxExtents, maxFontSize, MINIMUM_SCALE, referenceExtents,
  wordViewHeight, type Extents,
} from './fonts'
import { useBackButton } from './history'
import { useSize } from './hooks'
import { Icon } from './icons'
import { haptic } from './platform'
import { RSVPWord } from './RSVPWord'
import { TextPanel } from './TextPanel'

const NO_CHAPTERS: Chapter[] = []
/** Margins, in px, where touches start the system's gestures rather than ours. */
const EDGE = 24
const EDGE_TOP = 40
const EDGE_BOTTOM = 32
const UNIT_TITLES: Record<NavigationUnit, string> = { sentence: 'Sentence', paragraph: 'Paragraph', chapter: 'Chapter' }

export function ReaderView({ book, onClose }: { book: Book; onClose: () => void }) {
  useObserve(settings)
  const engine = useMemo(
    () =>
      new RSVPEngine({
        wpm: settings.value.wpm,
        rampUp: settings.value.rampUp,
        rewindOnResume: settings.value.rewindOnResume,
        onWPMChange: wpm => settings.set('wpm', wpm),
      }),
    [],
  )
  useObserve(engine)
  useBackButton(onClose)

  const [isLoaded, setLoaded] = useState(false)
  const [textExtents, setTextExtents] = useState<Extents>()
  const [badgeVisible, setBadgeVisible] = useState(false)
  /** The position slider is being dragged. */
  const [scrubbing, setScrubbing] = useState(false)
  const [rootRef, size] = useSize<HTMLDivElement>()
  const badgeTimer = useRef<ReturnType<typeof setTimeout>>()

  const { readingFont: font, boldWord: bold, textScale, alwaysShowText, navigationUnit, holdToRead } = settings.value
  const chapters = book.chapters ?? NO_CHAPTERS
  const chapterStarts = useMemo(() => chapters.map(c => c.wordIndex), [chapters])
  // Chapter navigation needs chapters; fall back to paragraphs.
  const unit: NavigationUnit = navigationUnit === 'chapter' && !chapterStarts.length ? 'paragraph' : navigationUnit

  const isPaused = isLoaded && !engine.isPlaying
  const showsText = isLoaded && (isPaused || alwaysShowText)

  // Largest size at which every word of this text fits the reticle.
  const maxSize = maxFontSize(textExtents ?? referenceExtents(font, bold), availableHalfWidth(size.width))
  const fontSize = Math.min(BASE_FONT_SIZE * textScale, maxSize)
  const maxScale = Math.max(MINIMUM_SCALE, maxSize / BASE_FONT_SIZE)

  // Latest values for event handlers registered once.
  const live = useRef({ unit, chapterStarts, maxScale, textScale, holdToRead })
  live.current = { unit, chapterStarts, maxScale, textScale, holdToRead }

  // Loading

  useEffect(() => {
    let cancelled = false
    loadText(book.id)
      .then(text => tokenizeText(text).catch(() => tokenize(text)))
      .catch(() => [])
      .then(tokens => {
        if (cancelled) return
        engine.load(tokens, book.currentIndex)
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (isLoaded) setTextExtents(maxExtents(engine.tokens, font, bold))
  }, [isLoaded, font, bold])

  // Words wider than the reticle at the current size are shown in syllable
  // pieces; everything else stays whole.
  useEffect(() => {
    if (!size.width) return
    const halfWidth = availableHalfWidth(size.width)
    engine.splitForDisplay = word =>
      pieces(word, piece => {
        const e = extents(piece, font, bold)
        return Math.max(e.left, e.right) * fontSize <= halfWidth
      })
  }, [font, bold, fontSize, size.width])

  useEffect(() => {
    engine.rampUpEnabled = settings.value.rampUp
    engine.rewindOnResume = settings.value.rewindOnResume
  }, [settings.value.rampUp, settings.value.rewindOnResume])

  // Saving

  const saveProgress = () => {
    if (!engine.tokens.length) return
    const index = engine.currentIndex
    library.updateProgress(book.id, index, engine.tokens.length, engine.currentToken?.text, sentenceAround(engine.tokens, index))
  }

  /** Saves the position and books the words read since the last checkpoint. */
  const checkpoint = () => {
    saveProgress()
    const session = engine.takeSessionStats()
    library.recordReading(session.words, session.seconds)
  }

  useEffect(() => {
    let wasPlaying = false
    let lastIndex = engine.currentIndex
    return engine.subscribe(() => {
      if (wasPlaying && !engine.isPlaying) checkpoint()
      if (engine.isPlaying && engine.currentIndex !== lastIndex && engine.currentIndex % 100 === 0) saveProgress()
      wasPlaying = engine.isPlaying
      lastIndex = engine.currentIndex
    })
  }, [])

  // Lifecycle: wake lock, background, close.

  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    let closed = false
    const keepAwake = async () => {
      try {
        if (!closed && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
          lock = await navigator.wakeLock.request('screen')
        }
      } catch {
        // not allowed (battery saver, unsupported): reading still works
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        engine.pause()
        checkpoint()
      } else {
        keepAwake()
      }
    }
    const onPageHide = () => checkpoint()
    keepAwake()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      closed = true
      lock?.release().catch(() => {})
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      engine.pause()
      checkpoint()
      engine.dispose()
      clearTimeout(badgeTimer.current)
    }
  }, [])

  // Actions

  const flashBadge = () => {
    // Only meaningful while playing; when paused the bar shows the speed.
    if (!engine.isPlaying) return
    setBadgeVisible(true)
    clearTimeout(badgeTimer.current)
    badgeTimer.current = setTimeout(() => setBadgeVisible(false), 1500)
  }

  const changeWPM = (steps: number) => {
    const before = engine.wpm
    engine.adjustWPM(steps)
    if (engine.wpm !== before) haptic('selection')
    flashBadge()
  }

  const jump = (forward: boolean) => {
    const { unit, chapterStarts } = live.current
    if (unit === 'sentence') forward ? engine.nextSentence() : engine.previousSentence()
    else if (unit === 'paragraph') forward ? engine.nextParagraph() : engine.previousParagraph()
    else forward ? engine.nextIn(chapterStarts) : engine.previousIn(chapterStarts)
    haptic('light')
  }

  const setScale = (scale: number) => {
    settings.set('textScale', Math.min(Math.max(scale, MINIMUM_SCALE), live.current.maxScale))
  }

  // Keyboard

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, .menu')) return
      switch (event.key) {
        case ' ':
          // Touch-and-hold mode: hold the space bar.
          if (live.current.holdToRead) {
            if (!event.repeat) engine.play()
          } else engine.toggle()
          break
        case 'ArrowUp': changeWPM(1); break
        case 'ArrowDown': changeWPM(-1); break
        case 'ArrowLeft': jump(false); break
        case 'ArrowRight': jump(true); break
        case 'Escape': onClose(); break
        default: return
      }
      event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' && live.current.holdToRead) engine.pause()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Gestures: tap, swipe, pinch, ctrl + wheel.

  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = surface.current
    if (!element) return
    const pointers = new Map<number, { x: number; y: number; startX: number; startY: number; fromEdge: boolean }>()
    let axis: 'h' | 'v' | undefined
    let appliedSteps = 0
    let pinch: { distance: number; scale: number } | undefined
    let wasPinch = false
    let isTap = false

    const distance = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    /** A touch starting this close to an edge belongs to the system's own gestures. */
    const fromEdge = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return false
      const { width, height } = element.getBoundingClientRect()
      const x = event.clientX
      const y = event.clientY
      return x < EDGE || x > width - EDGE || y < EDGE_TOP || y > height - EDGE_BOTTOM
    }

    const down = (event: PointerEvent) => {
      element.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, {
        x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, fromEdge: fromEdge(event),
      })
      if (pointers.size === 1) {
        axis = undefined
        appliedSteps = 0
        wasPinch = false
        if (live.current.holdToRead) engine.play()
      } else if (pointers.size === 2) {
        // Start from the size actually shown, which may be capped.
        pinch = { distance: distance(), scale: Math.min(live.current.textScale, live.current.maxScale) }
        wasPinch = true
        if (live.current.holdToRead) engine.pause()
      }
    }

    const move = (event: PointerEvent) => {
      const pointer = pointers.get(event.pointerId)
      if (!pointer) return
      pointer.x = event.clientX
      pointer.y = event.clientY
      if (pinch && pointers.size >= 2) {
        setScale((pinch.scale * distance()) / Math.max(1, pinch.distance))
        return
      }
      if (wasPinch || pointer.fromEdge) return
      const dx = pointer.x - pointer.startX
      const dy = pointer.y - pointer.startY
      if (!axis && Math.hypot(dx, dy) > 20) {
        axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
        // Holding to read: a sideways swipe stops to skip; speed changes keep reading.
        if (axis === 'h' && live.current.holdToRead) engine.pause()
      }
      if (axis === 'v') {
        // One speed step per 40 px of vertical travel; up is faster.
        const steps = Math.trunc(-dy / 40)
        if (steps !== appliedSteps) {
          changeWPM(steps - appliedSteps)
          appliedSteps = steps
        }
      }
    }

    const up = (event: PointerEvent) => {
      const pointer = pointers.get(event.pointerId)
      pointers.delete(event.pointerId)
      if (pointers.size < 2) pinch = undefined
      isTap = false
      if (live.current.holdToRead && pointers.size === 0) engine.pause()
      if (!pointer || wasPinch || event.type === 'pointercancel') return
      const dx = pointer.x - pointer.startX
      const dy = pointer.y - pointer.startY
      isTap = !axis && Math.hypot(dx, dy) < 10
      // Like turning a page: swipe left to go forward.
      if (axis === 'h' && Math.abs(dx) > 50) jump(dx < 0)
    }

    // Play / pause on the click that follows a tap, not on pointerup: the
    // text panel appears on pause, and the click would otherwise land on it.
    const click = () => {
      if (isTap && !live.current.holdToRead) engine.toggle()
      isTap = false
    }

    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setScale(Math.min(live.current.textScale, live.current.maxScale) * Math.exp(-event.deltaY / 100))
    }

    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    element.addEventListener('wheel', wheel, { passive: false })
    element.addEventListener('click', click)
    return () => {
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      element.removeEventListener('wheel', wheel)
      element.removeEventListener('click', click)
    }
  }, [])

  // Layout

  const lift = showsText ? size.height * 0.2 : 0
  const wordBottom = size.height / 2 - size.height * 0.2 + wordViewHeight(fontSize) / 2
  const panelHeight = Math.max(0, size.height - 8 - wordBottom - 12)
  const currentChapter = chapters.findLast(c => c.wordIndex <= engine.currentIndex)
  const total = engine.tokens.length

  return (
    <div class="reader" ref={rootRef}>
      <div class="reader-surface" ref={surface} aria-label={engine.currentWord ?? book.title} />

      <div class="reader-word" style={{ transform: `translateY(${-lift}px)` }}>
        {!isLoaded ? (
          <span class="spinner large" />
        ) : engine.currentWord !== undefined ? (
          <RSVPWord word={engine.currentWord} font={font} fontSize={fontSize} />
        ) : (
          <div class="reader-empty">
            <Icon name="book" size={48} />
            <span>Empty text</span>
          </div>
        )}
      </div>

      {showsText && (
        <TextPanel
          tokens={engine.tokens}
          paragraphs={engine.paragraphRanges}
          chapters={chapters}
          currentIndex={engine.currentIndex}
          isPlaying={engine.isPlaying}
          font={font}
          onSelect={index => engine.seek(index)}
          style={{
            top: wordBottom + 12,
            height: panelHeight,
            opacity: panelHeight > 60 ? 1 : 0,
          }}
        />
      )}

      {isPaused ? (
        <div class="reader-controls">
          <div class="reader-top">
            <button type="button" class="glass-circle" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={20} />
            </button>
            <div class="reader-title">
              <div class="title">{book.title}</div>
              {currentChapter && <div class="chapter">{currentChapter.title}</div>}
            </div>
            {chapters.length > 0 ? (
              <Menu
                label="Chapters"
                class="glass-circle"
                items={chapters.map(chapter => ({
                  label: chapter.title,
                  checked: chapter === currentChapter,
                  onSelect: () => engine.seek(chapter.wordIndex),
                }))}
              >
                <Icon name="list" size={20} />
              </Menu>
            ) : (
              <span class="glass-circle-placeholder" />
            )}
          </div>

          <div class="reader-bottom-scrim" />
          <div class="reader-bottom glass">
            <div class="position">
              <input
                type="range"
                class="slider"
                min={0}
                max={Math.max(1, total - 1)}
                step={1}
                value={engine.currentIndex}
                disabled={total < 2}
                aria-label="Position"
                onPointerDown={() => setScrubbing(true)}
                onPointerUp={() => setScrubbing(false)}
                onPointerCancel={() => setScrubbing(false)}
                onBlur={() => setScrubbing(false)}
                onInput={e => engine.seek(Number(e.currentTarget.value))}
              />
              {scrubbing && <ScrubPreview engine={engine} chapters={chapters} />}
              <div class="position-labels">
                <span class="mono-digits">
                  {formatNumber(engine.currentIndex + 1)} / {formatNumber(total)}
                </span>
                <span>{formatReadingTime(engine.secondsRemaining)}</span>
              </div>
            </div>

            <div class="transport">
              <Menu
                label="Skip by"
                title="Skip by"
                class="small-labeled"
                align="left"
                direction="up"
                items={(['sentence', 'paragraph', 'chapter'] as NavigationUnit[]).map(option => ({
                  label: UNIT_TITLES[option],
                  checked: option === unit,
                  disabled: option === 'chapter' && !chapterStarts.length,
                  onSelect: () => settings.set('navigationUnit', option),
                }))}
              >
                <Icon name="arrows" size={22} />
                <span>{UNIT_TITLES[unit]}</span>
              </Menu>
              <button type="button" class="skip" aria-label={`Previous ${unit}`} onClick={() => jump(false)}>
                <Icon name="backward" size={26} />
              </button>
              <button type="button" class="play" aria-label="Play" onClick={() => engine.play()}>
                <Icon name="play" size={34} />
              </button>
              <button type="button" class="skip" aria-label={`Next ${unit}`} onClick={() => jump(true)}>
                <Icon name="forward" size={26} />
              </button>
              <button
                type="button"
                class={alwaysShowText ? 'small-labeled active' : 'small-labeled'}
                aria-label="Keep text visible"
                aria-pressed={alwaysShowText}
                onClick={() => settings.set('alwaysShowText', !alwaysShowText)}
              >
                <Icon name="text" size={22} />
                <span>Text</span>
              </button>
            </div>

            <div class="speed">
              <div class="speed-labels">
                <span class="speed-title">Reading speed</span>
                <span class="speed-value">{engine.wpm} WPM</span>
              </div>
              <input
                type="range"
                class="slider"
                min={MIN_WPM}
                max={MAX_WPM}
                step={WPM_STEP}
                value={engine.wpm}
                aria-label="Reading speed"
                onInput={e => engine.setWPM(Number(e.currentTarget.value))}
              />
            </div>
          </div>
        </div>
      ) : (
        isLoaded && <div class="reader-progress" style={{ width: `${engine.progress * 100}%` }} />
      )}

      {isLoaded && !settings.value.didShowGestures && (
        <GestureGuide onClose={() => settings.set('didShowGestures', true)} />
      )}

      {badgeVisible && (
        <div class="wpm-badge glass">
          <Icon name="speed" size={18} />
          <strong>{engine.wpm}</strong>
          <span>WPM</span>
        </div>
      )}
    </div>
  )
}

/** Where the slider's thumb is: the chapter, how far in, and the sentence there. */
function ScrubPreview({ engine, chapters }: { engine: RSVPEngine; chapters: Chapter[] }) {
  const index = engine.currentIndex
  const chapter = chapters.findLast(c => c.wordIndex <= index)
  const sentence = sentenceAround(engine.tokens, index, 6, 10)
  return (
    <div class="scrub-preview glass" aria-hidden="true">
      <div class="scrub-heading">
        <span class="scrub-chapter">{chapter?.title ?? 'Position'}</span>
        <span class="mono-digits">{Math.round(engine.progress * 100)}%</span>
      </div>
      {sentence && (
        <p class="scrub-sentence">
          {sentence.before} <strong>{sentence.word}</strong> {sentence.after}
        </p>
      )}
    </div>
  )
}
