// Settings: appearance, text size with a live preview, focus letter, font,
// speed and reading behaviour, then the library's backup and installing the
// app.

import { useRef, useState } from 'preact/hooks'
import { MAX_WPM, MIN_WPM, WPM_STEP } from '../core/timing'
import { library } from '../state/library'
import { pwa } from '../state/pwa'
import { settings, type Appearance, type ORPHighlight } from '../state/settings'
import { download } from '../storage/backup'
import { useObserve } from '../state/store'
import { Alert, Toggle } from './components'
import {
  availableHalfWidth, BASE_FONT_SIZE, cssFont, FONT_NAMES, maxFontSize, MINIMUM_SCALE, READING_FONTS,
  referenceExtents, wordViewHeight,
} from './fonts'
import { useWidth } from './hooks'
import { Icon } from './icons'
import { RSVPWord } from './RSVPWord'

const APPEARANCES: { value: Appearance; title: string }[] = [
  { value: 'system', title: 'Automatic' },
  { value: 'light', title: 'Light' },
  { value: 'dark', title: 'Dark' },
]

const HIGHLIGHTS: { value: ORPHighlight; title: string }[] = [
  { value: 'red', title: 'Red' },
  { value: 'subtle', title: 'Subtle' },
  { value: 'none', title: 'None' },
]

export function SettingsView() {
  useObserve(settings)
  useObserve(pwa)
  const [ref, width] = useWidth<HTMLDivElement>()
  const s = settings.value

  // Without a text loaded, cap the size with typical long words; the reader
  // refines the cap with the actual text.
  const maxSize = maxFontSize(referenceExtents(s.readingFont, s.boldWord), availableHalfWidth(width || 390))
  const maxScale = Math.max(MINIMUM_SCALE + 0.05, maxSize / BASE_FONT_SIZE)
  const scale = Math.min(s.textScale, maxScale)
  const fontSize = BASE_FONT_SIZE * scale

  return (
    <div class="screen">
      <div class="content">
        <h1 class="large-title">Settings</h1>

        <h4 class="group-header">Appearance</h4>
        <section class="group">
          <div class="row">
            <div class="segmented" role="radiogroup" aria-label="Appearance">
              {APPEARANCES.map(option => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={s.appearance === option.value}
                  class={s.appearance === option.value ? 'selected' : ''}
                  onClick={() => settings.set('appearance', option.value)}
                >
                  {option.title}
                </button>
              ))}
            </div>
          </div>
        </section>
        <p class="footnote">Automatic follows your device. The reader uses the same theme.</p>

        <h4 class="group-header">Text size</h4>

        <section class="group">
          <div class="preview" ref={ref} style={{ height: wordViewHeight(maxSize) + 24 }}>
            {width > 0 && <RSVPWord word="comprehension" font={s.readingFont} fontSize={fontSize} />}
          </div>
          <div class="row column">
            <div class="row-line">
              <span>Text size</span>
              <span class="secondary">{Math.round(fontSize)} pt</span>
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
                aria-label="Text size"
                onInput={e => settings.set('textScale', Number(e.currentTarget.value))}
              />
              <Icon name="larger" size={20} />
            </div>
          </div>
        </section>
        <p class="footnote">
          Every word is shown at the same size. The maximum is set automatically so that even the longest words fit
          on screen.
        </p>

        <h4 class="group-header">Focus letter</h4>
        <section class="group">
          <div class="row">
            <div class="segmented" role="radiogroup" aria-label="Focus letter">
              {HIGHLIGHTS.map(option => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={s.orpHighlight === option.value}
                  class={s.orpHighlight === option.value ? 'selected' : ''}
                  onClick={() => settings.set('orpHighlight', option.value)}
                >
                  {option.title}
                </button>
              ))}
            </div>
          </div>
        </section>
        <p class="footnote">
          The letter your eyes rest on stays centred in the reticle. Choose how much it stands out from the rest of
          the word.
        </p>

        <h4 class="group-header">Font</h4>
        <section class="group">
          <div class="row">
            <span>Bold</span>
            <Toggle label="Bold" checked={s.boldWord} onChange={v => settings.set('boldWord', v)} />
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

        <h4 class="group-header">Reading</h4>
        <section class="group">
          <div class="row">
            <span>Speed</span>
            <span class="stepper-row">
              <span class="secondary">{s.wpm} WPM</span>
              <span class="stepper">
                <button
                  type="button"
                  aria-label="Slower"
                  disabled={s.wpm <= MIN_WPM}
                  onClick={() => settings.set('wpm', Math.max(MIN_WPM, s.wpm - WPM_STEP))}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="Faster"
                  disabled={s.wpm >= MAX_WPM}
                  onClick={() => settings.set('wpm', Math.min(MAX_WPM, s.wpm + WPM_STEP))}
                >
                  +
                </button>
              </span>
            </span>
          </div>
          <div class="row">
            <span>Gradual start</span>
            <Toggle label="Gradual start" checked={s.rampUp} onChange={v => settings.set('rampUp', v)} />
          </div>
        </section>
        <p class="footnote">After every pause the first few words run slower, so you can pick up the thread.</p>

        <section class="group">
          <div class="row">
            <span>Keep text visible</span>
            <Toggle
              label="Keep text visible"
              checked={s.alwaysShowText}
              onChange={v => settings.set('alwaysShowText', v)}
            />
          </div>
        </section>
        <p class="footnote">
          Shows the text under the word while reading too, following along. Scroll it freely to look ahead or jump to
          another paragraph or chapter.
        </p>

        <BackupSection />
        <InstallSection />
      </div>
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
      download(blob, `Mono backup ${date}.json`)
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
      <h4 class="group-header">Library</h4>
      <section class="group">
        <button type="button" class="row choice" disabled={busy} onClick={exportBackup}>
          <span class="brand">Export Backup</span>
          <Icon name="download" size={20} class="brand" />
        </button>
        <button type="button" class="row choice" disabled={busy} onClick={() => fileInput.current?.click()}>
          <span class="brand">Restore Backup…</span>
          <Icon name="upload" size={20} class="brand" />
        </button>
      </section>
      <p class="footnote">
        Your texts, progress and statistics are kept only in this browser. Export a backup to keep them safe or to move
        them to another device; restoring adds what's missing and keeps the most recent progress.
      </p>
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
          title="Backup restored"
          message={
            restored === 0
              ? 'Your library was already up to date.'
              : `${restored} ${restored === 1 ? 'text was' : 'texts were'} added or updated.`
          }
          onClose={() => setRestored(undefined)}
          actions={[{ label: 'OK', role: 'cancel', onSelect: () => {} }]}
        />
      )}
    </>
  )
}

/** Installing Mono as an app: the browser's prompt, or instructions on iOS. */
function InstallSection() {
  if (pwa.isInstalled || (!pwa.canInstall && !pwa.isIOS)) return null
  return (
    <>
      <h4 class="group-header">App</h4>
      <section class="group">
        {pwa.canInstall ? (
          <button type="button" class="row choice" onClick={() => pwa.install()}>
            <span class="brand">Install Mono</span>
            <Icon name="install" size={20} class="brand" />
          </button>
        ) : (
          <div class="row">
            <span>Install Mono</span>
            <Icon name="share" size={20} class="secondary" />
          </div>
        )}
      </section>
      <p class="footnote">
        {pwa.canInstall
          ? 'Installed, Mono opens in its own window, works offline and can open and receive files from other apps.'
          : 'In Safari, tap Share, then “Add to Home Screen”. Installed, Mono opens full screen, works offline and keeps your library safe from automatic clean-up.'}
      </p>
    </>
  )
}
