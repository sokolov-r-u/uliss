import {TagDot} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const HueRing = () => (
    <Ground>
        <div style={{display: 'flex', gap: 14, alignItems: 'center'}}>
            {[20, 80, 140, 200, 260, 320].map((h) => <TagDot key={h} color={`oklch(0.62 0.11 ${h})`}/>)}
        </div>
    </Ground>
)

export const BranchLightness = () => (
    <Ground>
        <div style={{display: 'flex', gap: 14, alignItems: 'center'}}>
            {[0.34, 0.48, 0.62, 0.74, 0.86].map((l) => <TagDot key={l} color={`oklch(${l} 0.11 200)`}/>)}
        </div>
    </Ground>
)

export const InlineInRow = () => (
    <Ground width={320}>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--cream)'}}>
            <TagDot color="oklch(0.62 0.11 200)" size={5}/>
            <span>Travel</span>
            <span style={{marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-faint)'}}>12 notes</span>
        </div>
    </Ground>
)
