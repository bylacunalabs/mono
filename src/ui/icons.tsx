// Inline SVG icons standing in for the SF Symbols used by the iOS app.

import type { JSX } from 'preact'

type IconName =
  | 'plus' | 'books' | 'chart' | 'gear' | 'play' | 'backward' | 'forward' | 'close' | 'list'
  | 'text' | 'arrows' | 'sun' | 'flame' | 'search' | 'sort' | 'pencil' | 'trash' | 'restart'
  | 'doc' | 'clipboard' | 'check' | 'speed' | 'book' | 'ellipsis' | 'checkCircle' | 'smaller' | 'larger'

const PATHS: Record<IconName, JSX.Element> = {
  plus: <path d="M12 5v14M5 12h14" />,
  books: (
    <>
      <rect x="3.5" y="4" width="4" height="16" rx="1" />
      <rect x="9.5" y="4" width="4" height="16" rx="1" />
      <path d="m15.6 5.2 3.8-1 3.6 14.6-3.9 1z" />
    </>
  ),
  chart: <path d="M5 20V12M10 20V6M15 20v-9M20 20V4" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9" />
    </>
  ),
  play: <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />,
  backward: <path d="M11.5 6v12L3 12zM21 6v12l-8.5-6z" fill="currentColor" stroke="none" />,
  forward: <path d="M3 6v12l8.5-6zM12.5 6v12L21 12z" fill="currentColor" stroke="none" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  text: <path d="M4 6h16M4 10h12M4 14h16M4 18h10" />,
  arrows: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M3 12h18" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </>
  ),
  flame: (
    <path
      d="M12 2.5c.6 3.2 4.2 5.3 4.2 9.8a4.2 4.2 0 0 1-8.4.4c0-1.6.8-2.9 1.7-3.8.2 1.4.9 2.3 1.8 2.5-.5-3.2.2-6.1.7-8.9zM12 21.5c3.6 0 6.5-2.6 6.5-6.6 0-2-.7-3.6-1.4-4.8"
      fill="currentColor"
      stroke="none"
    />
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </>
  ),
  sort: <path d="M7 4v16M3.5 7.5 7 4l3.5 3.5M17 20V4M13.5 16.5 17 20l3.5-3.5" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  restart: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />,
  doc: <path d="M6 3h8l4 4v14H6zM14 3v4h4" />,
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5M9 11h6M9 15h6" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  speed: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l4-5" />
    </>
  ),
  book: <path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5zM12 6v13.5" />,
  ellipsis: (
    <g fill="currentColor" stroke="none">
      <circle cx="5.5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18.5" cy="12" r="1.8" />
    </g>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" />
      <path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" />
    </>
  ),
  smaller: <text x="12" y="17" font-size="11" text-anchor="middle" fill="currentColor" stroke="none" font-weight="600">A</text>,
  larger: <text x="12" y="19" font-size="19" text-anchor="middle" fill="currentColor" stroke="none" font-weight="600">A</text>,
}

export function Icon({ name, size = 22, class: className }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg
      class={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
