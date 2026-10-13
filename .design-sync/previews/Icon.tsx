import {Icon, ICON_NAMES} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const AllGlyphs = () => (
    <Ground width={460}>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 14}}>
            {ICON_NAMES.map((name) => (
                <div key={name} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
                    <span style={{color: 'var(--cream-dim)', display: 'flex'}}><Icon name={name} size={18}/></span>
                    <span style={{fontSize: 9, color: 'var(--text-faint)'}}>{name}</span>
                </div>
            ))}
        </div>
    </Ground>
)

export const ColourFromParent = () => (
    <Ground>
        <div style={{display: 'flex', gap: 18, alignItems: 'center'}}>
            <span style={{color: 'var(--accent-2)', display: 'flex'}}><Icon name="star" size={15}/></span>
            <span style={{color: 'var(--text-muted)', display: 'flex'}}><Icon name="star" size={15}/></span>
            <span style={{color: 'var(--cream-dim)', display: 'flex'}}><Icon name="star" size={15}/></span>
        </div>
    </Ground>
)

export const RotationAndFill = () => (
    <Ground>
        <div style={{display: 'flex', gap: 18, alignItems: 'center', color: 'var(--cream-dim)'}}>
            <Icon name="chevron" size={16}/>
            <Icon name="chevron" size={16} rotate={-90}/>
            <Icon name="chevron" size={16} rotate={180}/>
            <Icon name="mic" size={16}/>
            <Icon name="mic" size={16} fill/>
        </div>
    </Ground>
)
