# Contributing to Mono

Thanks for helping make Mono better. Bug reports, ideas and pull requests are
all welcome.

## Reporting a bug

Open an issue with:

- what you did, what you expected and what happened instead;
- the device, system and browser (and whether Mono was installed or in a tab);
- for an import problem, the file's format and, if you can share it, the file
  or a small part of it that shows the problem.

## Making a change

```sh
npm install
npm run dev        # landing page at /, the app at /app/
npm test
npm run build      # type-checks too
```

- Keep pull requests focused on one change, and describe what it does and why.
- Add or update tests in `src/core` and `src/import` when you change the
  tokenizer, ORP placement, timing or importers.
- Match the surrounding code: Preact with plain stores, no new dependencies
  unless they earn their place, comments that explain why rather than what.
- The interface follows each platform's conventions (see "iOS and Android" in
  the README): check a UI change on both, and in light and dark themes.
- Reading surfaces must keep the ORP letter exactly on the reticle's centre
  line; `src/ui/fonts.ts` explains how words are measured.

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
