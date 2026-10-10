// The app as an installed PWA: service worker updates (offered, never forced
// while reading), the install prompt, and messages from the service worker.

import { registerSW } from 'virtual:pwa-register'
import { platform } from '../ui/platform'
import { Store } from './store'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000

class PWA extends Store {
  /** A new version is downloaded and waiting. */
  needsUpdate = false
  /** Chromium's install prompt, when the app can be installed. */
  private installPrompt: BeforeInstallPromptEvent | undefined
  isInstalled =
    matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  private applyUpdate: ((reload?: boolean) => Promise<void>) | undefined

  /** iOS / iPadOS Safari, where installing goes through the Share menu. */
  readonly isIOS = platform === 'ios'

  start(onShared: () => void) {
    if ('serviceWorker' in navigator) {
      this.applyUpdate = registerSW({
        onNeedRefresh: () => {
          this.needsUpdate = true
          this.emit()
        },
        // We reload ourselves (see update()).
        onNeedReload: () => {},
        onRegisteredSW: (_url, registration) => {
          // Installed apps can stay open for days: look for updates hourly.
          if (registration) setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_INTERVAL)
        },
      })
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'shared') onShared()
      })
    }
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault()
      this.installPrompt = event as BeforeInstallPromptEvent
      this.emit()
    })
    window.addEventListener('appinstalled', () => {
      this.isInstalled = true
      this.installPrompt = undefined
      this.emit()
    })
  }

  get canInstall() {
    return !!this.installPrompt
  }

  async install() {
    const prompt = this.installPrompt
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice.catch(() => undefined)
    this.installPrompt = undefined
    this.emit()
  }

  /**
   * Activates the waiting version and reloads once it controls the page.
   * workbox-window reloads by itself only for updates it found; ones found
   * by the hourly check or by the browser need the listener below.
   */
  update() {
    let reloading = false
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      location.reload()
    })
    void this.applyUpdate?.(true)
  }
}

export const pwa = new PWA()
