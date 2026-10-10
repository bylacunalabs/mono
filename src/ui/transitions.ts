// Opening a text grows its cover (or the continue-reading card) into the
// reader, and closing shrinks the reader back into it, with the View
// Transitions API (Chrome on Android, Safari 18+). Elsewhere, and with
// reduced motion, the reader just fades in.
//
// The element being morphed is the one named "reader": the source while the
// old state is captured, the reader itself (see .reader in the styles), and
// the book's cover again when closing. Elements that can take part carry
// data-book-id.

import { prefersReducedMotion } from './platform'

type StartViewTransition = (update: () => Promise<void>) => { finished: Promise<void> }

const NAME = 'reader'

/** Preact renders on a microtask: by the next task the DOM is up to date. */
const rendered = () => new Promise<void>(resolve => setTimeout(resolve, 0))

export const bookElement = (id: string) => document.querySelector<HTMLElement>(`[data-book-id="${CSS.escape(id)}"]`)

export function morph(update: () => void, endpoints: { from?: HTMLElement | null; to?: () => HTMLElement | null }) {
  const start = (document as { startViewTransition?: StartViewTransition }).startViewTransition?.bind(document)
  if (!start || prefersReducedMotion()) return update()
  const root = document.documentElement
  const { from, to } = endpoints
  let target: HTMLElement | null | undefined
  if (from) from.style.viewTransitionName = NAME
  root.classList.add('morphing')
  const transition = start(async () => {
    if (from) from.style.viewTransitionName = ''
    update()
    await rendered()
    target = to?.()
    if (target) target.style.viewTransitionName = NAME
  })
  transition.finished
    .catch(() => {})
    .finally(() => {
      root.classList.remove('morphing')
      if (target) target.style.viewTransitionName = ''
    })
}
