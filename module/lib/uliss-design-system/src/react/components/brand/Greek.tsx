import type {CSSProperties, ReactNode} from 'react'

export interface GreekProps {
    children?: ReactNode
    size?: number
    style?: CSSProperties
}

// A muted Greek gloss beside a field label — decorative, never load-bearing.
// The only italic in the product, and the only place --terracotta-deep appears
// as text. Ornament only: never translated, never read aloud.
export function Greek({children, size = 12, style = {}}: GreekProps) {
    return (
        <span
            style={{
                fontFamily: 'var(--font-text)',
                fontStyle: 'italic',
                fontSize: size,
                color: 'var(--terracotta-deep)',
                letterSpacing: '0.5px',
                opacity: 0.9,
                ...style,
            }}
        >
      {children}
    </span>
    )
}
