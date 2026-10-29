# Mono (web)

Speed reading, one word at a time. Mono shows each word in the same place,
anchored on the letter your eye lands on (the Optimal Recognition Point), so
your eyes stay still while you read books, articles and PDFs.

This is the Mono RSVP speed reader as an installable Progressive Web App — a
port of the iOS app with the same tokenizer, ORP placement, timing model,
syllable splitting, library, statistics and reader controls. Everything runs
in the browser: no account, no server, texts stay on the device and reading
works offline.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173 (landing page), /app/ (the app)
npm test           # unit tests (ported from the iOS test suite)
npm run build      # type-check + production build in dist/
npm run preview    # serve dist/ (service worker active)
npm run brand      # redraw the logo, icons, launch screens and social image
```

The site is the landing page at the root (`landing/`, plain HTML with an
inline demo of the reader), the brand guidelines in `brand/` and the app in
`app/`; `dist/` holds all three. The
landing page's `sw.js` retires the service worker of installs made before
the app moved to `app/`.

To serve from a sub-path (e.g. GitHub Pages at `/mono-web/`, app at `/mono-web/app/`):

```sh
BASE=/mono-web/ npm run build
```

## Brand

`scripts/brand.mjs` draws every brand asset from one geometry: the wordmark
(round-capped strokes, the first o in red), the app icon (the wordmark
cropped around that o, on the reader's reticle), the favicon, the PWA icons,
the iOS launch screens, the social image and the app's own
`src/ui/wordmark.svg`. It needs `rsvg-convert` (`brew install librsvg`). The
rules for using them are at `/brand/`.

## Layout

- `src/core` — pure logic: tokenizer, ORP, timing, hyphenation, engine, stats, backup merging
- `src/import` — TXT (encoding detection), HTML, EPUB (fflate; title, author,
  year, cover), PDF (pdf.js, lazy). Parsing, preparing and tokenizing run in
  a Web Worker (`worker.ts`, driven by `importer.ts`)
- `src/storage` — IndexedDB: books, texts, covers, statistics, share inbox; backup files
- `src/state` — library, settings, covers and PWA (updates, install) stores
- `src/ui` — Preact views and styles
- `src/sw.ts` — the service worker: precache, update on request, share target

## As an installed app

- **Updates** are downloaded in the background and applied only when you tap
  *Update* in the banner, so files never change under an open page.
- **Back** (button or gesture) closes the reader, sheets and alerts instead
  of leaving the app.
- **Share to Mono** (Android, desktop Chromium): text and files shared from
  other apps land in the library.
- **Shortcuts** (long press on the icon): Continue Reading, Paste Text.
- **Backup**: Settings → Library exports everything to a JSON file and
  merges one back in.
- **Theme**: Automatic, Light or Dark in Settings; the reader follows it.
- **Launch screen** on iOS: `public/splash/` holds one image per iPhone and
  iPad screen size and theme (linked by a plugin in `vite.config.ts`).

## iOS and Android

One design, adapted where each system has its own conventions
(`src/ui/platform.ts` sets `data-platform` on `<html>`):

- **Android**: Material dialogs, menus, bottom sheets with a handle,
  snackbars and switches; a floating add button; ripples on press. Low-end
  devices get opaque surfaces instead of backdrop blur.
- **iOS**: alerts and sheets as in the iOS app; interface text follows the
  system text size (Dynamic Type); haptic ticks through Safari's switch
  control (iOS 18+), as there's no Vibration API.
- **Both**: reader swipes that start at the screen's edges are left to the
  system (back gesture, Notification Centre, home indicator); rows swipe to
  reveal Start Over and Delete; deleting can be undone; opening a text grows
  its cover into the reader (View Transitions).

## Differences from the iOS app

- No volume-button speed control (not possible in a browser).
- No Share Extension on iOS (Safari doesn't support Web Share Target); files
  can be picked, dropped onto the library, pasted as text or, in installed
  Chromium apps, opened with or shared to Mono.
- No article import from links (would need a server to get around CORS).
- Liquid Glass is approximated with `backdrop-filter`.
- Apple system fonts (SF Pro, SF Mono, New York, SF Rounded) are only exact
  on Apple devices; elsewhere close fallbacks are used.
- Data is stored per browser and isn't shared with the iOS app.

## Contributing

Issues and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Lacuna Labs
