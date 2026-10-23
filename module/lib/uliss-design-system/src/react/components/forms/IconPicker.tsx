import {type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Icon} from '../icons/Icon'
import {IconButton} from '../actions/IconButton'
import {EMOJI_PICKER_HEIGHT, EmojiPicker} from './EmojiPicker'

// A 48px square that shows a note's emoji (or a faint plus) next to its name field.
// It opens an `EmojiPicker` under itself (above when the room below is short);
// Escape, a click outside or a second click close it. The picker is portalled into
// the nearest `[data-popover-root]` (a dialog overlay, so its focus trap holds) or
// the page, so a card that clips its content neither cuts nor grows around it.
// With `cover` it lies over that root instead (a dialog's card), titled, so one
// card stands in for the other until the pick.

export interface IconPickerProps {
    /** Names the control: "Icon: 🎷", "Icon: none". */
    label: string
    value: string | null
    /** The picked emoji, or null when the user removes it. */
    onChange: (icon: string | null) => void
    /** Served by the app itself; see `EmojiPicker`. */
    dataSource: string
    disabled?: boolean
    /**
     * Lies over the nearest `[data-popover-root]` (a dialog's card), in its place and size, with its own title and
     * close button, instead of hanging under the square. Without a root it falls back to the dropdown.
     */
    cover?: boolean
}

/** Marks the element a picker opened inside it is portalled into. */
export const POPOVER_ROOT_ATTRIBUTE = 'data-popover-root'

const GAP = 4
const EDGE = 8
// One panel in both places: padding, border and the title row around EmojiPicker's own box
const PANEL_PADDING = {top: 18, side: 20, bottom: 20}
const TITLE_HEIGHT = 40
const PANEL_WIDTH = 380
const PANEL_HEIGHT = PANEL_PADDING.top + TITLE_HEIGHT + EMOJI_PICKER_HEIGHT + PANEL_PADDING.bottom + 2

export function IconPicker({label, value, onChange, dataSource, disabled = false, cover = false}: IconPickerProps) {
    const [open, setOpen] = useState(false)
    const [position, setPosition] = useState<{ top: number; left: number; width: number; height: number } | null>(
        null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)

    // Under the button when it fits, otherwise above it when there is more room there; always inside the window,
    // over the button itself when neither side has the room.
    useLayoutEffect(() => {
        if (!open) return
        const place = () => {
            const root = popoverRoot()
            if (cover && root) {
                const card = root.getBoundingClientRect()
                setPosition({top: card.top, left: card.left, width: card.width, height: card.height})
                return
            }
            const rect = buttonRef.current?.getBoundingClientRect()
            if (!rect) return
            const below = window.innerHeight - rect.bottom
            const preferred = below < PANEL_HEIGHT + GAP + EDGE && rect.top > below
                ? rect.top - GAP - PANEL_HEIGHT
                : rect.bottom + GAP
            const top = Math.max(EDGE, Math.min(preferred, window.innerHeight - EDGE - PANEL_HEIGHT))
            const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - EDGE - PANEL_WIDTH))
            setPosition({top, left, width: Math.min(PANEL_WIDTH, window.innerWidth - 2 * EDGE), height: PANEL_HEIGHT})
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
        }
    }, [open, cover])

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
    function popoverRoot(): HTMLElement | null {
        return wrapRef.current?.closest<HTMLElement>(`[${POPOVER_ROOT_ATTRIBUTE}]`) ?? null
    }

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
                    width: position?.width,
                    height: position?.height,
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    visibility: position ? 'visible' : 'hidden',
                    // above page menus (1050), dialogs (1100) and the full-title panel of list rows (1150)
                    zIndex: 1160,
                    padding: `${PANEL_PADDING.top}px ${PANEL_PADDING.side}px ${PANEL_PADDING.bottom}px`,
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--line-strong)',
                    boxShadow: 'var(--shadow-modal)',
                }}>
                    <div style={{display: 'flex', alignItems: 'center', height: TITLE_HEIGHT, flex: '0 0 auto'}}>
                        <span style={{
                            flex: 1,
                            fontFamily: 'var(--heading-font)',
                            fontSize: 20,
                            color: 'var(--heading-color)',
                        }}>Choose an icon</span>
                        <IconButton title="Close the picker" s={30} onClick={close}>
                            <Icon name="close" size={13}/>
                        </IconButton>
                    </div>
                    <div style={{flex: 1, minHeight: 0, display: 'flex'}}>
                        <EmojiPicker dataSource={dataSource} onPick={choose} fill
                                     onRemove={value ? () => choose(null) : undefined}/>
                    </div>
                </div>,
                popoverRoot() ?? document.body,
            )}
        </div>
    )
}
