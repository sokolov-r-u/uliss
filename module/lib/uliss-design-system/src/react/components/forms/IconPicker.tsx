import {type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Icon} from '../icons/Icon'
import {EmojiPicker} from './EmojiPicker'

// A 48px square that shows a note's emoji (or a faint plus) next to its name field.
// It opens an `EmojiPicker` under itself (above when the room below is short);
// Escape, a click outside or a second click close it. The picker is portalled into
// the nearest `[data-popover-root]` (a dialog overlay, so its focus trap holds) or
// the page, so a card that clips its content neither cuts nor grows around it.

export interface IconPickerProps {
    /** Names the control: "Icon: 🎷", "Icon: none". */
    label: string
    value: string | null
    /** The picked emoji, or null when the user removes it. */
    onChange: (icon: string | null) => void
    /** Served by the app itself; see `EmojiPicker`. */
    dataSource: string
    disabled?: boolean
}

/** Marks the element a picker opened inside it is portalled into. */
export const POPOVER_ROOT_ATTRIBUTE = 'data-popover-root'

const GAP = 4
const EDGE = 8
// EmojiPicker's 320 × 380 box with this panel's padding and border
const PANEL_WIDTH = 338
const PANEL_HEIGHT = 398

export function IconPicker({label, value, onChange, dataSource, disabled = false}: IconPickerProps) {
    const [open, setOpen] = useState(false)
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)

    // Under the button when it fits, otherwise above it when there is more room there; kept inside the window.
    useLayoutEffect(() => {
        if (!open) return
        const place = () => {
            const rect = buttonRef.current?.getBoundingClientRect()
            if (!rect) return
            const below = window.innerHeight - rect.bottom
            const top = below < PANEL_HEIGHT + GAP + EDGE && rect.top > below
                ? Math.max(EDGE, rect.top - GAP - PANEL_HEIGHT)
                : rect.bottom + GAP
            const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - EDGE - PANEL_WIDTH))
            setPosition({top, left})
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node
            if (!wrapRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [open])

    const close = () => {
        setOpen(false)
        buttonRef.current?.focus()
    }
    const choose = (icon: string | null) => {
        onChange(icon)
        close()
    }
    // React events bubble from the portal to here
    const onKeyDown = (event: KeyboardEvent) => {
        if (!open || event.key !== 'Escape') return
        // a host dialog's focus trap skips a handled Escape and stays open
        event.preventDefault()
        close()
    }
    const root = wrapRef.current?.closest<HTMLElement>(`[${POPOVER_ROOT_ATTRIBUTE}]`) ?? document.body

    return (
        <div ref={wrapRef} onKeyDown={onKeyDown} style={{position: 'relative', flex: '0 0 auto'}}>
            <button ref={buttonRef} type="button" disabled={disabled} aria-label={`${label}: ${value ?? 'none'}`}
                    title="Choose an icon" aria-haspopup="dialog" aria-expanded={open}
                    onClick={() => setOpen((shown) => !shown)}
                    style={{
                        width: 48,
                        height: 48,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        background: 'var(--bg-panel)',
                        border: `1px solid ${open ? 'var(--accent-2)' : 'var(--line-strong)'}`,
                        color: 'var(--text-faint)',
                        fontSize: 22,
                        lineHeight: 1,
                        opacity: disabled ? 0.5 : 1,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                    }}>
                {value ?? <Icon name="plus" size={14}/>}
            </button>
            {open && createPortal(
                <div ref={panelRef} role="dialog" aria-label="Choose an icon" style={{
                    position: 'fixed',
                    top: position?.top ?? 0,
                    left: position?.left ?? 0,
                    visibility: position ? 'visible' : 'hidden',
                    // above page menus (1050), dialogs (1100) and the full-title panel of list rows (1150)
                    zIndex: 1160,
                    padding: 8,
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--line-strong)',
                    boxShadow: 'var(--shadow-modal)',
                }}>
                    <EmojiPicker dataSource={dataSource} onPick={choose}
                                 onRemove={value ? () => choose(null) : undefined}/>
                </div>,
                root,
            )}
        </div>
    )
}
