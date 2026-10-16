// The one "not yet" line. Whatever Uliss is still doing — thinking over a
// reply, searching the notes, computing links — reads the same: a 5px accent
// dot and a lowercase label pulsing together on the shared 1.9s cycle
// (`.u-pending`, tokens/motion.css, silenced under prefers-reduced-motion).
// Only the words change. It is a live status region, so a changed label is
// announced.

export interface PendingStatusProps {
    /** Lowercase, with an ellipsis: 'thinking…', 'searching notes…'. */
    label: string
    size?: number
    pad?: string
    minHeight?: number
}

export function PendingStatus({label, size = 10.5, pad = '11px 0', minHeight = 44}: PendingStatusProps) {
    return (
        <div role="status" style={{display: 'flex', alignItems: 'center', gap: 9, minHeight, padding: pad}}>
            <span
                className="u-pending"
                aria-hidden
                style={{
                    width: 5,
                    height: 5,
                    flex: '0 0 5px',
                    background: 'var(--accent)',
                    boxShadow: '0 0 8px var(--accent-glow)',
                }}
            />
            <span
                className="u-pending"
                style={{
                    fontFamily: 'var(--font-text)',
                    fontSize: size,
                    letterSpacing: '1.4px',
                    color: 'var(--text-muted)',
                }}
            >
                {label}
            </span>
        </div>
    )
}
