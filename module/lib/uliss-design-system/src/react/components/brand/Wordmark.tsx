import type {CSSProperties} from 'react'

export interface WordmarkProps {
    /** Font size in px. 26 default; 34 in the drawer; 44–64 on auth. */
    size?: number
    /** Override the fill. Prefer setting --wordmark-fill on an ancestor. */
    color?: string
    style?: CSSProperties
}

// "Uliss" in Cinzel — always a flat fill, never a gradient. --wordmark-fill
// resolves to ochre in-app and warm white on sign in.
export function Wordmark({
                             size = 26,
                             color = 'var(--wordmark-fill, var(--wordmark-app))',
                             style = {},
                         }: WordmarkProps) {
    return (
        <span
            style={{
                fontFamily: 'var(--font-display)',
                fontSize: size,
                fontWeight: 'var(--w-wordmark)',
                lineHeight: 0.9,
                letterSpacing: '0.03em',
                color,
                display: 'inline-block',
                ...style,
            }}
        >
      Uliss
    </span>
    )
}
