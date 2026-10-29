/// <reference types="vitest/config" />
import { cpSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { defineConfig, type Connect, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import splashScreens from './scripts/splash-screens.json' with { type: 'json' }

// The site: the landing page at the root, the app in app/. BASE lets the site
// live under a sub-path, e.g. BASE=/mono/ for GitHub Pages.
const site = process.env.BASE ?? '/'
const base = `${site}app/`
// The site's public address, e.g. https://bylacunalabs.github.io/mono/: link
// previews need the social image's full URL.
const siteURL = process.env.SITE_URL

// iOS doesn't build a launch screen from the manifest: without these images
// an installed Mono opens on a white screen. One per screen size (CSS px and
// pixel ratio, portrait) and theme, drawn by scripts/brand.mjs from the same
// list; public/splash/WxH-light|dark.png in device pixels.
const SPLASH_SCREENS = splashScreens as [number, number, number][]

function appleSplashScreens(): Plugin {
  return {
    name: 'apple-splash-screens',
    transformIndexHtml: () =>
      SPLASH_SCREENS.flatMap(([width, height, ratio]) =>
        (['light', 'dark'] as const).map(scheme => ({
          tag: 'link',
          injectTo: 'head' as const,
          attrs: {
            rel: 'apple-touch-startup-image',
            href: `${base}splash/${width * ratio}x${height * ratio}-${scheme}.png`,
            media:
              `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio})` +
              ` and (orientation: portrait) and (prefers-color-scheme: ${scheme})`,
          },
        })),
      ),
  }
}

// The landing page and brand guidelines (landing/, plain files) at the site's
// root: served by the dev and preview servers, copied next to the app on
// build. Its sw.js retires the service worker of the app as it was before it
// moved to app/. The landing page's reader, landing/demo.ts, uses the app's
// own code: it's built with the app as app/demo.js.
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

const DEMO = `${base}demo.js`

function landingPage(): Plugin {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const path = decodeURIComponent(req.url?.split('?')[0] ?? '')
    if (!path.startsWith(site) || path.startsWith(base)) return next()
    let file = join('landing', normalize(path.slice(site.length - 1)))
    if (!file.startsWith('landing')) return next()
    if (existsSync(file) && statSync(file).isDirectory()) {
      // Relative links in a folder's page need the trailing slash.
      if (!path.endsWith('/')) {
        res.writeHead(301, { Location: `${path}/` })
        return res.end()
      }
      file = join(file, 'index.html')
    }
    if (!existsSync(file)) return next()
    res.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream')
    res.end(readFileSync(file))
  }
  return {
    name: 'landing-page',
    configureServer: server => {
      // In development the demo is its TypeScript source, compiled on request.
      server.middlewares.use((req, _res, next) => {
        if (req.url?.split('?')[0] === DEMO) req.url = `${base}landing/demo.ts`
        next()
      })
      server.middlewares.use(serve)
    },
    configurePreviewServer: server => void server.middlewares.use(serve),
    closeBundle: () => {
      cpSync('landing', 'dist', { recursive: true, filter: source => !source.endsWith('.ts') })
      if (siteURL) {
        const page = readFileSync('dist/index.html', 'utf8')
          .replace('content="og-image.png"', `content="${new URL('og-image.png', siteURL)}"`)
          .replace(
            '<meta property="og:type"',
            `<meta property="og:url" content="${siteURL}" />\n    <meta property="og:type"`,
          )
        writeFileSync('dist/index.html', page)
      }
    },
  }
}

export default defineConfig({
  base,
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: 'index.html', demo: 'landing/demo.ts' },
      // The landing page links demo.js by name.
      output: { entryFileNames: chunk => (chunk.name === 'demo' ? 'demo.js' : 'assets/[name]-[hash].js') },
    },
  },
  plugins: [
    preact(),
    appleSplashScreens(),
    landingPage(),
    VitePWA({
      // The page asks before updating (see state/pwa.ts) and registers the
      // worker itself; src/sw.ts adds the share target to the precache.
      registerType: 'prompt',
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        id: base,
        name: 'Mono',
        short_name: 'Mono',
        description: 'Speed reading, one word at a time.',
        lang: 'en',
        display: 'standalone',
        orientation: 'any',
        categories: ['books', 'education', 'productivity'],
        background_color: '#000000',
        theme_color: '#000000',
        start_url: '.',
        scope: '.',
        // Opening a file, a shortcut or a share reuses the open window.
        launch_handler: { client_mode: ['focus-existing', 'auto'] },
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Shown by the richer install dialogs (Android, desktop Chromium).
        screenshots: [
          {
            src: 'screenshots/library-narrow.png',
            sizes: '780x1688',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Your library and where you left off',
          },
          {
            src: 'screenshots/reader-narrow.png',
            sizes: '780x1688',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Reading one word at a time',
          },
          {
            src: 'screenshots/reader-wide.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Reading one word at a time',
          },
        ],
        shortcuts: [
          {
            name: 'Continue Reading',
            short_name: 'Continue',
            url: './?action=continue',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Paste Text',
            short_name: 'Paste',
            url: './?action=paste',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
          },
        ],
        share_target: {
          action: 'share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'files',
                accept: [
                  'text/plain',
                  '.txt',
                  'application/pdf',
                  '.pdf',
                  'application/epub+zip',
                  '.epub',
                  'text/html',
                  '.html',
                  '.htm',
                ],
              },
            ],
          },
        },
        file_handlers: [
          {
            action: '.',
            accept: {
              'text/plain': ['.txt'],
              'application/pdf': ['.pdf'],
              'application/epub+zip': ['.epub'],
              'text/html': ['.html', '.htm'],
            },
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        // Only for install dialogs and iOS's launch, never fetched by the app.
        globIgnores: ['screenshots/**', 'splash/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    // Unit tests only: e2e/ is Playwright's.
    include: ['src/**/*.test.ts'],
  },
})
