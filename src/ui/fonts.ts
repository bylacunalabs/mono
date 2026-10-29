// The typefaces offered for reading, and the measurements that keep the ORP
// letter centred and every word on screen at one fixed size.
//
// A word's "extents" are how far it reaches left and right of the centre of
// its ORP glyph, per point of font size. The widest extents among a text's
// words of up to WHOLE_WORD_LIMIT characters decide the size at which every
// word still appears whole. The zoom goes further, up to the size at which
// short words (up to ZOOM_WORD_LIMIT characters) fill the screen's width:
// past the whole-word size, words that don't fit are split into syllables.
//
// Apple's system faces (SF Pro, SF Mono, New York, SF Rounded) are reached
// through the ui-* generic families; other platforms get close fallbacks.

import { orpIndex, orpParts } from '../core/orp'
import type { Token } from '../core/tokenizer'
import { chars } from '../core/text'

export type ReadingFont = 'mono' | 'sans' | 'rounded' | 'serif' | 'avenir' | 'georgia' | 'charter'

export const READING_FONTS: ReadingFont[] = ['mono', 'sans', 'rounded', 'serif', 'avenir', 'georgia', 'charter']

export const FONT_NAMES: Record<ReadingFont, string> = {
  mono: 'SF Mono',
  sans: 'SF Pro',
  rounded: 'SF Pro Rounded',
  serif: 'New York',
  avenir: 'Avenir Next',
  georgia: 'Georgia',
  charter: 'Charter',
}

export const FONT_STACKS: Record<ReadingFont, string> = {
  mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  sans: 'system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif',
  serif: 'ui-serif, "New York", "Iowan Old Style", Georgia, serif',
  avenir: '"Avenir Next", Avenir, "Segoe UI", "Nunito Sans", system-ui, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  charter: 'Charter, "Bitstream Charter", "Iowan Old Style", Georgia, serif',
}

export const fontWeight = (bold: boolean) => (bold ? 700 : 500)

export function cssFont(font: ReadingFont, size: number, bold: boolean) {
  return `${fontWeight(bold)} ${size}px ${FONT_STACKS[font]}`
}

// Measurement

/** Measurement size; extents are stored per point of font size. */
const REFERENCE_SIZE = 100

let context: CanvasRenderingContext2D | null | undefined

function measure(text: string, font: ReadingFont, bold: boolean, size = REFERENCE_SIZE): number {
  if (!text) return 0
  context ??= document.createElement('canvas').getContext('2d')
  if (!context) return text.length * size * 0.6
  context.font = cssFont(font, size, bold)
  return context.measureText(text).width
}

export function textWidth(text: string, font: ReadingFont, size: number, bold: boolean) {
  return (measure(text, font, bold) * size) / REFERENCE_SIZE
}

/** Vertical ink bounds of a glyph, in ems from the top of a line box `lineHeight` ems tall. */
export interface GlyphBounds {
  top: number
  bottom: number
}

const glyphCache = new Map<string, GlyphBounds>()

export function glyphBounds(text: string, font: ReadingFont, bold: boolean, lineHeight: number): GlyphBounds {
  const key = `${font}|${bold}|${lineHeight}|${text}`
  const cached = glyphCache.get(key)
  if (cached) return cached
  context ??= document.createElement('canvas').getContext('2d')
  // Without measurements: roughly a lower-case letter.
  let bounds: GlyphBounds = { top: lineHeight / 2 - 0.3, bottom: lineHeight / 2 + 0.25 }
  if (context && text.trim()) {
    context.font = cssFont(font, REFERENCE_SIZE, bold)
    context.textBaseline = 'alphabetic'
    const m = context.measureText(text)
    const ascent = (m.fontBoundingBoxAscent ?? REFERENCE_SIZE * 0.8) / REFERENCE_SIZE
    const descent = (m.fontBoundingBoxDescent ?? REFERENCE_SIZE * 0.2) / REFERENCE_SIZE
    // CSS centres the font's ascent + descent in the line box.
    const baseline = (lineHeight - ascent - descent) / 2 + ascent
    bounds = {
      top: baseline - m.actualBoundingBoxAscent / REFERENCE_SIZE,
      bottom: baseline + Math.max(0, m.actualBoundingBoxDescent / REFERENCE_SIZE),
    }
  }
  glyphCache.set(key, bounds)
  return bounds
}

export interface Extents {
  left: number
  right: number
}

/** Largest font size at which these extents fit in `halfWidth` each side. */
export function maxFontSize(extents: Extents, halfWidth: number) {
  const widest = Math.max(extents.left, extents.right)
  return widest > 0 ? halfWidth / widest : Infinity
}

/** Exact extents of one word around its ORP glyph, per point. */
export function extents(word: string, font: ReadingFont, bold: boolean): Extents {
  const parts = orpParts(word)
  const orp = measure(parts.orp, font, bold)
  return {
    left: (measure(parts.prefix, font, bold) + orp / 2) / REFERENCE_SIZE,
    right: (orp / 2 + measure(parts.suffix, font, bold)) / REFERENCE_SIZE,
  }
}

/** Words up to this many characters fit whole at the whole-word size. */
export const WHOLE_WORD_LIMIT = 16
/** Words up to this many characters still fit whole at the largest zoom. */
export const ZOOM_WORD_LIMIT = 6

/**
 * Widest extents over a text's words of up to `limit` characters.
 * Sums cached per-character advances and adds a small margin for kerning.
 */
export function maxExtents(tokens: Token[], font: ReadingFont, bold: boolean, limit = WHOLE_WORD_LIMIT): Extents {
  const advances = new Map<string, number>()
  const advance = (c: string) => {
    let width = advances.get(c)
    if (width === undefined) {
      width = measure(c, font, bold)
      advances.set(c, width)
    }
    return width
  }
  let left = 0
  let right = 0
  const seen = new Set<string>()
  for (const { text } of tokens) {
    if (seen.has(text)) continue
    seen.add(text)
    const c = chars(text)
    if (!c.length || c.length > limit) continue
    const orp = Math.min(orpIndex(text), c.length - 1)
    const half = advance(c[orp]) / 2
    let l = half
    for (let i = 0; i < orp; i++) l += advance(c[i])
    let r = half
    for (let i = orp + 1; i < c.length; i++) r += advance(c[i])
    if (l > left) left = l
    if (r > right) right = r
  }
  const margin = 1.03 / REFERENCE_SIZE
  return { left: left * margin, right: right * margin }
}

const LONG_WORDS = [
  'particolarmente,',
  'frequentassero,',
  'responsabilità,',
  '«Straordinaria»',
  'understandingly',
  'Massachusetts,',
]
const SHORT_WORDS = ['people,', 'mondo,', '«Così»', 'which.', 'Monday']

/** Typical worst case, for when no text is loaded: long words, or short ones for the zoom's limit. */
export function referenceExtents(font: ReadingFont, bold: boolean, short = false): Extents {
  return (short ? SHORT_WORDS : LONG_WORDS)
    .map(w => extents(w, font, bold))
    .reduce((a, b) => ({ left: Math.max(a.left, b.left), right: Math.max(a.right, b.right) }), { left: 0, right: 0 })
}

// Reticle geometry, shared by the word view and the reader.

export const BASE_FONT_SIZE = 44
export const MINIMUM_SCALE = 0.4
const ARM_INSET = 8
const ARM_GAP = 8
const MINIMUM_ARM = 12
export const TICK_LENGTH = 26
export const TICK_GAP = 22
/** Space between a tick's end and the focus letter's ink, in ems (at least TICK_MIN_CLEARANCE px). */
export const TICK_CLEARANCE = 0.1
export const TICK_MIN_CLEARANCE = 3

/** Half the reticle's width: the screen on phones, capped on wide screens. */
export const reticleHalfWidth = (width: number) => Math.min(width / 2, 480)

/** Room for a word on each side of the centreline. */
export const availableHalfWidth = (width: number) =>
  Math.max(0, reticleHalfWidth(width) - ARM_INSET - MINIMUM_ARM - ARM_GAP)

export const armReach = (width: number) => reticleHalfWidth(width) - ARM_INSET
export const ARM_GAP_PX = ARM_GAP

export const wordViewHeight = (fontSize: number) => fontSize * 1.25 + 2 * (TICK_LENGTH + TICK_GAP)

/** Largest font size whose reticle fits `height`. */
export const maxFontSizeForHeight = (height: number) => Math.max(0, (height - 2 * (TICK_LENGTH + TICK_GAP) - 24) / 1.25)
