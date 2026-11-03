# Design spec — PostHog analytics for mono

Approved in brainstorming, 2026-11-03.

## Decisions

1. **No cookie banner / GDPR interstitial**: tracking is always on.
2. **Full taxonomy** in the style of homefindr-lite (snake_case event names, shared allowlist gate).
3. **PostHog only** — no GA4.
4. **`capture_pageview: true`**: mono's landing and app are full-load pages; automatic `$pageview` is enough.
5. **Session replay identical to homefindr**: 10% sampling, `maskAllInputs: true`, autocapture restricted to `[data-ph-capture]` elements (marked elements only).
6. **Tracked surfaces**: landing page and the app.
7. **Same PostHog Project API Key as homefindr-lite** (`homefindr-lite/frontend/.env`, `VITE_POSTHOG_KEY`): one project, mono's events separated by the `project_name: mono` super-property. Key lives in `.env.local` locally (gitignored) and in the GitHub Actions secret; never printed or committed.

## Architecture

- Single shared module `src/analytics.ts` + `src/analyticsEvents.ts`, bundled twice: into the app (via `src/main.tsx`) and into a dedicated landing entry (`landing/analytics.ts` → `dist/app/analytics.js`).
- Lazy load: `posthog-js` via dynamic import, started on `requestIdleCallback` + 1s (fallback 2.5s); events fired before load are queued and flushed.
- No key (dev, tests, CI) → every call is a silent no-op.
- Super-properties forced twice: `before_send` (every event, including autocapture and pageviews) and `register` (persistent): `project_name`, `$project_name`, `app_version` (Vite `define` from package.json), `env` (`import.meta.env.MODE`).
- `trackEvent(name, properties?, { instant? })` gates on the taxonomy allowlist; `instant` uses `send_instantly` for the landing CTAs (navigation would drop the queue).
- Ingestion: `https://p.lacunalabs.it` (override via `VITE_POSTHOG_HOST`); the app's CSP `connect-src` must allow it.
- `person_profiles: 'identified_only'`; no identify/ bootstrap — mono has no accounts.

## Constraints

- No PII and no content: never send search queries, book titles, text, filenames or URLs as properties.
- `logged_in` / `transaction` / `city_norm` do not apply (offline app, no accounts).
- Analytics must never break the app: guarded no-ops, failed imports still surface their errors.
- Common event props: `via` (file | paste | share), `source` (text | pdf | epub | web), durations in ms, counts.
