import {type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Icon} from '../icons/Icon'

// One line per note or chat: unread dot · serif title · meta · date · menu.
// No cards, no thumbnails, no two-line previews, no relative time — the list is
// a dense table of contents, and the density is the point. `dim` greys read
// rows so unread ones surface without a badge.

const LONG_PRESS_MS = 480
const LONG_PRESS_TOLERANCE = 8
const FULL_TITLE_DELAY_MS = 350
const FULL_TITLE_GAP = 4
const VIEWPORT_EDGE = 8

// Wide rows (tablet/desktop lists): larger title, taller row, hairline between rows. A consumer can switch to them
// at a CSS breakpoint by setting these custom properties on the list; `size="wide"` pins them on the row.
const WIDE_VARS = {
    '--list-row-title-size': '17px',
    '--list-row-title-weight': 'var(--w-ui)',
    '--list-row-height': '52px',
    '--list-row-rule': 'var(--line)',
} as CSSProperties

export interface ListRowProps {
    title: string
    /** `<><Icon name="star" size={12}/>4</>` for a note's links, `noteDoc` for a chat's notes. */
    meta?: ReactNode
    /** Absolute and short — 'Jun 22'. Never relative. */
    date?: string
    unread?: boolean
    /** Read rows render --cream-dim. */
    dim?: boolean
    dots?: boolean
    onClick?: () => void
    /** Opens the row menu with its anchor: the dots button, or the row after a touch long-press. */
    onMenu?: (anchor: HTMLElement) => void
    menuLabel?: string
    /** `wide` pins the tablet/desktop row; `compact` (default) follows the `--list-row-*` properties. */
    size?: 'compact' | 'wide'
    /** The first row of a list draws no rule above itself. */
    first?: boolean
}

export function ListRow({
                            title,
                            meta,
                            date,
                            unread = false,
                            dim = false,
                            dots = true,
                            onClick,
                            onMenu,
                            menuLabel,
                            size = 'compact',
                            first = false,
                        }: ListRowProps) {
    const pressRef = useRef<{ timer: number; x: number; y: number } | null>(null)
    // A truncated title shows whole in a panel under the row after a short hover.
    const titleRef = useRef<HTMLSpanElement>(null)
    const rowRef = useRef<HTMLDivElement>(null)
    const tipRef = useRef<HTMLDivElement>(null)
    const hoverTimerRef = useRef<number | null>(null)
    const [fullTitle, setFullTitle] = useState(false)
    const [tipPosition, setTipPosition] = useState<{ top: number; left: number; width: number } | null>(null)
    const hideFullTitle = () => {
        if (hoverTimerRef.current != null) window.clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
        setFullTitle(false)
        setTipPosition(null)
    }
    // Under the row when it fits in the viewport, otherwise above it; portalled so no scroll box clips it.
    useLayoutEffect(() => {
        if (!fullTitle || !rowRef.current) return
        const rect = rowRef.current.getBoundingClientRect()
        const height = tipRef.current?.offsetHeight ?? 0
        const below = rect.bottom - FULL_TITLE_GAP
        const top = below + height > window.innerHeight - VIEWPORT_EDGE
            ? Math.max(VIEWPORT_EDGE, rect.top - FULL_TITLE_GAP - height)
            : below
        setTipPosition({top, left: rect.left + 8, width: Math.max(0, rect.width - 8)})
    }, [fullTitle])
    useEffect(() => {
        if (!fullTitle) return
        window.addEventListener('scroll', hideFullTitle, true)
        return () => window.removeEventListener('scroll', hideFullTitle, true)
    }, [fullTitle])
    const hoverHandlers = {
        onMouseEnter: () => {
            hideFullTitle()
            hoverTimerRef.current = window.setTimeout(() => {
                const el = titleRef.current
                if (el && el.scrollWidth > el.clientWidth) setFullTitle(true)
            }, FULL_TITLE_DELAY_MS)
        },
        onMouseLeave: hideFullTitle,
    }
    useEffect(() => () => {
        if (hoverTimerRef.current != null) window.clearTimeout(hoverTimerRef.current)
    }, [])
    const longPressedRef = useRef(false)
    const cancelPress = () => {
        if (pressRef.current) window.clearTimeout(pressRef.current.timer)
        pressRef.current = null
    }
    useEffect(() => cancelPress, [])
    const pressHandlers = onMenu ? {
        onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
            if (event.pointerType !== 'touch') return
            longPressedRef.current = false
            cancelPress()
            const row = event.currentTarget
            pressRef.current = {
                x: event.clientX,
                y: event.clientY,
                timer: window.setTimeout(() => {
                    pressRef.current = null
                    longPressedRef.current = true
                    onMenu(row)
                }, LONG_PRESS_MS),
            }
        },
        onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
            const press = pressRef.current
            if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_TOLERANCE) {
                cancelPress()
            }
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onPointerLeave: cancelPress,
        // The click that ends a long-press must not also open the row.
        onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
            if (!longPressedRef.current) return
            longPressedRef.current = false
            event.preventDefault()
            event.stopPropagation()
        },
    } : {}
    const content = (
        <>
            <span style={{width: 5, height: 5, flex: '0 0 5px', background: unread ? 'var(--accent)' : 'transparent'}}/>
            <span ref={titleRef} style={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--list-row-title-size, 14px)',
                fontWeight: 'var(--list-row-title-weight, var(--w-body))',
                color: dim ? 'var(--cream-dim)' : 'var(--cream)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }}>{title}</span>
            <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--text-faint)',
                fontFamily: 'var(--font-text)',
                fontSize: 10.5,
                flex: '0 0 auto'
            }}>{meta}</span>
            <span style={{
                fontFamily: 'var(--font-text)',
                fontSize: 10.5,
                letterSpacing: '0.5px',
                color: 'var(--text-faint)',
                width: 44,
                textAlign: 'right',
                flex: '0 0 44px'
            }}>{date}</span>
        </>
    )
    return (
        <div
            ref={rowRef}
            {...pressHandlers}
            style={{
                ...(size === 'wide' ? WIDE_VARS : {}),
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                minHeight: 34,
                borderTop: first ? 'none' : '1px solid var(--list-row-rule, transparent)',
                ...(onMenu ? {userSelect: 'none', WebkitTouchCallout: 'none'} : {}),
            }}
        >
            {onClick ? (
                <button type="button" onClick={onClick} {...hoverHandlers} style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 'var(--list-row-height, 44px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '5px 0',
                    background: 'transparent',
                    border: 0,
                    textAlign: 'left',
                    cursor: 'pointer'
                }}>
                    {content}
                </button>
            ) : (
                <div style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 'var(--list-row-height, 44px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '5px 0'
                }}>{content}</div>
            )}
            {dots && (
                <button
                    type="button"
                    aria-label={menuLabel ?? `Actions for ${title}`}
                    title={menuLabel ?? 'Rename · Delete'}
                    onClick={(event) => onMenu?.(event.currentTarget)}
                    onPointerDown={(event) => event.stopPropagation()}
                    style={{
                        flex: '0 0 44px',
                        width: 44,
                        minHeight: 44,
                        marginRight: -14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 0,
                        color: 'var(--text-faint)',
                        cursor: 'pointer',
                    }}
                >
          <Icon name="dots" size={16}/>
                </button>
            )}
            {fullTitle && createPortal(
                <div ref={tipRef} role="tooltip" style={{
                    position: 'fixed',
                    top: tipPosition?.top ?? 0,
                    left: tipPosition?.left ?? 0,
                    width: tipPosition?.width,
                    visibility: tipPosition ? 'visible' : 'hidden',
                    // Above menus (1050) and dialogs (1100): a row may sit inside either.
                    zIndex: 1150,
                    padding: '9px 12px',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--line-strong)',
                    boxShadow: 'var(--shadow-modal)',
                    fontFamily: 'var(--font-text)',
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: 'var(--cream)',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    pointerEvents: 'none',
                }}>{title}</div>,
                document.body,
            )}
        </div>
    )
}
