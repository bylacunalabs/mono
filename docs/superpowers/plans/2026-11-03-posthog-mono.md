# Plan — PostHog analytics for mono

Approved 2026-11-03 ("vai"). Companion design spec: `docs/superpowers/specs/2026-11-03-posthog-analytics.md`.

**Goal**: events on landing + app, `project_name: mono`, proxy `https://p.lacunalabs.it`, homefindr's key, no cookie banner, 10% sampled replay.
**Stack**: `posthog-js@^1.443.0`, shared module `src/analytics.ts` bundled for both app and landing (approved approach A).

## Deviations from the approved design

1. **CSP** (`index.html:12`) has `connect-src 'self' blob:`, which blocks `p.lacunalabs.it` → add `https://p.lacunalabs.it` (Task 2).
2. **`reader_opened` dropped**: it would coincide with `book_opened`. One event, fired from `App.tsx` when `readingID` changes (covers tap, continue shortcut, file-open launches).
3. **Replay sampling**: posthog-js 1.443 reads `session_recording.sampleRate` (verified in `module.js`); homefindr's `sample_rate`/`sampled` are legacy keys this version ignores. Use `session_recording: { sampleRate: 0.1, maskAllInputs: true }`.
4. **`settings_changed`** excludes internal `did*` flags (didSeedSample, didShowGestures, didAskInstall, didShowRotateHint).
5. **Shared PostHog project**: events land in homefindr's project, distinguished by `project_name: mono` / `$project_name: mono` (forced by `before_send` + `register`). Dashboards filter on that property. Never PII: no search queries, titles or text in events.

## Task 1 — Core module + taxonomy (TDD)

- `npm i posthog-js@^1.443.0` (dependencies).
- New `src/analyticsEvents.ts`: `PROJECT_NAME = 'mono'`, `EVENTS` map (landingCtaClick→`landing_cta_click`, bookOpened, bookDeleted, librarySearchUsed, importStarted, importCompleted, importFailed, readingCompleted, settingsChanged, statsOpened, pwaInstalled, pwaUpdateApplied, backupExported, backupRestored), `isAllowedEvent` allowlist incl. `$pageview`.
- New `src/analytics.ts`: `KEY`/`HOST` from `import.meta.env` (default host `https://p.lacunalabs.it`), `BASE_PROPS` (`project_name`, `$project_name`, `app_version` via `__APP_VERSION__`, `env: import.meta.env.MODE`), lazy `import('posthog-js')` with `person_profiles: 'identified_only'`, `capture_pageview: true`, `autocapture: { css_selector_allowlist: ['[data-ph-capture]'] }`, `session_recording: { sampleRate: 0.1, maskAllInputs: true }`, `before_send` forcing `BASE_PROPS`, `register(BASE_PROPS)`; `initAnalytics()` idle-delayed (`requestIdleCallback` + 1s, fallback 2.5s), `trackEvent(name, props?, { instant? })` with allowlist gate + pending queue + immediate start; re-export `EVENTS`.
- `vite.config.ts`: `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` reading package.json.
- New `src/analytics.test.ts` (red→green): no-key no-op; capture with base props; unknown event dropped; `before_send` forces mono; init options (api_host incl. override, autocapture, session_recording, person_profiles, capture_pageview); `send_instantly`.
- Verify: `npm test`, `npm run lint`, `npx tsc --noEmit`. Commit: `PostHog analytics module with its event taxonomy`.

## Task 2 — App init and events

- `src/main.tsx`: `initAnalytics()` before `library.load()`.
- `index.html`: CSP `connect-src 'self' blob: https://p.lacunalabs.it`.
- `src/ui/App.tsx`: effect on `readingID` → `book_opened { source, resumed }`.
- `src/state/library.ts`: `importFiles(files, via='file')`, `addText(text,title,via='paste')`, `importShared` passes `'share'`; `add(work, via?)` emits `import_started` / `import_completed { via, source, ms }` / `import_failed { via, reason }` (ImportError.problem else `'other'`); seed sample passes no `via`. `delete()` → `book_deleted { source }`.
- `src/ui/LibraryView.tsx`: empty→non-empty transition → `library_search_used` (never the query).
- `src/ui/ReaderView.tsx` checkpoint effect: `wasPlaying && !isPlaying && engine.isFinished` → `reading_completed { source }`.
- `src/state/settings.ts` `set()` → `settings_changed { key, value }` unless key starts with `did`.
- `src/ui/StatsView.tsx`: mount effect → `stats_opened`.
- `src/state/pwa.ts`: `appinstalled` → `pwa_installed`; `update()` when `applyUpdate` exists → `pwa_update_applied`.
- `src/ui/SettingsView.tsx`: after download → `backup_exported { books }`; restore count !== undefined → `backup_restored { books }`.
- New `src/state/settings.test.ts` (red→green).
- Verify: `npm test`, `npm run lint`, `npx tsc --noEmit`. Commit: `Analytics on every app event, from open to backup`.

## Task 3 — Landing

- New `landing/analytics.ts`: `initAnalytics()` + click listeners on `a[href="app/"]` → `landing_cta_click { label }` with `{ instant: true }`.
- `vite.config.ts`: `ANALYTICS` const + dev middleware rewrite to `landing/analytics.ts`; rollup input `analytics: 'landing/analytics.ts'`; `entryFileNames` → `analytics.js`.
- `landing/index.html`: `<script type="module" src="app/analytics.js"></script>` after the demo script.
- Verify: `npm run build` (dist/app/analytics.js + dist/index.html script), dev `/app/analytics.js` transforms, tests + lint. Commit: `The landing page sends its pageviews and CTA clicks`.

## Task 4 — Environment, CI, docs

- New `.env.example` (VITE_POSTHOG_KEY, VITE_POSTHOG_HOST + CSP note).
- `.gitignore`: add `.env` (`*.local` already covers `.env.local`).
- Local `.env.local`: copy key from `../homefindr-lite/frontend/.env` (never printed, never committed).
- `.github/workflows/deploy.yml` build step: `VITE_POSTHOG_KEY: ${{ secrets.VITE_POSTHOG_KEY }}`.
- README: short note in Develop + Deploy.
- Manual (user): create the GitHub Actions secret.
- Verify: `npm run format:check`, `npm run lint`. Commit: `Analytics key in the environment, the workflow and the README`.

## Task 5 — Final verification

1. `npm run format:check && npm run lint && npm test && npm run build`.
2. Smoke with key (dev server + Network): landing `$pageview`, `landing_cta_click` instant, `book_opened`, `import_completed`, `library_search_used`, `reading_completed`; without key: zero requests, clean console.
3. PostHog UI: filter `project_name = mono`.
4. Optional: `npm run test:e2e` (behavioral tests only; e2e builds have no key → no-op).

One commit per task; TDD on Task 1 and the settings test.
