/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// BASE lets the app live under a sub-path, e.g. BASE=/mono-web/ for GitHub Pages.
const base = process.env.BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    preact(),
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
        // Only for install dialogs, never needed offline.
        globIgnores: ['screenshots/**'],
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
