export interface StarMarkProps {
    /** px. 16 in the account tile, 28 default, 40+ on empty states. */
    size?: number
    color?: string
    /** Soft accent halo. Off when the mark sits inside a bounded tile. */
    glow?: boolean
}

// Compass rose: four long cardinal rays plus four shorter diagonals at 62%
// opacity. The product's only figurative mark — used as an avatar tile, an
// empty-sky seed, and the favicon.
export function StarMark({size = 28, color = 'var(--accent-2)', glow = true}: StarMarkProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            style={{
                filter: glow
                    ? 'drop-shadow(0 0 6px color-mix(in srgb, var(--accent-2) 70%, transparent))'
                    : 'none',
                display: 'block',
            }}
        >
            <path d="M16 1l4.6 10.4 10.4 4.6-10.4 4.6-4.6 10.4-4.6-10.4-10.4-4.6 10.4-4.6z" fill={color}/>
            <path
                d="M16 5.6l3.1 7.3 7.3 3.1-7.3 3.1-3.1 7.3-3.1-7.3-7.3-3.1 7.3-3.1z"
                transform="rotate(45 16 16)"
                fill={color}
                opacity="0.62"
            />
        </svg>
    )
}
