/**
 * Full-screen backdrop that dims + blurs the app behind it and centers a Notice.
 * Mirrors the dimmed-blurred scenes in Claude Design `uliss-notify.jsx`, but sits over the
 * real app (via a portal) instead of a demo screen. `backdrop-filter` blurs whatever is behind.
 */
import {type ReactNode} from 'react'
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
    return createPortal(
        <div
            onClick={blocking ? undefined : onBackdropClick}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                background: 'rgba(8,5,3,.55)',
                backdropFilter: 'blur(4px) brightness(.62) saturate(.9)',
                WebkitBackdropFilter: 'blur(4px) brightness(.62) saturate(.9)',
                animation: 'uNoticeBackdropIn .35s ease both',
            }}
        >
            {/* Stop clicks inside the card from bubbling to the backdrop dismiss. */}
            <div onClick={(e) => e.stopPropagation()} style={{display: 'flex'}}>
                {children}
            </div>
        </div>,
        document.body,
    )
}
