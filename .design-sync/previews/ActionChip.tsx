import {ActionChip} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Offers = () => (
    <Ground>
        <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
            <ActionChip label="Summarize" icon="summary"/>
            <ActionChip label="Update" icon="summary"/>
            <ActionChip label="Link notes" icon="node"/>
        </div>
    </Ground>
)

export const AboveChatDock = () => (
    <Ground width={360}>
        <div style={{display: 'flex', justifyContent: 'center'}}>
            <ActionChip label="Summarize" icon="summary"/>
        </div>
    </Ground>
)

export const Disabled = () => (
    <Ground>
        <ActionChip label="Summarize" icon="summary" disabled/>
    </Ground>
)
