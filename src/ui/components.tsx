// Shared controls: pop-up menus, sheets and alerts styled after iOS.

import { Fragment, type ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from './icons'
import { useEscape } from './hooks'
import { useBackButton } from './history'

export interface MenuItem {
  label: string
  icon?: Parameters<typeof Icon>[0]['name']
  checked?: boolean
  destructive?: boolean
  disabled?: boolean
  divider?: boolean
  onSelect: () => void
}

/** A button that opens a small glass menu. */
export function Menu(props: {
  label: string
  items: MenuItem[]
  children: ComponentChildren
  class?: string
  align?: 'left' | 'right'
  direction?: 'down' | 'up'
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div class="menu-wrapper" ref={wrapper}>
      <button
        type="button"
        class={props.class}
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={event => {
          event.stopPropagation()
          setOpen(!open)
        }}
      >
        {props.children}
      </button>
      {open && (
        <div class={`menu glass ${props.align ?? 'right'} ${props.direction ?? 'down'}`} role="menu">
          {props.title && <div class="menu-title">{props.title}</div>}
          {props.items.map((item, index) => (
            <Fragment key={index}>
              {item.divider && <div class="menu-divider" />}
              <button
                type="button"
                role="menuitem"
                class={item.destructive ? 'menu-item destructive' : 'menu-item'}
                disabled={item.disabled}
                onClick={event => {
                  event.stopPropagation()
                  setOpen(false)
                  item.onSelect()
                }}
              >
                <span class="menu-check">{item.checked && <Icon name="check" size={16} />}</span>
                <span class="menu-label">{item.label}</span>
                {item.icon && <Icon name={item.icon} size={18} />}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

/** A bottom sheet / centred card with a scrim. */
export function Sheet(props: { onClose: () => void; children: ComponentChildren; label: string }) {
  useEscape(props.onClose)
  useBackButton(props.onClose)
  return (
    <div class="scrim" onClick={props.onClose}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.label} onClick={e => e.stopPropagation()}>
        {props.children}
      </div>
    </div>
  )
}

/** An iOS-style alert with up to two buttons. */
export function Alert(props: {
  title: string
  message?: string
  children?: ComponentChildren
  actions: { label: string; role?: 'cancel' | 'destructive' | 'default'; disabled?: boolean; onSelect: () => void }[]
  onClose: () => void
}) {
  useEscape(props.onClose)
  useBackButton(props.onClose)
  return (
    <div class="scrim center" onClick={props.onClose}>
      <div
        class="alert glass"
        role="alertdialog"
        aria-modal="true"
        aria-label={props.title}
        onClick={e => e.stopPropagation()}
      >
        <div class="alert-body">
          <h2>{props.title}</h2>
          {props.message && <p>{props.message}</p>}
          {props.children}
        </div>
        <div class={props.actions.length > 2 ? 'alert-actions vertical' : 'alert-actions'}>
          {props.actions.map(action => (
            <button
              type="button"
              class={`alert-button ${action.role ?? 'default'}`}
              disabled={action.disabled}
              onClick={() => {
                action.onSelect()
                props.onClose()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Toggle(props: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      class={props.checked ? 'toggle on' : 'toggle'}
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="toggle-knob" />
    </button>
  )
}

export function ProgressBar({ progress, track }: { progress: number; track?: string }) {
  return (
    <div class="progress" style={{ background: track }}>
      <div class="progress-fill" style={{ width: `max(4px, ${progress * 100}%)` }} />
    </div>
  )
}

export const formatNumber = (n: number) => n.toLocaleString('en-US')
export const formatPercent = (p: number) => `${Math.round(p * 100)}%`
