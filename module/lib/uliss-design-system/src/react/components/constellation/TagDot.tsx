// A constellation's colour, as a 7px square with a faint halo of itself. Square,
// not round — the stars in the sky are round, the metadata in the UI is not.
// Hue belongs to the root branch; sub-levels inherit the hue and vary only
// lightness, so a family always reads as one colour at different depths.

export interface TagDotProps {
    /** Resolved colour for this branch at its depth (hue + lightness). */
    color: string
    size?: number
}

export function TagDot({color, size = 7}: TagDotProps) {
    return (
        <span
            style={{
                width: size,
                height: size,
                flex: `0 0 ${size}px`,
                background: color,
                boxShadow: `0 0 7px color-mix(in srgb, ${color} 40%, transparent)`,
            }}
        />
    )
}
