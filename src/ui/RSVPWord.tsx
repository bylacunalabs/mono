// Renders a single word with its Optimal Recognition Point (ORP) letter
// pinned to the exact horizontal centre, set apart as chosen in Settings
// (red, subtle, or not at all). Prefix, ORP letter and suffix are measured
// with the chosen typeface, so the ORP glyph's centre lands on the
// centreline with proportional fonts as well as monospaced ones.
//
// The guide marks form a reticle: ticks above and below the ORP column that
// run in from the top and bottom and stop just short of the focus letter's
// own ink (so they reach lower over an "o" than over an "l"), and arms on
// the word's centreline that run in from the reticle's edges and stop just
// short of the word's first and last letter.

import { orpParts } from '../core/orp'
import { settings } from '../state/settings'
import { useObserve } from '../state/store'
import {
  ARM_GAP_PX, armReach, availableHalfWidth, cssFont, glyphBounds, textWidth, TICK_CLEARANCE, TICK_GAP, TICK_LENGTH,
  TICK_MIN_CLEARANCE, wordViewHeight, type ReadingFont,
} from './fonts'
import { useWidth } from './hooks'

interface Props {
  word: string
  font: ReadingFont
  fontSize: number
}

export function RSVPWord({ word, font, fontSize }: Props) {
  useObserve(settings)
  const { orpHighlight: highlight, boldWord: bold } = settings.value
  const [ref, width] = useWidth<HTMLDivElement>()

  const parts = orpParts(word)
  const prefixWidth = textWidth(parts.prefix, font, fontSize, bold)
  const orpWidth = textWidth(parts.orp, font, fontSize, bold)
  const suffixWidth = textWidth(parts.suffix, font, fontSize, bold)

  // Shrink only a word that still overflows (e.g. in previews).
  const available = availableHalfWidth(width)
  const needed = Math.max(prefixWidth + orpWidth / 2, orpWidth / 2 + suffixWidth)
  const scale = width > 0 && needed > available && needed > 0 ? available / needed : 1

  const leftEdge = (prefixWidth + orpWidth / 2) * scale
  const rightEdge = (orpWidth / 2 + suffixWidth) * scale
  const reach = armReach(width)
  const leftArm = Math.max(0, reach - leftEdge - ARM_GAP_PX)
  const rightArm = Math.max(0, reach - rightEdge - ARM_GAP_PX)
  const height = wordViewHeight(fontSize)

  // The word's line box, and the focus letter's ink within it.
  const lineHeight = fontSize * 1.25
  const wordTop = TICK_LENGTH + TICK_GAP
  const shownSize = fontSize * scale
  const ink = glyphBounds(parts.orp, font, bold, lineHeight / shownSize)
  const clearance = Math.max(TICK_MIN_CLEARANCE, TICK_CLEARANCE * shownSize)
  const topTick = Math.max(TICK_LENGTH, wordTop + ink.top * shownSize - clearance)
  const bottomTick = Math.max(TICK_LENGTH, height - (wordTop + ink.bottom * shownSize + clearance))

  const sideOpacity = highlight === 'red' ? 0.8 : highlight === 'subtle' ? 0.62 : 1

  return (
    <div ref={ref} class="rsvp" style={{ height }} role="img" aria-label={word}>
      {highlight === 'red' && (
        <div
          class="rsvp-halo"
          style={{ width: fontSize * 2.8, height: fontSize * 2.8, marginLeft: -fontSize * 1.4, marginTop: -fontSize * 1.4 }}
        />
      )}
      <div class="rsvp-tick" style={{ top: 0, height: topTick }} />
      <div class="rsvp-tick" style={{ bottom: 0, height: bottomTick }} />
      {width > 0 && (
        <>
          <div class="rsvp-arm" style={{ left: `calc(50% - ${reach}px)`, width: leftArm }} />
          <div class="rsvp-arm" style={{ left: `calc(50% + ${reach - rightArm}px)`, width: rightArm }} />
          <div
            class="rsvp-word"
            style={{ font: cssFont(font, fontSize * scale, bold), left: `calc(50% - ${leftEdge}px)`, top: wordTop, height: lineHeight, lineHeight: `${lineHeight}px` }}
          >
            <span style={{ opacity: sideOpacity }}>{parts.prefix}</span>
            <span class={highlight === 'red' ? 'rsvp-orp red' : 'rsvp-orp'}>{parts.orp}</span>
            <span style={{ opacity: sideOpacity }}>{parts.suffix}</span>
          </div>
        </>
      )}
    </div>
  )
}
