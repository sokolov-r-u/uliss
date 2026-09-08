import type {CSSProperties} from 'react'

export interface PostBadgeProps {
    /** The note number. Rendered zero-padded to three digits — #142. */
    n: number | string
    size?: number
    color?: string
    style?: CSSProperties
}

// Zero-padded ordinal — #142. Numerals are the one place --w-strong (600) is
// allowed outside the wordmark.
export function PostBadge({n, size = 11, color = 'var(--cream)', style = {}}: PostBadgeProps) {
    return (
        <span
            style={{
                fontFamily: 'var(--font-text)',
                fontWeight: 'var(--w-strong)',
                fontSize: size,
                letterSpacing: '2.5px',
                color,
                ...style,
            }}
        >
      #{String(n).padStart(3, '0')}
    </span>
    )
}
