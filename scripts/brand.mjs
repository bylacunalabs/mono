// Mono's brand assets, all drawn from one geometry: the wordmark's letters
// as round-capped strokes, the first o in red on the reader's reticle. The
// app icon is the wordmark cropped around that o.
//
//     npm run brand
//
// writes the SVGs (landing/brand/, public/icons/favicon.svg, the app's
// src/ui/wordmark.svg in currentColor) and renders the
// PNGs (icons, iOS launch screens, the social image) with rsvg-convert
// (librsvg: `brew install librsvg`).

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const BRAND = {
  red: '#ff3b30',
  ink: '#000000',
  paper: '#ffffff',
  night: '#000000',
  day: '#f2f2f7',
}

// Geometry, in the icon's 512-unit space. Letters are strokes of STROKE
// width; the red o is heavier. Every letter sits GAP from the next.
const STROKE = 23
const O_STROKE = 30
const O_RADIUS = 53.5
const TOP = 136.5
const BASE = 318.5
const MIDDLE = 255.5

// The letters' outlines (with their stroke) span TOP - STROKE / 2 to BASE + STROKE / 2.
const M = 'M55 318.5V136.5L106 250L157 136.5V318.5'
const N = 'M354 318.5V231A47.75 47.75 0 0 1 449.5 231V318.5'
const RED_O = { cx: 255.5, r: O_RADIUS }
// The second o matches the first one's outer edge with a lighter stroke.
const GREY_O = { cx: 548, r: O_RADIUS + (O_STROKE - STROKE) / 2 }

/** The wordmark's bounds: left of the M to right of the last o. */
const WORDMARK = { x: 43.5, y: TOP - STROKE / 2, width: 616.5 - 43.5, height: BASE - TOP + STROKE }

/** The four letters; `letters` paints M, n and the second o. */
function letters(letters, red = BRAND.red) {
  const stroke = `fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${STROKE}"`
  return [
    `<path d="${M}" ${stroke} stroke="${letters}"/>`,
    `<circle cx="${RED_O.cx}" cy="${MIDDLE}" r="${RED_O.r}" fill="none" stroke="${red}" stroke-width="${O_STROKE}"/>`,
    `<path d="${N}" ${stroke} stroke="${letters}"/>`,
    `<circle cx="${GREY_O.cx}" cy="${MIDDLE}" r="${GREY_O.r}" fill="none" stroke="${letters}" stroke-width="${STROKE}"/>`,
  ].join('\n  ')
}

/** "Mono", tight to its letters. `color` may be currentColor. */
function wordmarkSVG(color) {
  const { x, y, width, height } = WORDMARK
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" role="img" aria-label="Mono">
  ${letters(color)}
</svg>
`
}

/** Reticle marks around the red o, fading as they near it, like the reader's. */
function reticle(
  id,
  { cx = 256, cy = 256, top = [105, 151], bottom = [360, 406], left, right, color = '#8e8e93', width = 5 } = {},
) {
  const tick = (y1, y2, fadeTo) =>
    `<rect x="${cx - width / 2}" y="${y1}" width="${width}" height="${y2 - y1}" rx="${width / 2}" fill="url(#${id}-${fadeTo})"/>`
  const arm = (x1, x2, fadeTo) =>
    `<rect x="${x1}" y="${cy - width / 2}" width="${x2 - x1}" height="${width}" rx="${width / 2}" fill="url(#${id}-${fadeTo})"/>`
  const gradient = (name, x1, y1, x2, y2) =>
    `<linearGradient id="${id}-${name}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${color}" stop-opacity="0.9"/><stop offset="1" stop-color="${color}" stop-opacity="0.12"/></linearGradient>`
  return {
    defs: [
      gradient('down', 0, 0, 0, 1),
      gradient('up', 0, 1, 0, 0),
      gradient('right', 0, 0, 1, 0),
      gradient('left', 1, 0, 0, 0),
    ].join(''),
    marks: [
      tick(top[0], top[1], 'down'),
      tick(bottom[0], bottom[1], 'up'),
      left ? arm(left[0], left[1], 'right') : '',
      right ? arm(right[0], right[1], 'left') : '',
    ].join(''),
  }
}

/** The app icon: the wordmark cropped around its red o, on the reticle, at night. */
function iconSVG({ scale = 1 } = {}) {
  const marks = reticle('r', { left: [-20, 33] })
  const content = `
    <rect x="-200" y="-200" width="912" height="912" fill="url(#bg)"/>
    <circle cx="256" cy="256" r="150" fill="url(#glow)"/>
    ${marks.marks}
    <g>${letters('url(#letters)')}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="256" cy="256" r="380" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#19191b"/><stop offset="1" stop-color="#050505"/>
    </radialGradient>
    <radialGradient id="glow" cx="256" cy="256" r="150" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BRAND.red}" stop-opacity="0.5"/><stop offset="1" stop-color="${BRAND.red}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="letters" x1="0" y1="0" x2="512" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#262628"/><stop offset="0.3" stop-color="#666669"/>
      <stop offset="0.68" stop-color="#6c6c70"/><stop offset="0.88" stop-color="#3a3a3d"/><stop offset="1" stop-color="#1e1e20"/>
    </linearGradient>
    ${marks.defs}
  </defs>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${content}
  </g>
</svg>
`
}

/** The favicon: at 16 pixels only the red o on its reticle reads. */
function faviconSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e8e93"/><stop offset="1" stop-color="#8e8e93" stop-opacity="0.25"/></linearGradient>
    <linearGradient id="u" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#8e8e93"/><stop offset="1" stop-color="#8e8e93" stop-opacity="0.25"/></linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#111113"/>
  <rect x="30.5" y="5" width="3" height="10" rx="1.5" fill="url(#d)"/>
  <rect x="30.5" y="49" width="3" height="10" rx="1.5" fill="url(#u)"/>
  <circle cx="32" cy="32" r="12.5" fill="none" stroke="${BRAND.red}" stroke-width="7"/>
</svg>
`
}

/** The wordmark centred on a screen of the given size, for iOS's launch screen. */
function splashSVG(width, height, scheme) {
  const markWidth = Math.min(width, height) * 0.36
  const s = markWidth / WORDMARK.width
  const x = (width - WORDMARK.width * s) / 2
  const y = height / 2 - (MIDDLE - WORDMARK.y) * s
  const [bg, fg] = scheme === 'dark' ? [BRAND.night, '#ffffff'] : [BRAND.day, BRAND.ink]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <g transform="translate(${x} ${y}) scale(${s}) translate(${-WORDMARK.x} ${-WORDMARK.y})">${letters(fg)}</g>
</svg>
`
}

/** The image shown when a link to the site is shared (1200 × 630). */
function socialSVG() {
  const s = 0.95
  // The red o on the image's reticle, at its centre line.
  const ox = 600 - (RED_O.cx - 256) * s
  const oy = 270
  // Arms stop short of the word's ends, ticks short of the o, as in the reader.
  const marks = reticle('m', {
    cx: ox,
    cy: oy,
    top: [40, oy - 100],
    bottom: [oy + 100, 430],
    left: [60, ox + (WORDMARK.x - RED_O.cx) * s - 28],
    right: [ox + (WORDMARK.x + WORDMARK.width - RED_O.cx) * s + 28, 1140],
    width: 4,
  })
  const sans = "'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif"
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="600" cy="270" r="760" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#151517"/><stop offset="1" stop-color="#000"/>
    </radialGradient>
    <radialGradient id="glow" cx="${ox}" cy="${oy}" r="190" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BRAND.red}" stop-opacity="0.42"/><stop offset="1" stop-color="${BRAND.red}" stop-opacity="0"/>
    </radialGradient>
    ${marks.defs}
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="${ox}" cy="${oy}" r="190" fill="url(#glow)"/>
  ${marks.marks}
  <g transform="translate(${ox} ${oy}) scale(${s}) translate(${-RED_O.cx} ${-MIDDLE})">${letters('#ffffff')}</g>
  <text x="600" y="520" text-anchor="middle" font-family="${sans}" font-size="44" font-weight="600" fill="#ffffff" letter-spacing="-0.5">Speed reading, one word at a time.</text>
  <text x="600" y="574" text-anchor="middle" font-family="${sans}" font-size="26" fill="#8e8e93">Free · Offline · Private · Open source</text>
</svg>
`
}

// The iOS launch screens linked by vite.config.ts (keep the two lists alike):
// width, height (CSS px) and pixel ratio.
// prettier-ignore
const SPLASH_SCREENS = [
  [440, 956, 3], [430, 932, 3], [428, 926, 3], [420, 912, 3], [414, 896, 3], [414, 896, 2], [402, 874, 3],
  [393, 852, 3], [390, 844, 3], [375, 812, 3], [375, 667, 2], [320, 568, 2],
  [1032, 1376, 2], [1024, 1366, 2], [834, 1210, 2], [834, 1194, 2], [834, 1112, 2], [820, 1180, 2], [810, 1080, 2],
  [768, 1024, 2], [744, 1133, 2],
]

function render(svg, out, width, height = width) {
  execFileSync('rsvg-convert', ['--width', String(width), '--height', String(height), '--output', out], { input: svg })
}

function main() {
  mkdirSync('landing/brand', { recursive: true })
  mkdirSync('public/icons', { recursive: true })
  mkdirSync('public/splash', { recursive: true })

  const icon = iconSVG()
  const favicon = faviconSVG()
  const files = {
    'landing/brand/mono-icon.svg': icon,
    'landing/brand/mono-favicon.svg': favicon,
    'landing/brand/mono-wordmark-white.svg': wordmarkSVG('#ffffff'),
    'landing/brand/mono-wordmark-black.svg': wordmarkSVG(BRAND.ink),
    'public/icons/favicon.svg': favicon,
    'src/ui/wordmark.svg': wordmarkSVG('currentColor'),
  }
  for (const [path, svg] of Object.entries(files)) writeFileSync(path, svg)

  render(icon, 'public/icons/icon-512.png', 512)
  render(icon, 'public/icons/icon-192.png', 192)
  render(icon, 'public/icons/apple-touch-icon.png', 180)
  // Maskable: launchers may cut down to the central 80% circle.
  render(iconSVG({ scale: 0.82 }), 'public/icons/icon-maskable-512.png', 512)
  render(icon, 'landing/brand/mono-icon-1024.png', 1024)
  render(socialSVG(), 'landing/og-image.png', 1200, 630)

  for (const [width, height, ratio] of SPLASH_SCREENS) {
    for (const scheme of ['light', 'dark']) {
      const w = width * ratio
      const h = height * ratio
      render(splashSVG(w, h, scheme), `public/splash/${w}x${h}-${scheme}.png`, w, h)
    }
  }
  console.log(`Brand assets written: ${Object.keys(files).length} SVGs, ${6 + SPLASH_SCREENS.length * 2} PNGs.`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
