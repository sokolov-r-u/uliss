import {Icon, IconButton} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Chrome = () => (
    <Ground>
        <div style={{display: 'flex', gap: 8, alignItems: 'center', color: 'var(--cream-dim)'}}>
            <IconButton title="Menu"><Icon name="menu" size={17}/></IconButton>
            <IconButton title="Search"><Icon name="search" size={17}/></IconButton>
            <IconButton title="Sort"><Icon name="sort" size={17}/></IconButton>
            <IconButton title="Close"><Icon name="close" size={17}/></IconButton>
        </div>
    </Ground>
)

export const PhoneTouchTarget = () => (
    <Ground>
        <div style={{display: 'flex', gap: 8, alignItems: 'center', color: 'var(--cream-dim)'}}>
            <IconButton s={44} title="Linked notes"><Icon name="panelRight" size={17}/></IconButton>
            <IconButton s={44} title="Settings"><Icon name="gear" size={17}/></IconButton>
        </div>
    </Ground>
)

export const Accent = () => (
    <Ground>
        <IconButton title="New note" color="var(--accent-2)"><Icon name="plus" size={17}/></IconButton>
    </Ground>
)
