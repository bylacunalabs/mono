# Mono (web)

The Mono RSVP speed reader as an installable Progressive Web App — a port
of the iOS app with the same tokenizer, ORP placement, timing model,
syllable splitting, library, statistics and reader controls.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (ported from the iOS test suite)
npm run build      # type-check + production build in dist/
npm run preview    # serve dist/ (service worker active)
```

To serve from a sub-path (e.g. GitHub Pages at `/mono-web/`):

```sh
BASE=/mono-web/ npm run build
```

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
