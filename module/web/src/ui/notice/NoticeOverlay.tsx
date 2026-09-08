/**
 * Full-screen backdrop that dims + blurs the app behind it and centers a Notice.
 * Mirrors the dimmed-blurred scenes in Claude Design `uliss-notify.jsx`, but sits over the
 * real app (via a portal) instead of a demo screen. `backdrop-filter` blurs whatever is behind.
 */
import {type ReactNode, useEffect, useRef} from 'react'
import {createPortal} from 'react-dom'

export function NoticeOverlay({
                                  blocking = false,
                                  onBackdropClick,
                                  children,
                              }: {
    blocking?: boolean
    onBackdropClick?: () => void
    children: ReactNode
}) {
    const contentRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const focusable = () => Array.from(contentRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') ?? [])
        requestAnimationFrame(() => {
            const autoFocus = contentRef.current?.querySelector<HTMLElement>('[autofocus]')
            ;(autoFocus ?? focusable()[0])?.focus()
        })
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (!blocking && onBackdropClick) {
                    event.preventDefault()
                    onBackdropClick()
                }
                return
            }
            if (event.key !== 'Tab') return
            const items = focusable()
            if (items.length === 0) {
                event.preventDefault()
                return
            }
            const first = items[0]
            const last = items[items.length - 1]
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            previous?.focus()
        }
    }, [blocking, onBackdropClick])

    return createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                background: 'var(--scrim)',
                backdropFilter: 'blur(4px) brightness(.62) saturate(.9)',
                WebkitBackdropFilter: 'blur(4px) brightness(.62) saturate(.9)',
            }}
        >
            {!blocking && onBackdropClick &&
                <button type="button" tabIndex={-1} aria-hidden="true" onClick={onBackdropClick} style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    cursor: 'default'
                }}/>}
            <div ref={contentRef} style={{position: 'relative', display: 'flex'}}>
                {children}
            </div>
        </div>,
        document.body,
    )
}
