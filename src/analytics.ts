import type { PostHog } from 'posthog-js'
import { EVENTS, PROJECT_NAME, isAllowedEvent } from './analyticsEvents'

declare const __APP_VERSION__: string

const KEY: string | undefined = import.meta.env.VITE_POSTHOG_KEY
const HOST: string = import.meta.env.VITE_POSTHOG_HOST || 'https://p.lacunalabs.it'

const BASE_PROPS = {
  project_name: PROJECT_NAME,
  $project_name: PROJECT_NAME,
  app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
  env: import.meta.env.MODE,
}

interface QueuedEvent {
  name: string
  properties: Record<string, unknown>
  instant: boolean
}

let posthog: PostHog | undefined
let starting = false
const pending: QueuedEvent[] = []

function send(event: QueuedEvent): void {
  if (!posthog || !isAllowedEvent(event.name)) return
  posthog.capture(
    event.name,
    { ...event.properties, ...BASE_PROPS },
    event.instant ? { send_instantly: true } : undefined,
  )
}

function start(): void {
  if (starting || !KEY) return
  starting = true
  void import('posthog-js')
    .then(({ default: ph }) => {
      ph.init(KEY, {
        api_host: HOST,
        person_profiles: 'identified_only',
        capture_pageview: true,
        autocapture: { css_selector_allowlist: ['[data-ph-capture]'] },
        session_recording: { sampleRate: 0.1, maskAllInputs: true },
        before_send: captured => {
          Object.assign(captured.properties, BASE_PROPS)
          return captured
        },
      })
      ph.register({ ...BASE_PROPS })
      posthog = ph
      const queued = pending.splice(0)
      for (const event of queued) send(event)
    })
    .catch(() => {})
}

export function initAnalytics(): void {
  if (!KEY) return
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => setTimeout(start, 1000))
  else setTimeout(start, 2500)
}

export function trackEvent(name: string, properties?: Record<string, unknown>, options?: { instant?: boolean }): void {
  if (!KEY || !isAllowedEvent(name)) return
  const event = { name, properties: properties ?? {}, instant: options?.instant ?? false }
  if (posthog) send(event)
  else {
    pending.push(event)
    start()
  }
}

export { EVENTS, PROJECT_NAME }
