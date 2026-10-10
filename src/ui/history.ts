// The Back button / gesture closes what's on top (reader, sheet, alert)
// instead of leaving the app: each open layer pushes a history entry, Back
// pops it and closes the layer, and a layer closed any other way removes its
// entry again.

import { useLayoutEffect, useRef } from 'preact/hooks'

interface Layer {
  close: () => void
  popped: boolean
}

const layers: Layer[] = []
/** history.back() calls of our own whose popstate must be ignored. */
let ownBacks = 0

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ownBacks > 0) {
      ownBacks--
      return
    }
    const top = layers.pop()
    if (!top) return
    top.popped = true
    top.close()
  })
}

/** While mounted, Back calls `onClose`. */
export function useBackButton(onClose: () => void) {
  const latest = useRef(onClose)
  latest.current = onClose
  // Layout effect: the entry exists as soon as the layer is on screen.
  useLayoutEffect(() => {
    const layer: Layer = { close: () => latest.current(), popped: false }
    layers.push(layer)
    history.pushState({ monoLayer: layers.length }, '')
    return () => {
      if (layer.popped) return
      const index = layers.indexOf(layer)
      if (index >= 0) layers.splice(index, 1)
      ownBacks++
      history.back()
    }
  }, [])
}
