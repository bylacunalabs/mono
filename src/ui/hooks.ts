import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

/** A ref and the live width of the element it's attached to. */
export function useWidth<T extends HTMLElement>(): [{ current: T | null }, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.clientWidth)
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/** Live size of an element. */
export function useSize<T extends HTMLElement>(): [{ current: T | null }, { width: number; height: number }] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}

/** Calls `handler` on Escape while mounted. */
export function useEscape(handler: () => void) {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // Handled: whatever is underneath (e.g. the reader) stays open.
      event.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
