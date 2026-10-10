// User preferences, kept in localStorage (per browser, shared by its tabs)
// and observable.

import { DEFAULT_WPM, clampWPM } from '../core/timing'
import type { LibrarySort } from '../core/book'
import type { ReadingFont } from '../ui/fonts'
import { Store } from './store'

export type ORPHighlight = 'red' | 'subtle' | 'none'
export type NavigationUnit = 'sentence' | 'paragraph' | 'chapter'
export type Appearance = 'system' | 'light' | 'dark'

export interface Settings {
  wpm: number
  rampUp: boolean
  /** On resuming after a pause, go back a few words for context. */
  rewindOnResume: boolean
  /** Read only while a finger is on the screen. */
  holdToRead: boolean
  /** A soft tick as each word appears, pitched by the pause after it. */
  tickSound: boolean
  /** Word size in portrait, and on its side (where there's room for bigger words). */
  textScale: number
  textScaleLandscape: number
  readingFont: ReadingFont
  alwaysShowText: boolean
  navigationUnit: NavigationUnit
  orpHighlight: ORPHighlight
  boldWord: boolean
  librarySort: LibrarySort
  appearance: Appearance
  didSeedSample: boolean
  didShowGestures: boolean
  /** The first-launch "install or continue in the browser" question was answered. */
  didAskInstall: boolean
  didShowRotateHint: boolean
}

const DEFAULTS: Settings = {
  wpm: DEFAULT_WPM,
  rampUp: true,
  rewindOnResume: true,
  holdToRead: false,
  tickSound: false,
  textScale: 1,
  textScaleLandscape: 1.3,
  readingFont: 'mono',
  alwaysShowText: false,
  navigationUnit: 'sentence',
  orpHighlight: 'subtle',
  boldWord: true,
  librarySort: 'recent',
  appearance: 'system',
  didSeedSample: false,
  didShowGestures: false,
  didAskInstall: false,
  didShowRotateHint: false,
}

const KEY = 'mono.settings'

class SettingsStore extends Store {
  value: Settings

  constructor() {
    super()
    let stored: Partial<Settings> = {}
    try {
      stored = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    } catch {
      // private mode or corrupt value: defaults
    }
    this.value = { ...DEFAULTS, ...stored }
    this.value.wpm = clampWPM(this.value.wpm)
    // Changed in another tab.
    window.addEventListener('storage', event => {
      if (event.key !== KEY || !event.newValue) return
      try {
        this.value = { ...DEFAULTS, ...JSON.parse(event.newValue) }
        this.emit()
      } catch {
        // ignore a corrupt value
      }
    })
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (this.value[key] === value) return
    this.value = { ...this.value, [key]: value }
    this.save()
  }

  /** Takes the known settings from e.g. a backup, ignoring anything else. */
  assign(values: Record<string, unknown>) {
    const known = Object.fromEntries(
      Object.entries(values).filter(([key, value]) => key in DEFAULTS && typeof value === typeof DEFAULTS[key as keyof Settings]),
    )
    this.value = { ...this.value, ...known }
    this.value.wpm = clampWPM(this.value.wpm)
    this.save()
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value))
    } catch {
      // not persisted, still applied
    }
    this.emit()
  }
}

export const settings = new SettingsStore()

/** The text size setting for the orientation. */
export const textScaleKey = (landscape: boolean): 'textScale' | 'textScaleLandscape' =>
  landscape ? 'textScaleLandscape' : 'textScale'
