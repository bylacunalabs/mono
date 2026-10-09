// A tiny observable-store helper and the Preact hook that re-renders on change.

import { useEffect, useReducer } from 'preact/hooks'

export interface Observable {
  subscribe(listener: () => void): () => void
}

export class Store implements Observable {
  private listeners = new Set<() => void>()

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  protected emit() {
    for (const listener of this.listeners) listener()
  }
}

/** Re-renders the component whenever `store` emits. */
export function useObserve(store: Observable | undefined) {
  const [, rerender] = useReducer((n: number, _: unknown) => n + 1, 0)
  useEffect(() => store?.subscribe(() => rerender(undefined)), [store])
}
