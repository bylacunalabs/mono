// Settings: appearance, language, text size with a live preview, focus
// letter, font, speed and reading behaviour, then the library's backup and
// installing the app.

import { useRef, useState } from 'preact/hooks'
import { MAX_WPM, MIN_WPM, WPM_STEP } from '../core/timing'
import { LANGUAGE_NAMES, LANGUAGES, t, type LanguageChoice } from '../state/i18n'
import { library } from '../state/library'
import { pwa } from '../state/pwa'
import { settings, textScaleKey, type Appearance, type ORPHighlight } from '../state/settings'
import { download } from '../storage/backup'
import { useObserve } from '../state/store'
import { Alert, Toggle } from './components'
import { GestureGuide } from './GestureGuide'
import { manualInstallSteps } from './InstallPrompt'
import { previewTicks } from './ticks'
import {
  availableHalfWidth,
  BASE_FONT_SIZE,
  cssFont,
  FONT_NAMES,
  maxFontSize,
  maxFontSizeForHeight,
  MINIMUM_SCALE,
  READING_FONTS,
  referenceExtents,
  wordViewHeight,
} from './fonts'
import { LANDSCAPE_PHONE, useMediaQuery, useWidth } from './hooks'
import { Icon } from './icons'
import { RSVPWord } from './RSVPWord'

const APPEARANCES: Appearance[] = ['system', 'light', 'dark']
const HIGHLIGHTS: ORPHighlight[] = ['red', 'subtle', 'none']
const LANGUAGE_CHOICES: LanguageChoice[] = ['system', ...LANGUAGES]

export function SettingsView() {
  useObserve(settings)
  useObserve(pwa)
  const [ref, width] = useWidth<HTMLDivElement>()
  const [showGestures, setShowGestures] = useState(false)
  const s = settings.value
  const landscape = useMediaQuery(LANDSCAPE_PHONE)
  const scaleKey = textScaleKey(landscape)

  // Without a text loaded, cap the size with typical short words across the
  // screen; the reader refines the cap with the actual text.
  const maxSize = Math.min(
    maxFontSize(referenceExtents(s.readingFont, s.boldWord, true), availableHalfWidth(window.innerWidth)),
    maxFontSizeForHeight(window.innerHeight),
  )
  const maxScale = Math.max(MINIMUM_SCALE + 0.05, maxSize / BASE_FONT_SIZE)
  const scale = Math.min(s[scaleKey], maxScale)
  const fontSize = BASE_FONT_SIZE * scale
  // The preview is narrower than the reader: a word that doesn't fit shrinks.
  const previewSize = Math.min(
    fontSize,
    maxFontSize(referenceExtents(s.readingFont, s.boldWord), availableHalfWidth(width || 390)),
  )

  return (
    <div class="screen settings">
      <div class="content">
        <h1 class="large-title">{t.settings}</h1>

        <h4 class="group-header">{t.appearance}</h4>
        <section class="group">
          <div class="row">
            <div class="segmented" role="radiogroup" aria-label={t.appearance}>
              {APPEARANCES.map(option => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={s.appearance === option}
                  class={s.appearance === option ? 'selected' : ''}
                  onClick={() => settings.set('appearance', option)}
                >
                  {t.appearances[option]}
                </button>
              ))}
            </div>
          </div>
        </section>
        <p class="footnote">{t.appearanceFootnote}</p>

        <h4 class="group-header">{t.language}</h4>
        <section class="group">
          {LANGUAGE_CHOICES.map(choice => (
            <button
              type="button"
              class="row choice"
              aria-pressed={choice === s.language}
              onClick={() => settings.set('language', choice)}
            >
              <span lang={choice === 'system' ? undefined : choice}>
                {choice === 'system' ? t.automatic : LANGUAGE_NAMES[choice]}
              </span>
              {choice === s.language && <Icon name="check" size={20} class="brand" />}
            </button>
          ))}
        </section>
        <p class="footnote">{t.languageFootnote}</p>

        <h4 class="group-header">{t.textSize}</h4>

        <section class="group">
          <div class="preview" ref={ref} style={{ height: wordViewHeight(previewSize) + 24 }}>
            {width > 0 && <RSVPWord word={t.previewWord} font={s.readingFont} fontSize={previewSize} />}
          </div>
          <div class="row column">
            <div class="row-line">
              <span>{landscape ? t.textSizeOnSide : t.textSize}</span>
              <span class="secondary">{t.points(Math.round(fontSize))}</span>
            </div>
            <div class="slider-row">
              <Icon name="smaller" size={20} />
              <input
                type="range"
                class="slider"
                min={MINIMUM_SCALE}
                max={maxScale}
                step={0.01}
                value={scale}
                aria-label={t.textSize}
                onInput={e => settings.set(scaleKey, Number(e.currentTarget.value))}
              />
              <Icon name="larger" size={20} />
            </div>
          </div>
        </section>
        <p class="footnote">{t.textSizeFootnote}</p>

        <h4 class="group-header">{t.focusLetter}</h4>
        <section class="group">
          <div class="row">
            <div class="segmented" role="radiogroup" aria-label={t.focusLetter}>
              {HIGHLIGHTS.map(option => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={s.orpHighlight === option}
                  class={s.orpHighlight === option ? 'selected' : ''}
                  onClick={() => settings.set('orpHighlight', option)}
                >
                  {t.highlights[option]}
                </button>
              ))}
            </div>
          </div>
        </section>
        <p class="footnote">{t.focusLetterFootnote}</p>

        <h4 class="group-header">{t.font}</h4>
        <section class="group">
          <div class="row">
            <span>{t.bold}</span>
            <Toggle label={t.bold} checked={s.boldWord} onChange={v => settings.set('boldWord', v)} />
          </div>
          {READING_FONTS.map(font => (
            <button
              type="button"
              class="row choice"
              aria-pressed={font === s.readingFont}
              onClick={() => settings.set('readingFont', font)}
            >
              <span style={{ font: cssFont(font, 19, s.boldWord) }}>{FONT_NAMES[font]}</span>
              {font === s.readingFont && <Icon name="check" size={20} class="brand" />}
            </button>
          ))}
        </section>

        <h4 class="group-header">{t.reading}</h4>
        <section class="group">
          <div class="row">
            <span>{t.speed}</span>
            <span class="stepper-row">
              <span class="secondary">
                {s.wpm} {t.wpm}
              </span>
              <span class="stepper">
                <button
                  type="button"
                  aria-label={t.slower}
                  disabled={s.wpm <= MIN_WPM}
                  onClick={() => settings.set('wpm', Math.max(MIN_WPM, s.wpm - WPM_STEP))}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={t.faster}
                  disabled={s.wpm >= MAX_WPM}
                  onClick={() => settings.set('wpm', Math.min(MAX_WPM, s.wpm + WPM_STEP))}
                >
                  +
                </button>
              </span>
            </span>
          </div>
          <div class="row">
            <span>{t.gradualStart}</span>
            <Toggle label={t.gradualStart} checked={s.rampUp} onChange={v => settings.set('rampUp', v)} />
          </div>
        </section>
        <p class="footnote">{t.gradualStartFootnote}</p>

        <section class="group">
          <div class="row">
            <span>{t.tickSound}</span>
            <Toggle
              label={t.tickSound}
              checked={s.tickSound}
              onChange={v => {
                settings.set('tickSound', v)
                if (v) previewTicks()
              }}
            />
          </div>
        </section>
        <p class="footnote">{t.tickSoundFootnote}</p>

        <section class="group">
          <div class="row">
            <span>{t.resumeBack}</span>
            <Toggle label={t.resumeBack} checked={s.rewindOnResume} onChange={v => settings.set('rewindOnResume', v)} />
          </div>
          <div class="row">
            <span>{t.holdToRead}</span>
            <Toggle label={t.holdToRead} checked={s.holdToRead} onChange={v => settings.set('holdToRead', v)} />
          </div>
          <button type="button" class="row choice" onClick={() => setShowGestures(true)}>
            <span class="brand">{t.readingGestures}</span>
            <Icon name="help" size={20} class="brand" />
          </button>
        </section>
        <p class="footnote">{t.resumeFootnote}</p>

        <section class="group">
          <div class="row">
            <span>{t.keepTextVisible}</span>
            <Toggle
              label={t.keepTextVisible}
              checked={s.alwaysShowText}
              onChange={v => settings.set('alwaysShowText', v)}
            />
          </div>
        </section>
        <p class="footnote">{t.keepTextFootnote}</p>

        <BackupSection />
        <InstallSection />
      </div>
      {showGestures && <GestureGuide onClose={() => setShowGestures(false)} />}
    </div>
  )
}

/** Export the library to a file and merge one back in. */
function BackupSection() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState<number>()

  const exportBackup = async () => {
    setBusy(true)
    try {
      const blob = await library.backup()
      const date = new Date().toISOString().slice(0, 10)
      download(blob, t.backupFileName(date))
    } finally {
      setBusy(false)
    }
  }

  const restore = async (file: File) => {
    setBusy(true)
    const count = await library.restore(file)
    setBusy(false)
    if (count !== undefined) setRestored(count)
  }

  return (
    <>
      <h4 class="group-header">{t.library}</h4>
      <section class="group">
        <button type="button" class="row choice" disabled={busy} onClick={exportBackup}>
          <span class="brand">{t.exportBackup}</span>
          <Icon name="download" size={20} class="brand" />
        </button>
        <button type="button" class="row choice" disabled={busy} onClick={() => fileInput.current?.click()}>
          <span class="brand">{t.restoreBackup}</span>
          <Icon name="upload" size={20} class="brand" />
        </button>
      </section>
      <p class="footnote">{t.backupFootnote}</p>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={event => {
          const input = event.currentTarget
          const file = input.files?.[0]
          input.value = ''
          if (file) restore(file)
        }}
      />
      {restored !== undefined && (
        <Alert
          title={t.backupRestored}
          message={restored === 0 ? t.alreadyUpToDate : t.textsRestored(restored)}
          onClose={() => setRestored(undefined)}
          actions={[{ label: t.ok, role: 'cancel', onSelect: () => {} }]}
        />
      )}
    </>
  )
}

/** Installing Mono as an app, always offered: the browser's prompt, or the steps to do it by hand. */
function InstallSection() {
  const [showSteps, setShowSteps] = useState(false)
  return (
    <>
      <h4 class="group-header">{t.app}</h4>
      <section class="group">
        {pwa.isInstalled ? (
          <div class="row">
            <span>{t.installed}</span>
            <Icon name="check" size={20} class="brand" />
          </div>
        ) : (
          <button
            type="button"
            class="row choice"
            onClick={() => (pwa.canInstall ? pwa.install() : setShowSteps(true))}
          >
            <span class="brand">{t.installMono}</span>
            <Icon name="install" size={20} class="brand" />
          </button>
        )}
        <a
          class="row choice"
          href="https://github.com/bylacunalabs/mono"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.github}
        >
          <span>{t.github}</span>
          <Icon name="github" size={20} />
        </a>
      </section>
      <p class="footnote">
        {pwa.isInstalled
          ? t.installedFootnote
          : showSteps || !pwa.canInstall
            ? `${manualInstallSteps()} ${t.installFootnote}`
            : t.installFootnoteFiles}
      </p>
    </>
  )
}
