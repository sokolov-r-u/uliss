/**
 * Full-screen backdrop that dims + blurs the app behind it and centers a Notice.
 * Mirrors the dimmed-blurred scenes in Claude Design `uliss-notify.jsx`, but sits over the
 * real app (via a portal) instead of a demo screen. `backdrop-filter` blurs whatever is behind.
 */
import {POPOVER_ROOT_ATTRIBUTE, useFocusTrap} from '@uliss/design-system'
import {type ReactNode, useRef} from 'react'
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

    useFocusTrap(contentRef, {onEscape: blocking ? undefined : onBackdropClick})

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
            {/* a picker opened in the card is portalled here: inside the focus trap, not clipped by the card */}
            <div ref={contentRef} {...{[POPOVER_ROOT_ATTRIBUTE]: ''}} style={{position: 'relative', display: 'flex'}}>
                {children}
            </div>
        </div>,
        document.body,
    )
}
