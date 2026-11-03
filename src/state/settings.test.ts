import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../analytics', () => ({
  trackEvent: vi.fn(),
  EVENTS: { settingsChanged: 'settings_changed' },
}))

import { trackEvent } from '../analytics'
import { settings } from './settings'

describe('settings.set', () => {
  beforeEach(() => vi.mocked(trackEvent).mockClear())

  it('tracks a changed setting', () => {
    const before = settings.value.tickSound
    settings.set('tickSound', !before)
    expect(trackEvent).toHaveBeenCalledWith('settings_changed', { key: 'tickSound', value: !before })
    settings.set('tickSound', before)
  })

  it('does not track when the value is unchanged', () => {
    settings.set('wpm', settings.value.wpm)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('does not track internal flags', () => {
    settings.set('didShowGestures', true)
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
