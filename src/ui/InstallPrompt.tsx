// Installing Mono as an app. The first time Mono opens in a browser it asks
// whether to install it or carry on in the browser; Settings always has the
// same option. Chromium installs through its own prompt; iOS Safari (and
// browsers that don't offer a prompt) get the steps to do it by hand.

import { useState } from 'preact/hooks'
import { t } from '../state/i18n'
import { pwa } from '../state/pwa'
import { useObserve } from '../state/store'
import { Sheet } from './components'
import { Icon } from './icons'
import { platform } from './platform'

export const INSTALL_BENEFITS = [
  { icon: 'book', benefit: 'fullScreen' },
  { icon: 'download', benefit: 'offline' },
  { icon: 'share', benefit: 'safe' },
] as const

/** How to install by hand, where the browser has no install prompt. */
export const manualInstallSteps = (): string => t.installSteps[platform]

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
    <Sheet onClose={onClose} label={t.installMono}>
      <div class="install-prompt">
        <div class="install-head">
          <img class="install-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
          <h2>{t.installMono}</h2>
          <p class="secondary">{t.installInvite(platform === 'other')}</p>
        </div>
        <div class="install-body">
          <ul class="install-benefits">
            {INSTALL_BENEFITS.map(b => (
              <li>
                <Icon name={b.icon} size={20} class="brand" />
                <span>{t.installBenefits[b.benefit]}</span>
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
              {t.done}
            </button>
          ) : (
            <button type="button" class="button prominent" onClick={install}>
              <Icon name="install" size={20} /> {t.installApp}
            </button>
          )}
          <button type="button" class="button glass" onClick={onClose}>
            {t.continueInBrowser}
          </button>
          <p class="footnote center">{t.installLater}</p>
        </div>
      </div>
    </Sheet>
  )
}
