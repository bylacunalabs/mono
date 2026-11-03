// Bottom tab bar: Library, Statistics, Settings. The reader is presented
// full screen over everything. Also the app-wide pieces: the light / dark
// theme, launches (files opened with Mono, shortcuts, shares), the update
// banner, the first-launch install question and errors.

import { useEffect, useState } from 'preact/hooks'
import { EVENTS, trackEvent } from '../analytics'
import { continueReading, type Book } from '../core/book'
import { i18n, t } from '../state/i18n'
import { library } from '../state/library'
import { pwa } from '../state/pwa'
import { settings, type Appearance } from '../state/settings'
import { useObserve } from '../state/store'
import { Alert } from './components'
import { Icon } from './icons'
import { InstallPrompt } from './InstallPrompt'
import { LibraryView } from './LibraryView'
import { ReaderView } from './ReaderView'
import { SettingsView } from './SettingsView'
import { StatsView } from './StatsView'
import { bookElement, morph } from './transitions'

type Tab = 'library' | 'stats' | 'settings'

const TABS: { id: Tab; icon: 'books' | 'chart' | 'gear' }[] = [
  { id: 'library', icon: 'books' },
  { id: 'stats', icon: 'chart' },
  { id: 'settings', icon: 'gear' },
]

/** Browser chrome colour for each theme (matches --bg). */
const THEME_COLORS = { light: '#f2f2f7', dark: '#000000' }

interface LaunchParams {
  files: FileSystemFileHandle[]
  targetURL?: string
}

export function App() {
  useObserve(library)
  useObserve(settings)
  useObserve(pwa)
  // Every view reads its text from `t`: a new language re-renders them all from here.
  useObserve(i18n)
  const [tab, setTab] = useState<Tab>('library')
  const [readingID, setReadingID] = useState<string>()
  const [pasting, setPasting] = useState(false)
  const reading = readingID ? library.books.find(b => b.id === readingID) : undefined

  useTheme(settings.value.appearance)

  // Launches: "?action=…" from a shortcut or a share, and files opened with
  // Mono from the system (installed PWA, Chromium). With launch_handler
  // focus-existing, later launches arrive here too instead of a new window.
  useEffect(() => {
    const handleURL = (url: URL) => {
      const action = url.searchParams.get('action')
      if (!action) return
      if (action === 'paste') {
        setTab('library')
        setPasting(true)
      } else if (action === 'continue') {
        whenLoaded(() => {
          const book = continueReading(library.books)
          if (book) setReadingID(book.id)
        })
      } else if (action === 'shared') {
        setTab('library')
        whenLoaded(() => library.importShared())
      }
    }
    const current = new URL(location.href)
    if (current.searchParams.has('action')) {
      handleURL(current)
      current.searchParams.delete('action')
      history.replaceState(history.state, '', current)
    }

    const launchQueue = (window as { launchQueue?: { setConsumer(c: (p: LaunchParams) => void): void } }).launchQueue
    launchQueue?.setConsumer(async params => {
      // The first launch repeats the page load handled above: harmless, as
      // every action can safely run twice.
      if (params.targetURL) handleURL(new URL(params.targetURL))
      const files = await Promise.all(params.files.map(handle => handle.getFile()))
      if (files.length) {
        setTab('library')
        setReadingID(undefined)
        library.importFiles(files)
      }
    })

    pwa.start(() => library.importShared())
  }, [])

  // Keep the library scrolled to the top when switching tabs.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const open = (book: Book, from?: HTMLElement | null) => morph(() => setReadingID(book.id), { from })
  const close = () => {
    const id = readingID
    morph(() => setReadingID(undefined), { to: () => (id ? bookElement(id) : null) })
  }

  useEffect(() => {
    if (!readingID) return
    const book = library.books.find(b => b.id === readingID)
    if (book) trackEvent(EVENTS.bookOpened, { source: book.source, resumed: book.currentIndex > 0 })
  }, [readingID])

  return (
    <>
      <main class="app" aria-hidden={reading ? true : undefined} inert={reading ? true : undefined}>
        <div class="background" aria-hidden="true" />
        {tab === 'library' && (
          <LibraryView
            onOpen={open}
            onShowStats={() => setTab('stats')}
            pasting={pasting}
            onPastingChange={setPasting}
          />
        )}
        {tab === 'stats' && <StatsView />}
        {tab === 'settings' && <SettingsView />}

        {pwa.needsUpdate && (
          <div class="update-banner glass" role="status">
            <Icon name="sparkles" size={18} class="brand" />
            <span>{t.updateReady}</span>
            <button type="button" class="text-button bold" onClick={() => pwa.update()}>
              {t.update}
            </button>
          </div>
        )}

        <nav class="tab-bar glass" aria-label={t.sections}>
          {TABS.map(item => (
            <button
              type="button"
              class={item.id === tab ? 'tab selected' : 'tab'}
              aria-current={item.id === tab ? 'page' : undefined}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} size={24} />
              <span>{t.tabs[item.id]}</span>
            </button>
          ))}
          <a
            class="tab tab-github"
            href="https://github.com/bylacunalabs/mono"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.github}
          >
            <Icon name="github" size={24} />
          </a>
        </nav>
      </main>

      {reading && <ReaderView key={reading.id} book={reading} onClose={close} />}

      {!pwa.isInstalled && !settings.value.didAskInstall && !reading && (
        <InstallPrompt onClose={() => settings.set('didAskInstall', true)} />
      )}

      {library.error && (
        <div class="top-layer">
          <Alert
            title={library.error.title}
            message={library.error.message}
            onClose={() => library.dismissError()}
            actions={[{ label: t.ok, role: 'cancel', onSelect: () => {} }]}
          />
        </div>
      )}
    </>
  )
}

/** Runs `action` once the library has been read from disk. */
function whenLoaded(action: () => void) {
  if (library.loaded) return action()
  const unsubscribe = library.subscribe(() => {
    if (!library.loaded) return
    unsubscribe()
    action()
  })
}

/** Applies the chosen appearance to the page and the browser chrome. */
function useTheme(appearance: Appearance) {
  useEffect(() => {
    const root = document.documentElement
    if (appearance === 'system') delete root.dataset.theme
    else root.dataset.theme = appearance
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      const scheme = meta.media.includes('dark') ? 'dark' : 'light'
      meta.content = THEME_COLORS[appearance === 'system' ? scheme : appearance]
    }
  }, [appearance])
}
