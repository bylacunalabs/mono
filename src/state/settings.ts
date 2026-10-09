// User preferences, kept in localStorage (per browser) and observable.

import { DEFAULT_WPM, clampWPM } from '../core/timing'
import type { LibrarySort } from '../core/book'
import type { ReadingFont } from '../ui/fonts'
import { Store } from './store'

export type ORPHighlight = 'red' | 'subtle' | 'none'
export type NavigationUnit = 'sentence' | 'paragraph' | 'chapter'

export interface Settings {
  wpm: number
  rampUp: boolean
  textScale: number
  readingFont: ReadingFont
  alwaysShowText: boolean
  navigationUnit: NavigationUnit
  orpHighlight: ORPHighlight
  boldWord: boolean
  librarySort: LibrarySort
  didSeedSample: boolean
}

const DEFAULTS: Settings = {
  wpm: DEFAULT_WPM,
  rampUp: true,
  textScale: 1,
  readingFont: 'mono',
  alwaysShowText: false,
  navigationUnit: 'sentence',
  orpHighlight: 'subtle',
  boldWord: true,
  librarySort: 'recent',
  didSeedSample: false,
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
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (this.value[key] === value) return
    this.value = { ...this.value, [key]: value }
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value))
    } catch {
      // not persisted, still applied
    }
    this.emit()
  }
}

export const settings = new SettingsStore()
