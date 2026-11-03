# Mono

Speed reading, one word at a time. Mono shows each word in the same place,
anchored on the letter your eye lands on (the Optimal Recognition Point), so
your eyes stay still while you read books, articles and PDFs.

Mono is a web app — an installable Progressive Web App with a tokenizer, ORP
placement, a timing model, syllable splitting, a library, statistics and
gesture controls made for reading whole books. Everything runs in the
browser: no account, no server, texts stay on the device and reading
works offline.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173 (landing page), /app/ (the app)
npm test           # unit tests
npm run test:e2e   # end-to-end tests on the build (Playwright; after npm run build)
npm run lint       # ESLint; npm run format applies Prettier
npm run build      # type-check + production build in dist/
npm run preview    # serve dist/ (service worker active)
npm run brand      # redraw the logo, icons, launch screens and social image
```

The site is the landing page at the root (`landing/`, plain HTML; its demo
of the reader, `landing/demo.ts`, runs the app's own `src/core`), the brand
guidelines in `brand/` and the app in `app/`; `dist/` holds all three. The
landing page's `sw.js` retires the service worker of installs made before
the app moved to `app/` (October 2026); remove it after April 2027.

Analytics is optional PostHog tracking (`src/analytics.ts`, on the landing
page and in the app) through the `https://p.lacunalabs.it` proxy, with the
Lacuna Labs key in `VITE_POSTHOG_KEY` (`homefindr-lite/frontend/.env`; see
`.env.example`, put it in `.env.local` for local builds). Without a key
every call is a no-op and the build leaves PostHog out entirely. Events
carry `project_name: mono`, so they stay distinct from the other projects
on the same PostHog instance. Nothing personal or from the texts is ever
sent.

## Deploy

Every push to `main` publishes the site to GitHub Pages
(`.github/workflows/deploy.yml`; turn Pages on with Source: GitHub Actions).
`SITE_URL`, the site's public address, makes the link-preview image's URL
absolute; the `VITE_POSTHOG_KEY` secret enables analytics.

To serve from a sub-path (e.g. GitHub Pages at `/mono/`, app at `/mono/app/`):

```sh
BASE=/mono/ npm run build
```

## Brand

`scripts/brand.mjs` draws every brand asset from one geometry: the wordmark
(round-capped strokes, the first o in red), the app icon (the wordmark
cropped around that o, on the reader's reticle), the favicon, the PWA icons,
the iOS launch screens, the social image and the app's own
`src/ui/wordmark.svg`, rendered with resvg. The rules for using them are at
`/brand/`.

## Layout

- `src/core` — pure logic: tokenizer, ORP, timing, hyphenation, engine, stats, backup merging
- `src/import` — TXT (encoding detection), HTML, EPUB (fflate; title, author,
  year, cover), PDF (pdf.js, lazy). Parsing, preparing and tokenizing run in
  a Web Worker (`worker.ts`, driven by `importer.ts`)
- `src/storage` — IndexedDB: books, texts, covers, statistics, share inbox; backup files
- `src/state` — library, settings, covers and PWA (updates, install) stores
- `src/ui` — Preact views; `src/ui/styles/` one stylesheet per area, imported in cascade order by `index.css`
- `src/sw.ts` — the service worker: precache, update on request, share target

## As an installed app

- **Updates** are downloaded in the background and applied only when you tap
  _Update_ in the banner, so files never change under an open page.
- **Back** (button or gesture) closes the reader, sheets and alerts instead
  of leaving the app.
- **Share to Mono** (Android, desktop Chromium): text and files shared from
  other apps land in the library.
- **Shortcuts** (long press on the icon): Continue Reading, Paste Text.
- **Backup**: Settings → Library exports everything to a JSON file and
  merges one back in.
- **Theme**: Automatic, Light or Dark in Settings; the reader follows it.
- **Language**: English or Italian, following the device unless chosen in
  Settings. The messages are in `src/state/locales/` (English is the source;
  the others must have the same keys); the guide added at first launch is in
  `src/core/sample.ts`.
- **Launch screen** on iOS: `public/splash/` holds one image per iPhone and
  iPad screen size and theme (linked by a plugin in `vite.config.ts`).

## iOS and Android

One design, adapted where each system has its own conventions
(`src/ui/platform.ts` sets `data-platform` on `<html>`):

- **Android**: Material dialogs, menus, bottom sheets with a handle,
  snackbars and switches; a floating add button; ripples on press. Low-end
  devices get opaque surfaces instead of backdrop blur.
- **iOS**: alerts and sheets in the system's style; interface text follows the
  system text size (Dynamic Type); haptic ticks through Safari's switch
  control (iOS 18+), as there's no Vibration API.
- **Both**: reader swipes that start at the screen's edges are left to the
  system (back gesture, Notification Centre, home indicator); rows swipe to
  reveal Start Over and Delete; deleting can be undone; opening a text grows
  its cover into the reader (View Transitions).

## Browser limits

- Safari doesn't support Web Share Target, so on iPhone and iPad Mono isn't
  in the Share menu; files can be picked, dropped onto the library or pasted
  as text. Installed Chromium apps can also open files with Mono and receive
  shares.
- No article import from links: fetching other sites from the page would
  need a server to get around CORS.
- Apple system fonts (SF Pro, SF Mono, New York, SF Rounded) are only exact
  on Apple devices; elsewhere close fallbacks are used.
- Data is stored per browser: Export Backup and Restore Backup in Settings
  move it to another browser or device.

## Contributing

Issues and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Lacuna Labs
