// Message catalogs: the same keys in every language, the language picked
// for each setting, and plural forms.

import { describe, expect, it } from 'vitest'
import { LANGUAGES, resolveLanguage } from './i18n'
import * as i18n from './i18n'
import { en } from './locales/en'
import { it as italian } from './locales/it'
import { settings } from './settings'

/** Every key path with the kind of its value, e.g. "sort.recent:string". */
function shape(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) =>
    entry && typeof entry === 'object' ? shape(entry, `${prefix}${key}.`) : [`${prefix}${key}:${typeof entry}`],
  )
}

describe('Catalogs', () => {
  it('have the same keys, of the same kind, in every language', () => {
    expect(shape(italian).sort()).toEqual(shape(en).sort())
  })

  it('have no empty messages', () => {
    for (const catalog of [en, italian]) {
      for (const path of shape(catalog).filter(p => p.endsWith(':string'))) {
        const value = path
          .split(':')[0]
          .split('.')
          .reduce<unknown>((object, key) => (object as Record<string, unknown>)[key], catalog)
        expect(value, path).not.toBe('')
      }
    }
  })
})

describe('Language', () => {
  it('follows an explicit choice', () => {
    expect(resolveLanguage('it', ['en-US'])).toBe('it')
    expect(resolveLanguage('en', ['it-IT'])).toBe('en')
  })

  it('takes the first of the device’s languages that Mono has', () => {
    expect(resolveLanguage('system', ['it-IT', 'en-US'])).toBe('it')
    expect(resolveLanguage('system', ['IT'])).toBe('it')
    expect(resolveLanguage('system', ['de-DE', 'it-CH', 'en'])).toBe('it')
    expect(resolveLanguage('system', ['en-GB', 'it-IT'])).toBe('en')
  })

  it('falls back to English', () => {
    expect(resolveLanguage('system', ['fr-FR', 'de'])).toBe('en')
    expect(resolveLanguage('system', [])).toBe('en')
    expect(resolveLanguage('fr', ['de'])).toBe('en')
    expect(resolveLanguage('fr', ['it'])).toBe('it')
  })

  it('switches the messages, the locale and <html lang> with the setting', () => {
    expect(LANGUAGES).toEqual(['en', 'it'])
    settings.set('language', 'it')
    expect(i18n.t).toBe(italian)
    expect(i18n.locale).toBe('it-IT')
    expect(document.documentElement.lang).toBe('it')
    settings.set('language', 'en')
    expect(i18n.t).toBe(en)
    expect(document.documentElement.lang).toBe('en')
  })
})

describe('Plurals', () => {
  it('count in English', () => {
    expect(en.words(1)).toBe('1 word')
    expect(en.words(1234)).toBe('1,234 words')
    expect(en.dayStreak(1)).toBe('1 day streak')
    expect(en.dayStreak(2)).toBe('2 day streak')
    expect(en.wordsToday(0)).toBe('0 words today')
    expect(en.textsRestored(1)).toBe('1 text was added or updated.')
    expect(en.textsRestored(3)).toBe('3 texts were added or updated.')
    expect(en.daysUnit(1)).toBe('day')
  })

  it('count in Italian', () => {
    expect(italian.words(1)).toBe('1 parola')
    expect(italian.words(12345)).toBe('12.345 parole')
    expect(italian.dayStreak(1)).toBe('1 giorno di fila')
    expect(italian.dayStreak(2)).toBe('2 giorni di fila')
    expect(italian.wordsToday(0)).toBe('0 parole oggi')
    expect(italian.textsRestored(1)).toBe('1 testo aggiunto o aggiornato.')
    expect(italian.textsRestored(3)).toBe('3 testi aggiunti o aggiornati.')
    expect(italian.daysUnit(1)).toBe('giorno')
  })

  it('give reading times', () => {
    expect(en.timeLeft(30)).toBe('< 1 min left')
    expect(en.readingTime(3600)).toBe('≈ 1 hr')
    expect(en.readingTime(4800)).toBe('≈ 1 hr, 20 min')
    expect(italian.timeLeft(30)).toBe('< 1 min rimanente')
    expect(italian.timeLeft(60)).toBe('≈ 1 min rimanente')
    expect(italian.timeLeft(300)).toBe('≈ 5 min rimanenti')
    expect(italian.timeLeft(3600)).toBe('≈ 1 h rimanente')
    expect(italian.timeLeft(4800)).toBe('≈ 1 h 20 min rimanenti')
  })
})
