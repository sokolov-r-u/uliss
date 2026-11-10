import {AVATAR_RADIUS, AvatarStar} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

const POSTER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="#1b2433"/><stop offset="1" stop-color="#c8643c"/></linearGradient></defs>'
    + '<rect width="200" height="300" fill="url(#g)"/><circle cx="140" cy="80" r="26" fill="#e8d3a8"/></svg>')

const GOLD = 'oklch(0.78 0.09 75)'

export const Sizes = () => (
    <Ground width={360} style={{background: 'var(--bg-deep)'}}>
        <svg width={320} height={60} viewBox="0 0 320 60">
            {(['fine', 'regular', 'bold', 'beacon'] as const).map((size, i) =>
                <AvatarStar key={size} x={40 + i * 80} y={30} r={AVATAR_RADIUS[size]} src={POSTER} color={GOLD} glow/>)}
        </svg>
    </Ground>
)

export const Cropped = () => (
    <Ground width={200} style={{background: 'var(--bg-deep)'}}>
        <svg width={160} height={60} viewBox="0 0 160 60">
            <AvatarStar x={40} y={30} r={14} src={POSTER} color={GOLD}/>
            <AvatarStar x={120} y={30} r={14} src={POSTER} color={GOLD} crop={{x: 0.45, y: 0.1, w: 0.5, h: 0.3333}}/>
        </svg>
    </Ground>
)
