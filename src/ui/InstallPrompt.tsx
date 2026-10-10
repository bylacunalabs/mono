// Installing Mono as an app. The first time Mono opens in a browser it asks
// whether to install it or carry on in the browser; Settings always has the
// same option. Chromium installs through its own prompt; iOS Safari (and
// browsers that don't offer a prompt) get the steps to do it by hand.

import { useState } from 'preact/hooks'
import { pwa } from '../state/pwa'
import { useObserve } from '../state/store'
import { Sheet } from './components'
import { Icon } from './icons'
import { platform } from './platform'

export const INSTALL_BENEFITS = [
  { icon: 'book', text: 'Opens full screen, like any other app' },
  { icon: 'download', text: 'Works offline, with your library always at hand' },
  { icon: 'share', text: 'Your texts are safe from the browser’s automatic clean-up' },
] as const

/** How to install by hand, where the browser has no install prompt. */
export function manualInstallSteps(): string {
  if (platform === 'ios') return 'In Safari, tap Share, then “Add to Home Screen”.'
  if (platform === 'android') return 'Open the browser menu (⋮) and choose “Install app” or “Add to Home screen”.'
  return 'Use the install button in the address bar, or “Install Mono” in the browser menu.'
}

/** First launch in a browser: install, or continue in the browser. */
export function InstallPrompt({ onClose }: { onClose: () => void }) {
  useObserve(pwa)
  const [showSteps, setShowSteps] = useState(false)

  const install = async () => {
    if (pwa.canInstall) {
      await pwa.install()
      onClose()
    } else {
      setShowSteps(true)
    }
  }

  return (
    <Sheet onClose={onClose} label="Install Mono">
      <div class="install-prompt">
        <img class="install-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
        <h2>Install Mono</h2>
        <p class="secondary">Add Mono to your {platform === 'other' ? 'computer' : 'Home Screen'} for the best reading.</p>
        <ul class="install-benefits">
          {INSTALL_BENEFITS.map(b => (
            <li>
              <Icon name={b.icon} size={20} class="brand" />
              <span>{b.text}</span>
            </li>
          ))}
        </ul>
        {showSteps && (
          <p class="install-steps" role="status">
            {platform === 'ios' && <Icon name="share" size={18} class="brand" />}
            {manualInstallSteps()}
          </p>
        )}
        {showSteps ? (
          <button type="button" class="button prominent" onClick={onClose}>
            Done
          </button>
        ) : (
          <button type="button" class="button prominent" onClick={install}>
            <Icon name="install" size={20} /> Install App
          </button>
        )}
        <button type="button" class="button glass" onClick={onClose}>
          Continue in Browser
        </button>
        <p class="footnote center">You can install Mono any time from Settings.</p>
      </div>
    </Sheet>
  )
}
