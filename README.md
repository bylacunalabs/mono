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

- `src/core` — pure logic: tokenizer, ORP, timing, hyphenation, engine, stats
- `src/import` — TXT (encoding detection), HTML, EPUB (fflate), PDF (pdf.js, lazy)
- `src/storage` — IndexedDB: books, texts, statistics
- `src/state` — library and settings stores
- `src/ui` — Preact views and styles

## Differences from the iOS app

- No volume-button speed control (not possible in a browser).
- No Share Extension; files can be picked, dropped onto the library, pasted
  as text or (installed Chromium PWA) opened with Mono.
- No article import from links (would need a server to get around CORS).
- Liquid Glass is approximated with `backdrop-filter`.
- Apple system fonts (SF Pro, SF Mono, New York, SF Rounded) are only exact
  on Apple devices; elsewhere close fallbacks are used.
- Data is stored per browser and isn't shared with the iOS app.
