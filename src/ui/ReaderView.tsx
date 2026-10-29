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
//   word, up to where short words fill the screen's width; words too wide
//   at that size are shown in syllable pieces.
//
// On a phone on its side, while paused the screen splits in two: on the left
// the text with the player (position, skip, play, speed) and on the right
// the word in its reticle. Reading, the word takes the whole screen, unless
// the text is kept beside it ("Text" in the player): then the left half
// keeps only the text, scrolling along with the word. The word size is kept
// apart from the upright one, and on Android reading goes full screen,
// locked on its side. Upright on a phone, a one-time hint suggests turning
// it.
//
// Swipes that start at the screen's edges are left to the system (Android's
// back gesture, iOS's Notification Centre and home indicator). Scrubbing the
// position slider previews the chapter and sentence under the thumb. The
// gestures are explained the first time the reader opens.
//
// Back (button or gesture) and Escape close the reader. The text is
// tokenized in the import worker, so opening a long book doesn't freeze.
// The screen is kept awake while the reader is open (Screen Wake Lock).
// With the tick sound on, each word ticks as it appears (see ticks.ts).
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
import { settings, textScaleKey, type NavigationUnit } from '../state/settings'
import { useObserve } from '../state/store'
import { loadText } from '../storage/db'
import { formatNumber, Menu } from './components'
import { GestureGuide } from './GestureGuide'
import {
  availableHalfWidth,
  BASE_FONT_SIZE,
  extents,
  maxExtents,
  maxFontSize,
  maxFontSizeForHeight,
  MINIMUM_SCALE,
  referenceExtents,
  wordViewHeight,
  ZOOM_WORD_LIMIT,
  type Extents,
} from './fonts'
import { useBackButton } from './history'
import { LANDSCAPE_PHONE, useMediaQuery, useSize } from './hooks'
import { Icon } from './icons'
import { haptic, immerseInLandscape, isTouch, leaveImmersion } from './platform'
import { tick, unlockTicks } from './ticks'
import { RSVPWord } from './RSVPWord'
import { TextPanel } from './TextPanel'

const NO_CHAPTERS: Chapter[] = []
/** Margins, in px, where touches start the system's gestures rather than ours. */
const EDGE = 24
const EDGE_TOP = 40
const EDGE_BOTTOM = 32
/** On its side, split in two: the share of the width left to the word. */
const WORD_SHARE = 0.5
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
  const [textExtents, setTextExtents] = useState<{ whole: Extents; short: Extents }>()
  const [badgeVisible, setBadgeVisible] = useState(false)
  /** The position slider is being dragged. */
  const [scrubbing, setScrubbing] = useState(false)
  const [rootRef, size] = useSize<HTMLDivElement>()
  const badgeTimer = useRef<ReturnType<typeof setTimeout>>()
  const landscape = useMediaQuery(LANDSCAPE_PHONE)

  const { readingFont: font, boldWord: bold, alwaysShowText, navigationUnit, holdToRead } = settings.value
  const scaleKey = textScaleKey(landscape)
  const textScale = settings.value[scaleKey]
  const chapters = book.chapters ?? NO_CHAPTERS
  const chapterStarts = useMemo(() => chapters.map(c => c.wordIndex), [chapters])
  // Chapter navigation needs chapters; fall back to paragraphs.
  const unit: NavigationUnit = navigationUnit === 'chapter' && !chapterStarts.length ? 'paragraph' : navigationUnit

  const isPaused = isLoaded && !engine.isPlaying
  const showsText = isLoaded && (isPaused || alwaysShowText)
  /** On its side, the text (and the player while paused) on the left, the word on the right. */
  const split = landscape && showsText
  /** Width of the word's area: the right half when split. */
  const wordWidth = split ? size.width * WORD_SHARE : size.width

  // The zoom's limit: short words fill the whole width (or the height).
  // Past the size at which every word fits whole, longer words are split
  // into syllables; split in two, the word stays at that size.
  const zoomSize = Math.min(
    maxFontSize(textExtents?.short ?? referenceExtents(font, bold, true), availableHalfWidth(size.width)),
    maxFontSizeForHeight(size.height),
  )
  const wholeSize = maxFontSize(textExtents?.whole ?? referenceExtents(font, bold), availableHalfWidth(wordWidth))
  const fontSize = Math.min(BASE_FONT_SIZE * textScale, zoomSize, split ? wholeSize : Infinity)
  const maxScale = Math.max(MINIMUM_SCALE, zoomSize / BASE_FONT_SIZE)

  // Latest values for event handlers registered once.
  const live = useRef({ unit, chapterStarts, maxScale, textScale, holdToRead, scaleKey, landscape })
  live.current = { unit, chapterStarts, maxScale, textScale, holdToRead, scaleKey, landscape }

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
    if (isLoaded)
      setTextExtents({
        whole: maxExtents(engine.tokens, font, bold),
        short: maxExtents(engine.tokens, font, bold, ZOOM_WORD_LIMIT),
      })
  }, [isLoaded, font, bold])

  // Words wider than the reticle at the current size are shown in syllable
  // pieces; everything else stays whole.
  useEffect(() => {
    if (!wordWidth) return
    const halfWidth = availableHalfWidth(wordWidth)
    engine.splitForDisplay = word =>
      pieces(word, piece => {
        const e = extents(piece, font, bold)
        return Math.max(e.left, e.right) * fontSize <= halfWidth
      })
  }, [font, bold, fontSize, wordWidth])

  useEffect(() => {
    engine.rampUpEnabled = settings.value.rampUp
    engine.rewindOnResume = settings.value.rewindOnResume
  }, [settings.value.rampUp, settings.value.rewindOnResume])

  // Saving

  const saveProgress = () => {
    if (!engine.tokens.length) return
    const index = engine.currentIndex
    library.updateProgress(
      book.id,
      index,
      engine.tokens.length,
      engine.currentToken?.text,
      sentenceAround(engine.tokens, index),
    )
  }

  /** Saves the position and books the words read since the last checkpoint. */
  const checkpoint = () => {
    saveProgress()
    const session = engine.takeSessionStats()
    library.recordReading(session.words, session.seconds)
  }

  // Android on its side: full screen, locked on its side. Tried when the
  // phone turns and again on play, which comes with the tap it needs.
  useEffect(() => {
    if (landscape) void immerseInLandscape()
  }, [landscape])
  useEffect(() => () => leaveImmersion(), [])

  // Tick sound: one tick per word shown while playing.
  useEffect(() => {
    let wasPlaying = false
    let lastIndex = -1
    return engine.subscribe(() => {
      const started = engine.isPlaying && !wasPlaying
      wasPlaying = engine.isPlaying
      if (started && live.current.landscape && !document.fullscreenElement) void immerseInLandscape()
      if (!settings.value.tickSound || !engine.isPlaying) {
        lastIndex = -1
        return
      }
      // Playback starts from a tap or key press: the moment audio may start.
      if (started) unlockTicks()
      if (engine.currentIndex === lastIndex) return
      lastIndex = engine.currentIndex
      const token = engine.currentToken
      if (!token) return
      const letters = Array.from(token.text).filter(c => /[\p{L}\p{N}]/u.test(c)).length
      tick(letters, engine.currentPause, token.endsParagraph)
    })
  }, [])

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
    settings.set(live.current.scaleKey, Math.min(Math.max(scale, MINIMUM_SCALE), live.current.maxScale))
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
        case 'ArrowUp':
          changeWPM(1)
          break
        case 'ArrowDown':
          changeWPM(-1)
          break
        case 'ArrowLeft':
          jump(false)
          break
        case 'ArrowRight':
          jump(true)
          break
        case 'Escape':
          onClose()
          break
        default:
          return
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
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        fromEdge: fromEdge(event),
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

  // Layout. Upright: the word sits above the text, which fills the screen
  // below it, and the controls float over the bottom while paused. On its
  // side: the word stays centred, in the right half when split.

  const wordHeight = wordViewHeight(fontSize)
  const wordShift = showsText && !landscape ? -size.height * 0.2 : 0
  const panelTop = size.height / 2 - size.height * 0.2 + wordHeight / 2 + 12
  const panelHeight = Math.max(0, size.height - panelTop - 8)
  const currentChapter = chapters.findLast(c => c.wordIndex <= engine.currentIndex)
  const total = engine.tokens.length

  const changeSpeed = (steps: number) => {
    engine.adjustWPM(steps)
    haptic('selection')
  }

  const positionSlider = (
    <>
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
    </>
  )
  const positionCount = (
    <span class="mono-digits">
      {formatNumber(engine.currentIndex + 1)} / {formatNumber(total)}
    </span>
  )
  const timeLeft = <span>{formatReadingTime(engine.secondsRemaining)}</span>

  const skipByMenu = (
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
  )
  const skipButton = (forward: boolean) => (
    <button
      type="button"
      class="skip"
      aria-label={`${forward ? 'Next' : 'Previous'} ${unit}`}
      onClick={() => jump(forward)}
    >
      <Icon name={forward ? 'forward' : 'backward'} size={26} />
    </button>
  )
  const chaptersMenu =
    chapters.length > 0 ? (
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
    )
  const closeButton = (
    <button type="button" class="glass-circle" aria-label="Close" onClick={onClose}>
      <Icon name="close" size={20} />
    </button>
  )
  const title = (
    <div class="reader-title">
      <div class="title">{book.title}</div>
      {currentChapter && <div class="chapter">{currentChapter.title}</div>}
    </div>
  )

  const textToggle = (
    <button
      type="button"
      class={alwaysShowText ? 'small-labeled active' : 'small-labeled'}
      aria-label={landscape ? 'Keep text beside the word' : 'Keep text visible'}
      aria-pressed={alwaysShowText}
      onClick={() => settings.set('alwaysShowText', !alwaysShowText)}
    >
      <Icon name="text" size={22} />
      <span>Text</span>
    </button>
  )

  return (
    <div class={`reader${landscape ? ' landscape' : ''}${split ? ' split' : ''}`} ref={rootRef}>
      <div class="reader-surface" ref={surface} aria-label={engine.currentWord ?? book.title} />

      <div class="reader-word" style={{ transform: `translateY(${wordShift}px)` }}>
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

      {split ? (
        // On its side: the left half. Paused, the player around the text;
        // reading with the text kept, the text alone.
        <div class="side-column">
          {isPaused && (
            <div class="side-top">
              {closeButton}
              {title}
              {chaptersMenu}
            </div>
          )}
          <TextPanel
            tokens={engine.tokens}
            paragraphs={engine.paragraphRanges}
            chapters={chapters}
            currentIndex={engine.currentIndex}
            isPlaying={engine.isPlaying}
            font={font}
            onSelect={index => engine.seek(index)}
            side
          />
          {isPaused && (
            <div class="side-player glass">
              <div class="position-row">
                {positionCount}
                <div class="position">{positionSlider}</div>
                {timeLeft}
              </div>
              <div class="transport">
                {skipByMenu}
                {skipButton(false)}
                <button type="button" class="play" aria-label="Play" onClick={() => engine.play()}>
                  <Icon name="play" size={28} />
                </button>
                {skipButton(true)}
                {textToggle}
              </div>
              <div class="speed-row">
                <span class="speed-title">Speed</span>
                <div class="speed-stepper" role="group" aria-label="Reading speed">
                  <button
                    type="button"
                    aria-label="Slower"
                    disabled={engine.wpm <= MIN_WPM}
                    onClick={() => changeSpeed(-1)}
                  >
                    −
                  </button>
                  <span class="speed-value">
                    {engine.wpm} <small>WPM</small>
                  </span>
                  <button
                    type="button"
                    aria-label="Faster"
                    disabled={engine.wpm >= MAX_WPM}
                    onClick={() => changeSpeed(1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        showsText &&
        !landscape && (
          <TextPanel
            tokens={engine.tokens}
            paragraphs={engine.paragraphRanges}
            chapters={chapters}
            currentIndex={engine.currentIndex}
            isPlaying={engine.isPlaying}
            font={font}
            onSelect={index => engine.seek(index)}
            style={{ top: panelTop, height: panelHeight, opacity: panelHeight > 60 ? 1 : 0 }}
          />
        )
      )}

      {isPaused && !landscape ? (
        <div class="reader-controls">
          <div class="reader-top">
            {closeButton}
            {title}
            {chaptersMenu}
          </div>

          <div class="reader-bottom-scrim" />
          <div class="reader-bottom glass">
            <div class="position">
              {positionSlider}
              <div class="position-labels">
                {positionCount}
                {timeLeft}
              </div>
            </div>

            <div class="transport">
              {skipByMenu}
              {skipButton(false)}
              <button type="button" class="play" aria-label="Play" onClick={() => engine.play()}>
                <Icon name="play" size={34} />
              </button>
              {skipButton(true)}
              {textToggle}
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
        isLoaded && engine.isPlaying && <div class="reader-progress" style={{ width: `${engine.progress * 100}%` }} />
      )}

      {isLoaded &&
        settings.value.didShowGestures &&
        !settings.value.didShowRotateHint &&
        isTouch &&
        !landscape &&
        Math.min(screen.width, screen.height) < 500 && <RotateHint />}

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

/** Once, upright on a phone: turning it sideways gives the words more room. */
function RotateHint() {
  useEffect(() => {
    const timer = setTimeout(() => settings.set('didShowRotateHint', true), 6000)
    return () => {
      clearTimeout(timer)
      // Turned (unmounted by the layout) or closed: shown either way.
      settings.set('didShowRotateHint', true)
    }
  }, [])
  return (
    <div class="rotate-hint glass" role="status">
      <Icon name="rotate" size={22} class="brand" />
      <span>Turn sideways for bigger words</span>
    </div>
  )
}
