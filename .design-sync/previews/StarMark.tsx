import {StarMark} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Sizes = () => (
    <Ground>
        <div style={{display: 'flex', gap: 32, alignItems: 'center', padding: 12}}>
            <StarMark size={28}/>
            <StarMark size={44}/>
            <StarMark size={64}/>
        </div>
    </Ground>
)

export const InAccountTile = () => (
    <Ground>
        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
            <div style={{
                width: 30, height: 30, background: 'var(--bg-muted)', border: '1px solid var(--line-chip)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <StarMark size={16} glow={false}/>
            </div>
            <span style={{fontSize: 13, color: 'var(--cream-dim)'}}>Penelope</span>
        </div>
    </Ground>
)
