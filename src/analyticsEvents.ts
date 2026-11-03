export const PROJECT_NAME = 'mono'

export const EVENTS = {
  landingCtaClick: 'landing_cta_click',
  bookOpened: 'book_opened',
  bookDeleted: 'book_deleted',
  librarySearchUsed: 'library_search_used',
  importStarted: 'import_started',
  importCompleted: 'import_completed',
  importFailed: 'import_failed',
  readingCompleted: 'reading_completed',
  settingsChanged: 'settings_changed',
  statsOpened: 'stats_opened',
  pwaInstalled: 'pwa_installed',
  pwaUpdateApplied: 'pwa_update_applied',
  backupExported: 'backup_exported',
  backupRestored: 'backup_restored',
} as const

const ALLOWED = new Set<string>([...Object.values(EVENTS), '$pageview'])

export function isAllowedEvent(name: string): boolean {
  return ALLOWED.has(name)
}
