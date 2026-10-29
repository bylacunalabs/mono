/// <reference types="vitest/config" />
import { cpSync, readFileSync } from 'node:fs'
import { defineConfig, type Connect, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// The site: the landing page at the root, the app in app/. BASE lets the site
// live under a sub-path, e.g. BASE=/mono-web/ for GitHub Pages.
const site = process.env.BASE ?? '/'
const base = `${site}app/`

// iOS doesn't build a launch screen from the manifest: without these images
// an installed Mono opens on a white screen. One per screen size (CSS px and
// pixel ratio, portrait) and theme, made with the wordmark on the app's
// background; public/splash/WxH-light|dark.png in device pixels.
const SPLASH_SCREENS: [number, number, number][] = [
  [440, 956, 3], [430, 932, 3], [428, 926, 3], [420, 912, 3], [414, 896, 3], [414, 896, 2], [402, 874, 3],
  [393, 852, 3], [390, 844, 3], [375, 812, 3], [375, 667, 2], [320, 568, 2],
  [1032, 1376, 2], [1024, 1366, 2], [834, 1210, 2], [834, 1194, 2], [834, 1112, 2], [820, 1180, 2], [810, 1080, 2],
  [768, 1024, 2], [744, 1133, 2],
]

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

// The landing page (landing/, plain files) at the site's root: served by the
// dev and preview servers, copied next to the app on build. Its sw.js retires
// the service worker of the app as it was before it moved to app/.
function landingPage(): Plugin {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const path = req.url?.split('?')[0]
    const file = path === site || path === `${site}index.html` ? 'index.html' : path === `${site}sw.js` ? 'sw.js' : undefined
    if (!file) return next()
    res.setHeader('Content-Type', file === 'sw.js' ? 'text/javascript' : 'text/html')
    res.end(readFileSync(`landing/${file}`))
  }
  return {
    name: 'landing-page',
    configureServer: server => void server.middlewares.use(serve),
    configurePreviewServer: server => void server.middlewares.use(serve),
    closeBundle: () => cpSync('landing', 'dist', { recursive: true }),
  }
}

export default defineConfig({
  base,
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
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
          { src: 'screenshots/library-narrow.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Your library and where you left off' },
          { src: 'screenshots/reader-narrow.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Reading one word at a time' },
          { src: 'screenshots/reader-wide.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Reading one word at a time' },
        ],
        shortcuts: [
          { name: 'Continue Reading', short_name: 'Continue', url: './?action=continue', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Paste Text', short_name: 'Paste', url: './?action=paste', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
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
                accept: ['text/plain', '.txt', 'application/pdf', '.pdf', 'application/epub+zip', '.epub', 'text/html', '.html', '.htm'],
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
  },
})
