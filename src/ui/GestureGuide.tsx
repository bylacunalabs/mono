// The reader's gestures, which are otherwise invisible: shown over the
// reader the first time it opens, and from Settings.

import { settings } from '../state/settings'
import { Sheet } from './components'
import { Icon } from './icons'

type GestureIcon = 'tap' | 'hold' | 'swipeH' | 'swipeV' | 'pinch' | 'text'

export function GestureGuide({ onClose }: { onClose: () => void }) {
  const { holdToRead } = settings.value
  const gestures: { icon: GestureIcon; title: string; detail: string }[] = [
    holdToRead
      ? {
          icon: 'hold',
          title: 'Touch and hold',
          detail: 'Words run while your finger is on the screen; lift it to pause.',
        }
      : { icon: 'tap', title: 'Tap', detail: 'Play or pause. While paused, the whole text and the controls appear.' },
    { icon: 'swipeH', title: 'Swipe left or right', detail: 'Next or previous sentence, paragraph or chapter.' },
    { icon: 'swipeV', title: 'Swipe up or down', detail: 'Faster or slower, 25 words per minute at a time.' },
    { icon: 'pinch', title: 'Pinch', detail: 'Make the words larger or smaller.' },
    { icon: 'text', title: 'Tap a word in the text', detail: 'Continue reading from there.' },
  ]
  return (
    <Sheet onClose={onClose} label="Reading gestures">
      <div class="guide">
        <h2>Reading Gestures</h2>
        <ul class="guide-list">
          {gestures.map(g => (
            <li>
              <span class="guide-icon">
                <Icon name={g.icon} size={24} />
              </span>
              <div>
                <div class="guide-title">{g.title}</div>
                <div class="guide-detail">{g.detail}</div>
              </div>
            </li>
          ))}
        </ul>
        <p class="footnote">
          After a pause, reading picks up a few words back so you don’t lose the thread. You can change this and switch
          to touch-and-hold reading in Settings.
        </p>
        <button type="button" class="button prominent" onClick={onClose}>
          Got It
        </button>
      </div>
    </Sheet>
  )
}
