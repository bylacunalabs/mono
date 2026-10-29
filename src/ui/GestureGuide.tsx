// The reader's gestures, which are otherwise invisible: shown over the
// reader the first time it opens, and from Settings.

import { t } from '../state/i18n'
import { settings } from '../state/settings'
import { Sheet } from './components'
import { Icon } from './icons'

type GestureIcon = 'tap' | 'hold' | 'swipeH' | 'swipeV' | 'pinch' | 'text'

export function GestureGuide({ onClose }: { onClose: () => void }) {
  const { holdToRead } = settings.value
  const g = t.gestures
  const gestures: { icon: GestureIcon; title: string; detail: string }[] = [
    holdToRead
      ? { icon: 'hold', title: g.hold, detail: g.holdDetail }
      : { icon: 'tap', title: g.tap, detail: g.tapDetail },
    { icon: 'swipeH', title: g.swipeH, detail: g.swipeHDetail },
    { icon: 'swipeV', title: g.swipeV, detail: g.swipeVDetail },
    { icon: 'pinch', title: g.pinch, detail: g.pinchDetail },
    { icon: 'text', title: g.word, detail: g.wordDetail },
  ]
  return (
    <Sheet onClose={onClose} label={t.readingGestures}>
      <div class="guide">
        <h2>{t.readingGestures}</h2>
        <ul class="guide-list">
          {gestures.map(gesture => (
            <li>
              <span class="guide-icon">
                <Icon name={gesture.icon} size={24} />
              </span>
              <div>
                <div class="guide-title">{gesture.title}</div>
                <div class="guide-detail">{gesture.detail}</div>
              </div>
            </li>
          ))}
        </ul>
        <p class="footnote">{t.gesturesFootnote}</p>
        <button type="button" class="button prominent" onClick={onClose}>
          {t.gotIt}
        </button>
      </div>
    </Sheet>
  )
}
