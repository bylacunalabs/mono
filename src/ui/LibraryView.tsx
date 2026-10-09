// The home screen: the Mono wordmark with today's reading, a "continue
// reading" card that previews the bookmarked word in the reader's reticle,
// and the searchable, sortable list of texts. Each row's menu (or a long
// press / right click) renames, restarts or deletes it.

import { useRef, useState } from 'preact/hooks'
import {
  continueReading, currentChapter, estimatedSecondsRemaining, isFinished, progress, SORT_TITLES, sortBooks,
  SOURCE_LABEL, type Book, type LibrarySort,
} from '../core/book'
import { currentStreak, formatReadingTime, statsOn, totalWords } from '../core/stats'
import { ACCEPTED_FILES } from '../import/extract'
import { library } from '../state/library'
import { settings } from '../state/settings'
import { useObserve } from '../state/store'
import { Alert, formatNumber, formatPercent, Menu, ProgressBar, Sheet, type MenuItem } from './components'
import { Icon } from './icons'
import { RSVPWord } from './RSVPWord'

export function LibraryView(props: { onOpen: (book: Book) => void; onShowStats: () => void }) {
  useObserve(library)
  useObserve(settings)
  const fileInput = useRef<HTMLInputElement>(null)
  const [showNewText, setShowNewText] = useState(false)
  const [renaming, setRenaming] = useState<Book>()
  const [deleting, setDeleting] = useState<Book>()
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false)

  const sort = settings.value.librarySort
  const query = search.trim().toLocaleLowerCase()
  const visible = sortBooks(
    query ? library.books.filter(b => b.title.toLocaleLowerCase().includes(query)) : library.books,
    sort,
  )
  const resume = query ? undefined : continueReading(library.books)

  const pickFiles = () => fileInput.current?.click()

  const actions = (book: Book): MenuItem[] => [
    { label: 'Rename', icon: 'pencil', onSelect: () => setRenaming(book) },
    ...(book.currentIndex > 0
      ? [{ label: 'Start Over', icon: 'restart' as const, onSelect: () => library.resetProgress(book.id) }]
      : []),
    { label: 'Delete', icon: 'trash', destructive: true, divider: true, onSelect: () => setDeleting(book) },
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

      <header class="toolbar">
        <Menu label="Add" items={addMenu} class="glass-circle">
          <Icon name="plus" />
        </Menu>
      </header>

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
                placeholder="Search your library"
                value={search}
                onInput={e => setSearch(e.currentTarget.value)}
                enterKeyHint="search"
              />
            </label>

            {resume && <ContinueReadingCard book={resume} onOpen={() => props.onOpen(resume)} actions={actions(resume)} />}

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
                <BookRow key={book.id} book={book} onOpen={() => props.onOpen(book)} actions={actions(book)} />
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

      {library.isImporting && (
        <div class="toast glass">
          <span class="spinner" /> Importing…
        </div>
      )}
      {dragging && <div class="drop-hint">Drop files to import</div>}

      {showNewText && <NewTextSheet onClose={() => setShowNewText(false)} />}
      {renaming && <RenameAlert book={renaming} onClose={() => setRenaming(undefined)} />}
      {deleting && (
        <Alert
          title={`Delete “${deleting.title}”?`}
          message="Your reading progress will be lost."
          onClose={() => setDeleting(undefined)}
          actions={[
            { label: 'Cancel', role: 'cancel', onSelect: () => {} },
            { label: 'Delete', role: 'destructive', onSelect: () => library.delete(deleting.id) },
          ]}
        />
      )}
      {library.errorMessage && (
        <Alert
          title="Import failed"
          message={library.errorMessage}
          onClose={() => library.dismissError()}
          actions={[{ label: 'OK', role: 'cancel', onSelect: () => {} }]}
        />
      )}
    </div>
  )
}

// Header

/** The wordmark — "Mono" with its first o in red, like the app icon — and today's reading. */
function LibraryHeader({ onTapStats }: { onTapStats?: () => void }) {
  const days = library.days
  const streak = currentStreak(days)
  return (
    <div class="library-header">
      <h1 class="wordmark" aria-label="Mono">
        M<span class="brand">o</span>no
      </h1>
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
function ContinueReadingCard({ book, onOpen, actions }: { book: Book; onOpen: () => void; actions: MenuItem[] }) {
  const { wpm, readingFont } = settings.value
  const word = book.currentWord ?? book.title.split(' ')[0] ?? book.title
  const chapter = currentChapter(book)
  return (
    <div class="continue-card" onContextMenu={e => e.preventDefault()}>
      <button type="button" class="card-hit" onClick={onOpen} aria-label={`Resume reading ${book.title}`} />
      <div class="card-glow" />
      <div class="card-top">
        <span class="eyebrow">Continue Reading</span>
        <span class="muted">{formatReadingTime(estimatedSecondsRemaining(book, wpm))} left</span>
      </div>
      <RSVPWord word={word} font={readingFont} fontSize={30} />
      <div class="card-title">{book.title}</div>
      {chapter && <div class="card-chapter">{chapter.title}</div>}
      <div class="card-bottom">
        <ProgressBar progress={progress(book)} track="rgba(255,255,255,0.15)" />
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

// Rows

function BookRow({ book, onOpen, actions }: { book: Book; onOpen: () => void; actions: MenuItem[] }) {
  const wpm = settings.value.wpm
  const timeLeft = formatReadingTime(estimatedSecondsRemaining(book, wpm))
  const finished = isFinished(book)
  return (
    <li class="book-row">
      <button type="button" class="row-hit" onClick={onOpen}>
        <CoverTile book={book} />
        <div class="row-text">
          <div class="row-title">{book.title}</div>
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
    </li>
  )
}

/** A miniature reading surface: the title's first letter as the ORP glyph. */
function CoverTile({ book }: { book: Book }) {
  const initial = Array.from(book.title).find(c => /[\p{L}\p{N}]/u.test(c))?.toUpperCase() ?? '·'
  return (
    <div class={book.source ? 'cover has-source' : 'cover'} aria-hidden="true">
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
        <input class="field" placeholder="Title (optional)" value={title} onInput={e => setTitle(e.currentTarget.value)} />
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
