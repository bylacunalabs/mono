// The few places where Mono adapts to the system it runs on instead of
// looking the same everywhere:
//
// • data-platform on <html> ("ios" | "android" | "other") lets the styles
//   follow each system's conventions (Material dialogs, snackbars and ripples
//   on Android, iOS alerts and sheets elsewhere).
// • data-glass="solid" swaps the translucent blur for opaque surfaces when
//   the user asks for less transparency or the device is low-end, where
//   backdrop blur over the reader costs frames.
// • --type scales the interface text with the system text size: iOS
//   Dynamic Type (read through -apple-system-body), and Chromium's
//   preferred-text-scale where available. The reader has its own size.
// • The page never zooms (see preventZoom); the reader's pinch sizes the words.
// • haptic() taps the device: the Vibration API on Android, and on iOS (which
//   has none) the system switch's tick, triggered by toggling a hidden switch.

export type Platform = 'ios' | 'android' | 'other'

export const platform: Platform =
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    ? 'ios'
    : /Android/i.test(navigator.userAgent)
      ? 'android'
      : 'other'

export const isTouch = matchMedia('(pointer: coarse)').matches

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
export const prefersReducedMotion = () => reducedMotion.matches

/** Applies the platform attributes; call once before the first render. */
export function applyPlatform() {
  const root = document.documentElement
  root.dataset.platform = platform

  const lessTransparency = matchMedia('(prefers-reduced-transparency: reduce)')
  const nav = navigator as { deviceMemory?: number }
  const lowEnd =
    platform === 'android' && ((nav.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4)
  const updateGlass = () => {
    if (lowEnd || lessTransparency.matches) root.dataset.glass = 'solid'
    else delete root.dataset.glass
  }
  updateGlass()
  lessTransparency.addEventListener?.('change', updateGlass)

  if (platform === 'ios') {
    applyDynamicType(root)
    // Installed on an iPhone with a home indicator, iOS sometimes reports a
    // zero bottom safe area on a cold start, leaving the tab bar on top of
    // the indicator: keep at least the indicator's height clear.
    const standalone = (navigator as { standalone?: boolean }).standalone === true
    const homeIndicator = /iPhone/.test(navigator.userAgent) && Math.max(screen.width, screen.height) >= 812
    if (standalone && homeIndicator) root.dataset.homeIndicator = ''
  }
  preventZoom()
}

/**
 * Keeps the page at its size. The viewport tag (maximum-scale, also stopping
 * iOS from zooming into a focused field) and touch-action (no pinch or
 * double-tap zoom) cover most browsers; Safari ignores user-scalable, so
 * its pinch gesture events are cancelled too, and on a trackpad a pinch
 * (ctrl + wheel) is only the reader's.
 */
function preventZoom() {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    document.addEventListener(type, event => event.preventDefault(), { passive: false })
  document.addEventListener(
    'wheel',
    event => {
      if (event.ctrlKey) event.preventDefault()
    },
    { passive: false },
  )
}

/** iOS: the body text size the user picked in Settings › Display & Brightness › Text Size, relative to the default 17 pt. */
function applyDynamicType(root: HTMLElement) {
  const probe = document.createElement('span')
  probe.style.cssText = 'font: -apple-system-body; position: absolute; visibility: hidden'
  probe.textContent = 'x'
  document.body.append(probe)
  const size = parseFloat(getComputedStyle(probe).fontSize)
  probe.remove()
  if (!size) return
  // Beyond these the fixed-size layout (tab bar, controls) stops fitting.
  const scale = Math.min(1.3, Math.max(0.88, size / 17))
  root.style.setProperty('--type', scale.toFixed(3))
}

export type Haptic = 'selection' | 'light' | 'medium'

const VIBRATION_MS: Record<Haptic, number> = { selection: 5, light: 8, medium: 14 }

let iosSwitch: HTMLLabelElement | undefined

/** A short tap on devices that can. Only works during a user gesture on iOS. */
export function haptic(kind: Haptic = 'light') {
  if (platform === 'ios') {
    // Safari 18+ ticks when an <input switch> is toggled, even a hidden one.
    if (!iosSwitch) {
      iosSwitch = document.createElement('label')
      iosSwitch.ariaHidden = 'true'
      iosSwitch.style.display = 'none'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.setAttribute('switch', '')
      iosSwitch.append(input)
      document.head.append(iosSwitch)
    }
    iosSwitch.click()
    return
  }
  navigator.vibrate?.(VIBRATION_MS[kind])
}

/**
 * Android, phone on its side: reading goes full screen (no status or
 * navigation bar) and the screen stays on its side, so lying down doesn't
 * rotate it back. Needs a recent tap; does nothing elsewhere (iOS has
 * neither API on iPhone).
 */
export async function immerseInLandscape() {
  if (platform !== 'android') return
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    await (screen.orientation as { lock?: (orientation: string) => Promise<void> }).lock?.('landscape')
  } catch {
    // no recent tap, or not allowed: reading works the same
  }
}

/** Leaves full screen (which also releases the orientation lock). */
export function leaveImmersion() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
}

/**
 * Material ripple on Android: pressing a button starts a ripple from the
 * touch point (drawn by .rippling::after in the styles).
 */
export function enableRipples() {
  if (platform !== 'android') return
  document.addEventListener(
    'pointerdown',
    event => {
      const target = (event.target as Element).closest<HTMLElement>(
        'button:not(:disabled):not(.no-ripple), [role="menuitem"]',
      )
      if (!target) return
      const rect = target.getBoundingClientRect()
      target.style.setProperty('--ripple-x', `${event.clientX - rect.left}px`)
      target.style.setProperty('--ripple-y', `${event.clientY - rect.top}px`)
      target.style.setProperty('--ripple-size', `${Math.hypot(rect.width, rect.height) * 2}px`)
      target.classList.remove('rippling')
      // Restart the animation.
      void target.offsetWidth
      target.classList.add('rippling')
    },
    { passive: true, capture: true },
  )
  document.addEventListener('animationend', event => {
    if (event.animationName === 'ripple') (event.target as Element).classList.remove('rippling')
  })
}
