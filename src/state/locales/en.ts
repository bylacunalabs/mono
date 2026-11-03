// The interface in English: the source of every message. Other languages
// are typed `Messages`, so they must have exactly these keys.

import type { BackupProblem } from '../../core/backup'
import type { LibrarySort } from '../../core/book'
import { readingTime as splitReadingTime } from '../../core/stats'
import type { ImportProblem } from '../../import/document'
import type { Appearance, NavigationUnit, ORPHighlight } from '../settings'
import { formatters } from './format'

const LOCALE = 'en-US'
const { count, number, plural } = formatters(LOCALE)

const readingTime = (seconds: number) => {
  const time = splitReadingTime(seconds)
  if (!time) return '< 1 min'
  const { hours, minutes } = time
  if (hours === 0) return `≈ ${minutes} min`
  return minutes === 0 ? `≈ ${hours} hr` : `≈ ${hours} hr, ${minutes} min`
}

export const en = {
  locale: LOCALE,

  // Tabs and app-wide
  tabs: { library: 'Library', stats: 'Statistics', settings: 'Settings' },
  sections: 'Sections',
  updateReady: 'A new version of Mono is ready.',
  update: 'Update',
  ok: 'OK',
  cancel: 'Cancel',
  readingTime,
  timeLeft: (seconds: number) => `${readingTime(seconds)} left`,
  words: (n: number) => count(n, 'word', 'words'),

  // Library
  library: 'Library',
  add: 'Add',
  importFileMenu: 'Import File…',
  importFile: 'Import File',
  pasteText: 'Paste Text',
  rename: 'Rename',
  startOver: 'Start Over',
  delete: 'Delete',
  more: 'More',
  moreActionsFor: (title: string) => `More actions for ${title}`,
  searchPlaceholder: 'Titles and authors',
  sortBy: 'Sort by',
  sort: { recent: 'Recently Read', added: 'Recently Added', title: 'Title' } satisfies Record<LibrarySort, string>,
  noResultsFor: (query: string) => `No Results for “${query}”`,
  noResultsHint: 'Check the spelling or try a new search.',
  importing: 'Importing…',
  importingPage: (done: number, total: number) => `Importing · Page ${done} of ${total}`,
  dropToImport: 'Drop files to import',
  wordsToday: (n: number) => `${count(n, 'word', 'words')} today`,
  dayStreak: (n: number) => `${number(n)} day streak`,
  resumeReading: (title: string) => `Resume reading ${title}`,
  continueReading: 'Continue Reading',
  finished: 'Finished',
  deleted: (title: string) => `Deleted “${title}”`,
  undo: 'Undo',
  emptyTitle: 'One word at a time',
  emptyMessage: 'Import a text, PDF or EPUB file, or paste a text, to start speed-reading with the RSVP method.',
  newText: 'New Text',
  titleOptional: 'Title (optional)',
  textPlaceholder: 'Paste or type a text…',
  paste: 'Paste',
  save: 'Save',
  title: 'Title',
  untitled: 'Untitled',

  // Statistics
  statistics: 'Statistics',
  today: 'Today',
  streak: 'Streak',
  total: 'Total',
  averageSpeed: 'Average speed',
  wordsUnit: (n: number) => plural(n, 'word', 'words'),
  daysUnit: (n: number) => plural(n, 'day', 'days'),
  wpm: 'WPM',
  lastSevenDays: 'Last 7 days',
  lastSevenDaysLabel: 'Words read in the last 7 days',
  statsEmpty: 'Your reading sessions will show up here.',

  // Settings
  settings: 'Settings',
  appearance: 'Appearance',
  appearances: { system: 'Automatic', light: 'Light', dark: 'Dark' } satisfies Record<Appearance, string>,
  appearanceFootnote: 'Automatic follows your device. The reader uses the same theme.',
  language: 'Language',
  automatic: 'Automatic',
  languageFootnote: 'Automatic follows your device’s language.',
  textSize: 'Text size',
  textSizeOnSide: 'Text size on its side',
  points: (n: number) => `${n} pt`,
  previewWord: 'comprehension',
  textSizeFootnote:
    'Every word is shown at the same size, up to where short words fill the screen. Words too long for the chosen size are shown a syllable group at a time. On a phone, the size is kept separately upright and on its side, where there’s room for bigger words.',
  focusLetter: 'Focus letter',
  highlights: { red: 'Red', subtle: 'Subtle', none: 'None' } satisfies Record<ORPHighlight, string>,
  focusLetterFootnote:
    'The letter your eyes rest on stays centred in the reticle. Choose how much it stands out from the rest of the word.',
  font: 'Font',
  bold: 'Bold',
  reading: 'Reading',
  speed: 'Speed',
  slower: 'Slower',
  faster: 'Faster',
  gradualStart: 'Gradual start',
  gradualStartFootnote: 'After every pause the first few words run slower, so you can pick up the thread.',
  tickSound: 'Tick sound',
  tickSoundFootnote:
    'A soft tick as each word appears. It sounds lower before a comma, lower still at the end of a sentence and lowest before a heading, so you can hear the rhythm of the text.',
  resumeBack: 'Resume a few words back',
  holdToRead: 'Touch and hold to read',
  readingGestures: 'Reading Gestures',
  resumeFootnote:
    'After a pause of more than a second or two, reading starts again up to four words back, never before the start of the sentence. With touch and hold, words run only while your finger is on the screen (or the space bar is held down).',
  keepTextVisible: 'Keep text visible',
  keepTextFootnote:
    'Shows the text under the word while reading too, following along. Scroll it freely to look ahead or jump to another paragraph or chapter.',
  exportBackup: 'Export Backup',
  restoreBackup: 'Restore Backup…',
  backupFootnote:
    'Your texts, progress and statistics are kept only in this browser. Export a backup to keep them safe or to move them to another device; restoring adds what’s missing and keeps the most recent progress.',
  backupFileName: (date: string) => `Mono backup ${date}.json`,
  backupRestored: 'Backup restored',
  alreadyUpToDate: 'Your library was already up to date.',
  textsRestored: (n: number) => `${count(n, 'text was', 'texts were')} added or updated.`,
  app: 'App',
  installed: 'Mono is installed',
  installMono: 'Install Mono',
  installedFootnote:
    'You’re using the installed app: it opens full screen, works offline and keeps your library safe from automatic clean-up.',
  installFootnote:
    'Installed, Mono opens full screen, works offline and keeps your library safe from automatic clean-up.',
  installFootnoteFiles:
    'Installed, Mono opens full screen, works offline, keeps your library safe from automatic clean-up and can open and receive files from other apps.',

  // Installing
  installInvite: (computer: boolean) =>
    `Add Mono to your ${computer ? 'computer' : 'Home Screen'} for the best reading.`,
  installBenefits: {
    fullScreen: 'Opens full screen, like any other app',
    offline: 'Works offline, with your library always at hand',
    safe: 'Your texts are safe from the browser’s automatic clean-up',
  },
  installSteps: {
    ios: 'In Safari, tap Share, then “Add to Home Screen”.',
    android: 'Open the browser menu (⋮) and choose “Install app” or “Add to Home screen”.',
    other: 'Use the install button in the address bar, or “Install Mono” in the browser menu.',
  },
  done: 'Done',
  installApp: 'Install App',
  continueInBrowser: 'Continue in Browser',
  installLater: 'You can install Mono any time from Settings.',

  // Gestures
  gestures: {
    hold: 'Touch and hold',
    holdDetail: 'Words run while your finger is on the screen; lift it to pause.',
    tap: 'Tap',
    tapDetail: 'Play or pause. While paused, the whole text and the controls appear.',
    swipeH: 'Swipe left or right',
    swipeHDetail: 'Next or previous sentence, paragraph or chapter.',
    swipeV: 'Swipe up or down',
    swipeVDetail: 'Faster or slower, 25 words per minute at a time.',
    pinch: 'Pinch',
    pinchDetail: 'Make the words larger or smaller.',
    word: 'Tap a word in the text',
    wordDetail: 'Continue reading from there.',
  },
  gesturesFootnote:
    'After a pause, reading picks up a few words back so you don’t lose the thread. You can change this and switch to touch-and-hold reading in Settings.',
  gotIt: 'Got It',

  // Reader
  units: { sentence: 'Sentence', paragraph: 'Paragraph', chapter: 'Chapter' } satisfies Record<NavigationUnit, string>,
  nextUnit: { sentence: 'Next sentence', paragraph: 'Next paragraph', chapter: 'Next chapter' },
  previousUnit: { sentence: 'Previous sentence', paragraph: 'Previous paragraph', chapter: 'Previous chapter' },
  position: 'Position',
  skipBy: 'Skip by',
  chapters: 'Chapters',
  close: 'Close',
  play: 'Play',
  text: 'Text',
  keepTextBeside: 'Keep text beside the word',
  emptyText: 'Empty text',
  readingSpeed: 'Reading speed',
  rotateHint: 'Turn sideways for bigger words',

  // Errors
  libraryUnavailable: 'Library unavailable',
  libraryNotOpened: (reason: string) => `Your library couldn't be opened: ${reason}`,
  nothingToRead: 'Nothing to read',
  noWebPages: "Mono can't download web pages yet. Share the article's text, or save the page and import the file.",
  importFailed: 'Import failed',
  restoreFailed: 'Restore failed',
  notSaved: 'Not saved',
  libraryNotSaved: (reason: string) => `Your library couldn't be saved: ${reason}`,
  importProblems: {
    empty: 'No readable text was found.',
    unreadable: 'The file could not be read.',
    invalidEPUB: 'This EPUB file is damaged or uses an unsupported format.',
    worker: 'The import worker failed.',
  } satisfies Record<ImportProblem, string>,
  backupProblems: {
    notBackup: 'This file is not a Mono backup.',
    newer: 'This backup was made by a newer version of Mono. Update the app and try again.',
  } satisfies Record<BackupProblem, string>,
}

export type Messages = typeof en
