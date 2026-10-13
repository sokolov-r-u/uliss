import {PostBadge} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Ordinals = () => (
    <Ground>
        <div style={{display: 'flex', gap: 20, alignItems: 'baseline'}}>
            <PostBadge n={142}/>
            <PostBadge n={7} size={13}/>
            <PostBadge n={38}/>
        </div>
    </Ground>
)

export const InNoteHeader = () => (
    <Ground width={340}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
            <PostBadge n={142}/>
            <span style={{fontSize: 18, color: 'var(--cream)'}}>The empty room</span>
        </div>
    </Ground>
)

export const Accent = () => (
    <Ground>
        <PostBadge n={142} size={15} color="var(--accent-2)"/>
    </Ground>
)
