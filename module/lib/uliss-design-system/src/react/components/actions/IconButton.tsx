import type {ReactNode} from 'react'

// A bare 30×30 hit target for a single glyph. No border at rest; the glyph
// itself brightens on hover.
export interface IconButtonProps {
    children?: ReactNode
    /** Box size in px. 30 default, 44 for phone touch targets. */
    s?: number
    title?: string
    color?: string
    onClick?: () => void
}

export function IconButton({children, onClick, s = 30, title, color = 'var(--cream-dim)'}: IconButtonProps) {
    return (
        <button
            title={title}
            onClick={onClick}
            style={{
                width: s,
                height: s,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                color,
                cursor: 'pointer',
                padding: 0,
                transition: 'color var(--dur-hover) var(--ease)',
            }}
        >
            {children}
        </button>
    )
}
