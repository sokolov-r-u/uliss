import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'

// Rename · Delete for one chat or note. Anchored to its trigger on every
// breakpoint — the phone gets the same dropdown, never a bottom sheet.
// The destructive item is --terracotta text; there is no red anywhere.

export interface ItemMenuAction {
    label: string
    onSelect: () => void
    danger?: boolean
    disabled?: boolean
}

export interface ItemMenuProps {
    /** The dots button or the long-pressed row the menu hangs from. */
    anchor: HTMLElement
    actions: ItemMenuAction[]
    /** Accessible name of the menu. */
    label: string
    /** Optional object title above the actions. */
    title?: string
    onClose: () => void
}

const WIDTH = 196
const GAP = 4
const EDGE = 8

export function ItemMenu({anchor, actions, label, title, onClose}: ItemMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null)
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
    // Latest onClose without re-running the focus effect: a re-render must not move focus.
    const onCloseRef = useRef(onClose)
    useLayoutEffect(() => {
        onCloseRef.current = onClose
    })

    useLayoutEffect(() => {
        const rect = anchor.getBoundingClientRect()
        const height = menuRef.current?.offsetHeight ?? 0
        const below = rect.bottom + GAP
        const top = below + height > window.innerHeight - EDGE ? Math.max(EDGE, rect.top - GAP - height) : below
        const left = Math.min(Math.max(EDGE, rect.right - WIDTH), window.innerWidth - WIDTH - EDGE)
        setPosition({top, left})
    }, [anchor])

    useEffect(() => {
        const items = () => Array.from(
            menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
        )
        items()[0]?.focus()
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                onCloseRef.current()
                return
            }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            const list = items()
            if (list.length === 0) return
            const index = list.findIndex((item) => item === document.activeElement)
            const step = event.key === 'ArrowDown' ? 1 : -1
            list[(index + step + list.length) % list.length]?.focus()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            if (anchor.isConnected) anchor.focus()
        }
    }, [anchor])

    return createPortal(
        <>
            <button type="button" tabIndex={-1} aria-hidden="true" onClick={onClose} style={{
                position: 'fixed', inset: 0, zIndex: 1050, padding: 0, border: 0,
                background: 'transparent', cursor: 'default',
            }}/>
            <div ref={menuRef} role="menu" aria-label={label} style={{
                position: 'fixed',
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                visibility: position ? 'visible' : 'hidden',
                width: WIDTH,
                zIndex: 1051,
                background: 'var(--bg-panel)',
                border: '1px solid var(--line-strong)',
                boxShadow: 'var(--shadow-modal)',
            }}>
                {title && <div style={{
                    padding: '11px 16px 10px', borderBottom: '1px solid var(--line)',
                    fontFamily: 'var(--font-text)', fontSize: 13, color: 'var(--cream-dim)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{title}</div>}
                {actions.map((action) => (
                    <button key={action.label} type="button" role="menuitem" disabled={action.disabled}
                            onClick={action.onSelect} style={{
                        display: 'flex', alignItems: 'center', width: '100%', minHeight: 48, padding: '0 16px',
                        background: 'transparent', border: 0,
                        borderTop: action.danger ? '1px solid var(--line)' : 0,
                        cursor: action.disabled ? 'default' : 'pointer', opacity: action.disabled ? 0.4 : 1,
                        fontFamily: 'var(--font-text)', fontSize: 10.5, letterSpacing: '2px',
                        textTransform: 'uppercase', textAlign: 'left',
                        color: action.danger ? 'var(--terracotta)' : 'var(--cream)',
                    }}>{action.label}</button>
                ))}
            </div>
        </>,
        document.body,
    )
}
