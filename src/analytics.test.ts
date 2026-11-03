import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureResult } from 'posthog-js'
import { EVENTS, PROJECT_NAME } from './analyticsEvents'

const { posthog } = vi.hoisted(() => ({
  posthog: { init: vi.fn(), capture: vi.fn(), register: vi.fn() },
}))

vi.mock('posthog-js', () => ({ default: posthog }))

async function load(options: { key?: string; host?: string } = {}) {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv('VITE_POSTHOG_KEY', options.key ?? '')
  if (options.host !== undefined) vi.stubEnv('VITE_POSTHOG_HOST', options.host)
  return import('./analytics')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('initAnalytics', () => {
  it('does nothing without a key', async () => {
    const idle = vi.fn()
    vi.stubGlobal('requestIdleCallback', idle)
    const analytics = await load()
    analytics.initAnalytics()
    expect(idle).not.toHaveBeenCalled()
  })

  it('starts PostHog shortly after being called', async () => {
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      callback()
      return 0
    })
    const analytics = await load({ key: 'phc_test' })
    analytics.initAnalytics()
    await vi.waitFor(() => expect(posthog.init).toHaveBeenCalled(), { timeout: 3000 })
  })
})

describe('trackEvent', () => {
  it('sends nothing without a key', async () => {
    const { trackEvent } = await load()
    trackEvent(EVENTS.bookOpened, { source: 'text' })
    expect(posthog.init).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('sends an allowed event with the project properties', async () => {
    const { trackEvent } = await load({ key: 'phc_test' })
    trackEvent(EVENTS.bookOpened, { source: 'epub' })
    await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalled())
    expect(PROJECT_NAME).toBe('mono')
    expect(posthog.capture).toHaveBeenCalledWith(
      'book_opened',
      expect.objectContaining({ project_name: 'mono', $project_name: 'mono', env: 'test', source: 'epub' }),
      undefined,
    )
    expect(posthog.capture.mock.calls[0][1]).toHaveProperty('app_version')
    expect(posthog.register).toHaveBeenCalledWith(
      expect.objectContaining({ project_name: 'mono', $project_name: 'mono' }),
    )
  })

  it('keeps the project properties even when a caller passes its own', async () => {
    const { trackEvent } = await load({ key: 'phc_test' })
    trackEvent(EVENTS.bookOpened, { project_name: 'other' })
    await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalled())
    expect(posthog.capture.mock.calls[0][1].project_name).toBe('mono')
  })

  it('drops events outside the taxonomy', async () => {
    const { trackEvent } = await load({ key: 'phc_test' })
    trackEvent('custom_event', {})
    expect(posthog.init).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('sends landing calls immediately', async () => {
    const { trackEvent } = await load({ key: 'phc_test' })
    trackEvent(EVENTS.landingCtaClick, { label: 'Start reading' }, { instant: true })
    await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalled())
    expect(posthog.capture).toHaveBeenCalledWith(
      'landing_cta_click',
      expect.objectContaining({ label: 'Start reading' }),
      { send_instantly: true },
    )
  })

  it('forces the project properties on every captured event', async () => {
    const { trackEvent } = await load({ key: 'phc_test' })
    trackEvent(EVENTS.statsOpened)
    await vi.waitFor(() => expect(posthog.init).toHaveBeenCalled())
    const config = posthog.init.mock.calls[0][1] as { before_send?: (captured: CaptureResult) => CaptureResult }
    const result = config.before_send?.({ uuid: '1', event: 'other', properties: { project_name: 'wrong', keep: 1 } })
    expect(result?.properties).toMatchObject({ project_name: 'mono', $project_name: 'mono', env: 'test', keep: 1 })
    expect(result?.properties).toHaveProperty('app_version')
  })

  it('configures the shared proxy, the replay sampling and the allowlist', async () => {
    const { trackEvent } = await load({ key: 'phc_test' })
    trackEvent(EVENTS.statsOpened)
    await vi.waitFor(() => expect(posthog.init).toHaveBeenCalled())
    const config = posthog.init.mock.calls[0][1] as Record<string, unknown>
    expect(config.api_host).toBe('https://p.lacunalabs.it')
    expect(config.person_profiles).toBe('identified_only')
    expect(config.capture_pageview).toBe(true)
    expect(config.autocapture).toEqual({ css_selector_allowlist: ['[data-ph-capture]'] })
    expect(config.session_recording).toEqual({ sampleRate: 0.1, maskAllInputs: true })
  })

  it('honours the host override', async () => {
    const { trackEvent } = await load({ key: 'phc_test', host: 'https://example.test' })
    trackEvent(EVENTS.statsOpened)
    await vi.waitFor(() => expect(posthog.init).toHaveBeenCalled())
    expect((posthog.init.mock.calls[0][1] as Record<string, unknown>).api_host).toBe('https://example.test')
  })
})
