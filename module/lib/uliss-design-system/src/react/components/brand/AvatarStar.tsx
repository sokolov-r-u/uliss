import {useId} from 'react'
import {avatarImageBox, type CropFrame} from '../journal/posterCrop'

// A note's poster in the sky: a round avatar with a ring in the main
// constellation colour, drawn as an SVG <g> in screen space (its size never
// follows the sky's zoom). The host draws the plain star instead while the
// image loads or after it failed, and draws the name and selection rings.

/** Avatar radius in px for each sky "Poster size" (apart from the stars' size). */
export const AVATAR_RADIUS = {fine: 8, regular: 10, bold: 12, beacon: 14} as const

export type AvatarStarSize = keyof typeof AVATAR_RADIUS

export interface AvatarStarProps {
    /** Centre, in the SVG's own px. */
    x: number
    y: number
    /** `AVATAR_RADIUS[posterSize]`. */
    r: number
    /** The poster image (https), already loaded by the host. */
    src: string
    /** The avatar frame (`PosterCrop.avatar`); none shows the image's centre. */
    crop?: CropFrame | null
    /** The ring and glow colour: the main constellation's, or the sky's neutral one. */
    color: string
    /** A soft halo of r × 1.6 behind the avatar (the sky's Glow setting). */
    glow?: boolean
}

export function AvatarStar({x, y, r, src, crop, color, glow = false}: AvatarStarProps) {
    // useId may hold characters that are awkward inside url(#…)
    const clipId = `avatar-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
    const box = avatarImageBox(crop, x, y, r)
    return (
        <g>
            {glow && <circle cx={x} cy={y} r={r * 1.6} fill={color} opacity={0.14}/>}
            <clipPath id={clipId}><circle cx={x} cy={y} r={r}/></clipPath>
            <circle cx={x} cy={y} r={r} fill="var(--bg-deep)"/>
            <image href={src} x={box.x} y={box.y} width={box.width} height={box.height}
                   preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`}/>
            <circle cx={x} cy={y} r={r} fill="none" stroke={color} style={{strokeWidth: 'var(--avatar-ring-width)'}}/>
        </g>
    )
}
