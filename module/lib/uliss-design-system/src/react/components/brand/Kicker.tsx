import type {CSSProperties, ReactNode} from 'react'

export interface KickerProps {
    children?: ReactNode
    /** px, clamped to ≥10. 8.5–9 for the quietest meta, 10–10.5 default, 12 for nav. */
    size?: number
    /** Letter-spacing. Scales inversely with size: 2px at 12px, 4px at 10px. */
    spacing?: string
    /** --accent for an active section label, --text-faint for quiet meta. */
    color?: string
    style?: CSSProperties
}

// The all-caps label. Uliss's single most-used piece of chrome: section labels,
// counts, button text, meta. Uppercase + wide tracking is what makes text read
// as UI rather than as content, now that one serif carries both.
export function Kicker({
                           children,
                           size = 10.5,
                           spacing = '4px',
                           color = 'var(--cream-dim)',
                           style = {},
                       }: KickerProps) {
    return (
        <span
            style={{
                fontFamily: 'var(--font-text)',
                fontWeight: 'var(--w-emphasis)',
                fontSize: Math.max(size, 10),
                letterSpacing: spacing,
                textTransform: 'uppercase',
                color,
                display: 'inline-block',
                ...style,
            }}
        >
      {children}
    </span>
    )
}
