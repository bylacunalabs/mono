// The home screen: the Mono wordmark with today's reading, a "continue
// reading" card showing the sentence at the bookmark with the eye's resting
// letter marked as in the reader, and the searchable (by title or author),
// sortable list of texts with their covers, authors and years. Each row's
// menu renames, restarts or deletes it; swiping a row left shows Start Over
// and Delete, and a long swipe deletes straight away. Deleting can be undone
// from the snackbar that follows. On Android, adding is a floating button.

import { useEffect, useRef, useState } from 'preact/hooks'
import {
  byline,
  continueReading,
  currentChapter,
  estimatedSecondsRemaining,
  isFinished,
  progress,
  SORT_TITLES,
  sortBooks,
  SOURCE_LABEL,
  type Book,
  type LibrarySort,
  type SentenceContext,
} from '../core/book'
import { orpParts } from '../core/orp'
import { currentStreak, formatReadingTime, statsOn, totalWords } from '../core/stats'
import { ACCEPTED_FILES } from '../import/extract'
import { covers } from '../state/covers'
import { library, UNDO_SECONDS } from '../state/library'
import { settings } from '../state/settings'
import { useObserve } from '../state/store'
import { Alert, formatNumber, formatPercent, Menu, ProgressBar, Sheet, type MenuItem } from './components'
import { cssFont, type ReadingFont } from './fonts'
import { Icon } from './icons'
import { haptic, platform } from './platform'
import { RSVPWord } from './RSVPWord'
import wordmark from './wordmark.svg?raw'

export function LibraryView(props: {
  /** `from`: the element the reader grows out of. */
  onOpen: (book: Book, from?: HTMLElement | null) => void
  onShowStats: () => void
  /** The "new text" sheet is open (also opened by the Paste Text shortcut). */
  pasting: boolean
  onPastingChange: (pasting: boolean) => void
}) {
  useObserve(library)
  useObserve(settings)
  useObserve(covers)
  const fileInput = useRef<HTMLInputElement>(null)
  const setShowNewText = props.onPastingChange
  const [renaming, setRenaming] = useState<Book>()
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false)

  const sort = settings.value.librarySort
  const query = search.trim().toLocaleLowerCase()
  const matches = (b: Book) =>
    b.title.toLocaleLowerCase().includes(query) || !!b.author?.toLocaleLowerCase().includes(query)
  const visible = sortBooks(query ? library.books.filter(matches) : library.books, sort)
  const resume = query ? undefined : continueReading(library.books)

  const pickFiles = () => fileInput.current?.click()

  const actions = (book: Book): MenuItem[] => [
    { label: 'Rename', icon: 'pencil', onSelect: () => setRenaming(book) },
    ...(book.currentIndex > 0
      ? [{ label: 'Start Over', icon: 'restart' as const, onSelect: () => library.resetProgress(book.id) }]
      : []),
    { label: 'Delete', icon: 'trash', destructive: true, divider: true, onSelect: () => library.delete(book.id) },
  ]

  const addMenu: MenuItem[] = [
    { label: 'Import File…', icon: 'doc', onSelect: pickFiles },
    { label: 'Paste Text', icon: 'clipboard', onSelect: () => setShowNewText(true) },
  ]

  return (
    <div
      class={dragging ? 'screen library dragging' : 'screen library'}
      onDragOver={event => {
        if (event.dataTransfer?.types.includes('Files')) {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={event => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={event => {
        event.preventDefault()
        setDragging(false)
        const files = [...(event.dataTransfer?.files ?? [])]
        if (files.length) library.importFiles(files)
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_FILES}
        multiple
        hidden
        onChange={event => {
          const input = event.currentTarget
          const files = [...(input.files ?? [])]
          input.value = ''
          if (files.length) library.importFiles(files)
        }}
      />

      {platform === 'android' ? (
        <div class="fab-wrapper">
          <Menu label="Add" items={addMenu} class="fab" direction="up">
            <Icon name="plus" size={26} />
          </Menu>
        </div>
      ) : (
        <header class="toolbar">
          <Menu label="Add" items={addMenu} class="glass-circle">
            <Icon name="plus" />
          </Menu>
        </header>
      )}

      <div class="content">
        <LibraryHeader onTapStats={props.onShowStats} />

        {library.loaded && library.books.length === 0 && !library.isImporting ? (
          <EmptyState onImport={pickFiles} onPaste={() => setShowNewText(true)} />
        ) : (
          <>
            <label class="search glass">
              <Icon name="search" size={18} />
              <input
                type="search"
                placeholder="Titles and authors"
                value={search}
                onInput={e => setSearch(e.currentTarget.value)}
                enterKeyHint="search"
              />
            </label>

            {resume && (
              <ContinueReadingCard
                book={resume}
                onOpen={from => props.onOpen(resume, from)}
                actions={actions(resume)}
              />
            )}

            <div class="section-header">
              <h2>Library</h2>
              <span class="count">{library.books.length}</span>
              <span class="spacer" />
              <Menu
                label="Sort by"
                title="Sort by"
                class="sort-button glass"
                items={(Object.keys(SORT_TITLES) as LibrarySort[]).map(option => ({
                  label: SORT_TITLES[option],
                  checked: option === sort,
                  onSelect: () => settings.set('librarySort', option),
                }))}
              >
                <Icon name="sort" size={16} />
                {SORT_TITLES[sort]}
              </Menu>
            </div>

            <ul class="book-list">
              {visible.map(book => (
                <BookRow
                  key={book.id}
                  book={book}
                  onOpen={from => props.onOpen(book, from)}
                  actions={actions(book)}
                  onStartOver={() => library.resetProgress(book.id)}
                  onDelete={() => library.delete(book.id)}
                />
              ))}
            </ul>
            {query && !visible.length && (
              <div class="unavailable">
                <Icon name="search" size={40} />
                <h3>No Results for “{search.trim()}”</h3>
                <p>Check the spelling or try a new search.</p>
              </div>
            )}
          </>
        )}
      </div>

      <div class="toasts">
        {library.isImporting && (
          <div class="toast glass">
            <span class="spinner" /> {library.importProgress ? `Importing · ${library.importProgress}` : 'Importing…'}
          </div>
        )}
        {library.pendingDeletion && <UndoToast key={library.pendingDeletion.id} book={library.pendingDeletion} />}
      </div>
      {dragging && <div class="drop-hint">Drop files to import</div>}

      {props.pasting && <NewTextSheet onClose={() => setShowNewText(false)} />}
      {renaming && <RenameAlert book={renaming} onClose={() => setRenaming(undefined)} />}
    </div>
  )
}

// Header

/** The wordmark — "Mono" with its first o in red, drawn like the app icon — and today's reading. */
function LibraryHeader({ onTapStats }: { onTapStats?: () => void }) {
  const days = library.days
  const streak = currentStreak(days)
  return (
    <div class="library-header">
      <h1 class="wordmark" aria-label="Mono" dangerouslySetInnerHTML={{ __html: wordmark }} />
      {totalWords(days) > 0 && (
        <button type="button" class="chips" onClick={onTapStats}>
          <span class="chip glass">
            <Icon name="sun" size={16} class="brand" />
            {formatNumber(statsOn(days, new Date()).words)} words today
          </span>
          {streak > 0 && (
            <span class="chip glass">
              <Icon name="flame" size={16} class="brand" />
              {streak} day streak
            </span>
          )}
        </button>
      )}
    </div>
  )
}

// Continue reading

/** A dark card that looks like the reader itself. */
function ContinueReadingCard(props: { book: Book; onOpen: (from: HTMLElement | null) => void; actions: MenuItem[] }) {
  const { book, onOpen, actions } = props
  const { wpm, readingFont } = settings.value
  const word = book.currentWord ?? book.title.split(' ')[0] ?? book.title
  const chapter = currentChapter(book)
  const details = [byline(book), chapter?.title].filter(Boolean).join(' — ')
  return (
    <div class="continue-card" data-book-id={book.id} onContextMenu={e => e.preventDefault()}>
      <button
        type="button"
        class="card-hit no-ripple"
        onClick={e => onOpen(e.currentTarget.parentElement)}
        aria-label={`Resume reading ${book.title}`}
      />
      <div class="card-glow" />
      <div class="card-top">
        <span class="eyebrow">Continue Reading</span>
        <span class="muted">{formatReadingTime(estimatedSecondsRemaining(book, wpm))} left</span>
      </div>
      {book.currentSentence ? (
        <SentencePreview sentence={book.currentSentence} font={readingFont} />
      ) : (
        <RSVPWord word={word} font={readingFont} fontSize={30} />
      )}
      <div class="card-book">
        {book.hasCover && <CoverTile book={book} small />}
        <div class="card-book-text">
          <div class="card-title">{book.title}</div>
          {details && <div class="card-chapter">{details}</div>}
        </div>
      </div>
      <div class="card-bottom">
        <ProgressBar progress={progress(book)} track="rgba(var(--ink-rgb), 0.15)" />
        <span class="percent">{formatPercent(progress(book))}</span>
        <span class="play-dot">
          <Icon name="play" size={16} />
        </span>
        <Menu label="More" items={actions} class="row-more dark">
          <Icon name="ellipsis" size={18} />
        </Menu>
      </div>
    </div>
  )
}

/**
 * The sentence at the bookmark as running text, the words already read
 * dimmed and the bookmarked word's resting letter marked by the reticle's
 * ticks, as in the reader.
 */
function SentencePreview({ sentence, font }: { sentence: SentenceContext; font: ReadingFont }) {
  const { orpHighlight, boldWord } = settings.value
  const parts = orpParts(sentence.word)
  return (
    <p class="card-sentence" style={{ font: cssFont(font, 19, false), lineHeight: 1.8 }}>
      {sentence.before && <span class="read">{sentence.before} </span>}
      <span class="current" style={{ fontWeight: boldWord ? 700 : 600 }}>
        {parts.prefix}
        <span class={orpHighlight === 'red' ? 'pointer red' : 'pointer'}>{parts.orp}</span>
        {parts.suffix}
      </span>
      {sentence.after && <span> {sentence.after}</span>}
    </p>
  )
}

// Rows

function BookRow(props: {
  book: Book
  onOpen: (from: HTMLElement | null) => void
  actions: MenuItem[]
  onStartOver: () => void
  onDelete: () => void
}) {
  const { book, onOpen, actions } = props
  const wpm = settings.value.wpm
  const timeLeft = formatReadingTime(estimatedSecondsRemaining(book, wpm))
  const finished = isFinished(book)
  const by = byline(book)
  const canStartOver = book.currentIndex > 0
  const swipe = useSwipeActions((canStartOver ? 2 : 1) * SWIPE_ACTION_WIDTH, props.onDelete)
  return (
    <li class={swipe.isOpen ? 'book-row swiped' : 'book-row'}>
      <div class="row-actions" aria-hidden={!swipe.isOpen}>
        {canStartOver && (
          <button
            type="button"
            class="row-action start-over"
            tabIndex={swipe.isOpen ? 0 : -1}
            onClick={() => {
              swipe.close()
              props.onStartOver()
            }}
          >
            <Icon name="restart" size={20} />
            <span>Start Over</span>
          </button>
        )}
        <button type="button" class="row-action delete" tabIndex={swipe.isOpen ? 0 : -1} onClick={props.onDelete}>
          <Icon name="trash" size={20} />
          <span>Delete</span>
        </button>
      </div>
      <div class="row-front" ref={swipe.ref}>
        <button
          type="button"
          class="row-hit"
          onClick={e => (swipe.isOpen ? swipe.close() : onOpen(e.currentTarget.querySelector('.cover')))}
        >
          <CoverTile book={book} />
          <div class="row-text">
            <div class="row-title">{book.title}</div>
            {by && <div class="row-byline">{by}</div>}
            <div class="row-details">
              {finished ? (
                <span class="finished">
                  <Icon name="checkCircle" size={16} /> Finished
                </span>
              ) : book.currentIndex > 0 ? (
                `${timeLeft} left`
              ) : (
                `${formatNumber(book.wordCount)} words · ${timeLeft}`
              )}
            </div>
            {book.currentIndex > 0 && !finished && (
              <div class="row-progress">
                <ProgressBar progress={progress(book)} />
                <span>{formatPercent(progress(book))}</span>
              </div>
            )}
          </div>
        </button>
        <Menu label={`More actions for ${book.title}`} items={actions} class="row-more">
          <Icon name="ellipsis" size={18} />
        </Menu>
      </div>
    </li>
  )
}

const SWIPE_ACTION_WIDTH = 84
/** Swiped past this share of the row's width, it's deleted on release. */
const FULL_SWIPE = 0.6

/** The row that's swiped open: opening another closes it. */
let closeOpenRow: (() => void) | undefined

/**
 * Swiping a row sideways: it follows the finger, opens to show its actions
 * (`actionsWidth` px), or calls `onFullSwipe` past FULL_SWIPE. Vertical
 * movement is left to scrolling (touch-action: pan-y).
 */
function useSwipeActions(actionsWidth: number, onFullSwipe: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const [isOpen, setOpen] = useState(false)
  const latest = useRef({ actionsWidth, onFullSwipe, isOpen })
  latest.current = { actionsWidth, onFullSwipe, isOpen }

  /** Moves the row to `offset` and reveals as much of the actions behind it. */
  const place = (offset: number, animated: boolean) => {
    const element = ref.current
    const actions = element?.previousElementSibling as HTMLElement | null
    if (!element || !actions) return
    const transition = animated ? '0.25s cubic-bezier(0.2, 0.9, 0.3, 1)' : '0s'
    element.style.transition = `transform ${transition}`
    element.style.transform = offset ? `translateX(${offset}px)` : ''
    actions.style.transition = `width ${transition}`
    actions.style.width = `${Math.max(0, -offset)}px`
  }

  const close = () => {
    place(0, true)
    setOpen(false)
    if (closeOpenRow === close) closeOpenRow = undefined
  }

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let start: { x: number; y: number; offset: number; id: number } | undefined
    let axis: 'h' | 'v' | undefined
    let offset = 0
    let armed = false

    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      start = {
        x: event.clientX,
        y: event.clientY,
        offset: latest.current.isOpen ? -latest.current.actionsWidth : 0,
        id: event.pointerId,
      }
      axis = undefined
    }
    const move = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (!axis && Math.hypot(dx, dy) > 8) {
        axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
        if (axis === 'h') {
          element.setPointerCapture(event.pointerId)
          if (closeOpenRow && closeOpenRow !== close) closeOpenRow()
        }
      }
      if (axis !== 'h') return
      const width = element.clientWidth
      // Rubber band past the open position and to the right.
      let next = start.offset + dx
      if (next > 0) next = next / 4
      offset = Math.max(-width, next)
      place(offset, false)
      const shouldArm = -offset > width * FULL_SWIPE
      if (shouldArm !== armed) {
        armed = shouldArm
        haptic('medium')
        element.parentElement?.classList.toggle('armed', armed)
      }
    }
    const up = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return
      start = undefined
      if (axis !== 'h') return
      element.parentElement?.classList.remove('armed')
      const { actionsWidth: open, onFullSwipe } = latest.current
      if (armed && event.type !== 'pointercancel') {
        armed = false
        place(-element.clientWidth, true)
        setTimeout(onFullSwipe, 200)
      } else if (-offset > open / 2) {
        place(-open, true)
        setOpen(true)
        closeOpenRow = close
      } else {
        close()
      }
    }
    // A swipe isn't a tap: swallow the click that follows it.
    const click = (event: MouseEvent) => {
      if (axis === 'h') {
        event.stopPropagation()
        event.preventDefault()
        axis = undefined
      }
    }
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    element.addEventListener('click', click, true)
    return () => {
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      element.removeEventListener('click', click, true)
      if (closeOpenRow === close) closeOpenRow = undefined
    }
  }, [])

  return { ref, isOpen, close }
}

/** "Deleted …" with Undo, until the deletion becomes final. */
function UndoToast({ book }: { book: Book }) {
  return (
    <div class="toast snackbar glass" role="status" style={{ '--undo-seconds': `${UNDO_SECONDS}s` }}>
      <span class="snackbar-text">Deleted “{book.title}”</span>
      <button type="button" class="text-button bold" onClick={() => library.undoDelete()}>
        Undo
      </button>
    </div>
  )
}

/** The book's cover, or a miniature reading surface with the title's first letter as the ORP glyph. */
function CoverTile({ book, small }: { book: Book; small?: boolean }) {
  const url = covers.url(book)
  const size = small ? ' small' : ''
  if (url) {
    return (
      <div class={`cover image${size}`} aria-hidden="true" data-book-id={small ? undefined : book.id}>
        <img src={url} alt="" decoding="async" />
        {!small && <span class="cover-progress" style={{ width: `${progress(book) * 100}%` }} />}
      </div>
    )
  }
  if (small) return null
  const initial =
    Array.from(book.title)
      .find(c => /[\p{L}\p{N}]/u.test(c))
      ?.toUpperCase() ?? '·'
  return (
    <div class={book.source ? 'cover has-source' : 'cover'} aria-hidden="true" data-book-id={book.id}>
      <div class="cover-mark">
        <span class="cover-tick" />
        <span class="cover-initial">{initial}</span>
        <span class="cover-tick" />
      </div>
      {book.source && <span class="cover-source">{SOURCE_LABEL[book.source]}</span>}
      <span class="cover-progress" style={{ width: `${progress(book) * 100}%` }} />
    </div>
  )
}

// Empty state

function EmptyState({ onImport, onPaste }: { onImport: () => void; onPaste: () => void }) {
  return (
    <div class="empty">
      <div class="empty-preview">
        <RSVPWord word="Mono" font={settings.value.readingFont} fontSize={36} />
      </div>
      <h2>One word at a time</h2>
      <p>Import a text, PDF or EPUB file, or paste a text, to start speed-reading with the RSVP method.</p>
      <button type="button" class="button prominent" onClick={onImport}>
        <Icon name="doc" size={20} /> Import File
      </button>
      <button type="button" class="button glass" onClick={onPaste}>
        <Icon name="clipboard" size={20} /> Paste Text
      </button>
    </div>
  )
}

// Sheets

function NewTextSheet({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const trimmed = text.trim()
  const canPaste = typeof navigator.clipboard?.readText === 'function'

  const add = () => {
    if (!trimmed) return
    library.addText(trimmed, title.trim() || undefined)
    onClose()
  }

  return (
    <Sheet onClose={onClose} label="New Text">
      <div class="sheet-bar">
        <button type="button" class="text-button" onClick={onClose}>
          Cancel
        </button>
        <h2>New Text</h2>
        <button type="button" class="text-button bold" disabled={!trimmed} onClick={add}>
          Add
        </button>
      </div>
      <div class="form-group">
        <input
          class="field"
          placeholder="Title (optional)"
          value={title}
          onInput={e => setTitle(e.currentTarget.value)}
        />
      </div>
      <div class="form-group">
        <textarea
          class="field editor"
          placeholder="Paste or type a text…"
          value={text}
          autoFocus
          onInput={e => setText(e.currentTarget.value)}
        />
        {canPaste && (
          <button
            type="button"
            class="paste-button"
            onClick={async () => {
              try {
                const pasted = await navigator.clipboard.readText()
                if (pasted) setText(pasted)
              } catch {
                // permission denied: the user can still paste into the field
              }
            }}
          >
            <Icon name="clipboard" size={18} /> Paste
          </button>
        )}
      </div>
    </Sheet>
  )
}

function RenameAlert({ book, onClose }: { book: Book; onClose: () => void }) {
  const [title, setTitle] = useState(book.title)
  return (
    <Alert
      title="Rename"
      onClose={onClose}
      actions={[
        { label: 'Cancel', role: 'cancel', onSelect: () => {} },
        { label: 'Save', disabled: !title.trim(), onSelect: () => library.rename(book.id, title) },
      ]}
    >
      <input
        class="field alert-field"
        value={title}
        aria-label="Title"
        autoFocus
        onFocus={e => e.currentTarget.select()}
        onInput={e => setTitle(e.currentTarget.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && title.trim()) {
            library.rename(book.id, title)
            onClose()
          }
        }}
      />
    </Alert>
  )
}
