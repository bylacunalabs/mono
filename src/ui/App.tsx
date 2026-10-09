// Bottom tab bar: Library, Statistics, Settings. The reader is presented
// full screen over everything.

import { useEffect, useState } from 'preact/hooks'
import type { Book } from '../core/book'
import { library } from '../state/library'
import { useObserve } from '../state/store'
import { Icon } from './icons'
import { LibraryView } from './LibraryView'
import { ReaderView } from './ReaderView'
import { SettingsView } from './SettingsView'
import { StatsView } from './StatsView'

type Tab = 'library' | 'stats' | 'settings'

const TABS: { id: Tab; title: string; icon: 'books' | 'chart' | 'gear' }[] = [
  { id: 'library', title: 'Library', icon: 'books' },
  { id: 'stats', title: 'Statistics', icon: 'chart' },
  { id: 'settings', title: 'Settings', icon: 'gear' },
]

export function App() {
  useObserve(library)
  const [tab, setTab] = useState<Tab>('library')
  const [readingID, setReadingID] = useState<string>()
  const reading = readingID ? library.books.find(b => b.id === readingID) : undefined

  // Files opened with Mono from the system (installed PWA, Chromium).
  useEffect(() => {
    const launchQueue = (window as { launchQueue?: { setConsumer(c: (p: { files: FileSystemFileHandle[] }) => void): void } }).launchQueue
    launchQueue?.setConsumer(async params => {
      const files = await Promise.all(params.files.map(handle => handle.getFile()))
      if (files.length) {
        setTab('library')
        library.importFiles(files)
      }
    })
  }, [])

  // Keep the library scrolled to the top when switching tabs.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const open = (book: Book) => setReadingID(book.id)

  return (
    <>
      <main class="app" aria-hidden={reading ? true : undefined} inert={reading ? true : undefined}>
        <div class="background" aria-hidden="true" />
        {tab === 'library' && <LibraryView onOpen={open} onShowStats={() => setTab('stats')} />}
        {tab === 'stats' && <StatsView />}
        {tab === 'settings' && <SettingsView />}

        <nav class="tab-bar glass" aria-label="Sections">
          {TABS.map(t => (
            <button
              type="button"
              class={t.id === tab ? 'tab selected' : 'tab'}
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={24} />
              <span>{t.title}</span>
            </button>
          ))}
        </nav>
      </main>

      {reading && <ReaderView key={reading.id} book={reading} onClose={() => setReadingID(undefined)} />}
    </>
  )
}
