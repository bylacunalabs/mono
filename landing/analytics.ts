import { EVENTS, initAnalytics, trackEvent } from '../src/analytics'

initAnalytics()

for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href="app/"]')) {
  anchor.addEventListener('click', () => {
    trackEvent(EVENTS.landingCtaClick, { label: anchor.textContent?.trim() ?? '' }, { instant: true })
  })
}
