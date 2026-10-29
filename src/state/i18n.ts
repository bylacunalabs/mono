// The interface's language: English or Italian, as chosen in Settings or
// following the device. `t` is the active catalog and `locale` its locale
// for numbers and dates; both are live bindings, switched before anything
// re-renders (this store subscribes to the settings before any view does).

import { en, type Messages } from './locales/en'
import { it } from './locales/it'
import { settings } from './settings'
import { Store } from './store'

export type Language = 'en' | 'it'
export type LanguageChoice = 'system' | Language

export const LANGUAGES: Language[] = ['en', 'it']
/** Each language's name in itself, as language pickers show them. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', it: 'Italiano' }

const CATALOGS: Record<Language, Messages> = { en, it }

/**
 * The language for a choice: 'system' takes the first of the device's
 * preferred languages that Mono has (so "de, it" gives Italian), else
 * English. Anything unknown, e.g. from a backup, counts as 'system'.
 */
export function resolveLanguage(choice: string, preferred: readonly string[]): Language {
  if ((LANGUAGES as string[]).includes(choice)) return choice as Language
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0]
    if ((LANGUAGES as string[]).includes(base)) return base as Language
  }
  return 'en'
}

const deviceLanguages = (): readonly string[] =>
  navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en']

export let language: Language = 'en'
export let t: Messages = en
export let locale = en.locale

class I18n extends Store {
  /** Follows the setting (and the device's languages, for 'system'). */
  apply() {
    const next = resolveLanguage(settings.value.language, deviceLanguages())
    document.documentElement.lang = next
    if (next === language) return
    language = next
    t = CATALOGS[next]
    locale = t.locale
    this.emit()
  }
}

export const i18n = new I18n()
i18n.apply()
settings.subscribe(() => i18n.apply())
window.addEventListener('languagechange', () => i18n.apply())
