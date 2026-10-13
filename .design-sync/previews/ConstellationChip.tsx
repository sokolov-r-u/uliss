import {ConstellationChip} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

const TRAVEL = 'oklch(0.62 0.11 200)'
const READING = 'oklch(0.62 0.11 300)'
const FAMILY = 'oklch(0.62 0.11 140)'

export const Memberships = () => (
    <Ground width={360}>
        <div style={{display: 'flex', gap: 14, flexWrap: 'wrap'}}>
            <ConstellationChip label="Travel" color={TRAVEL} onClick={() => undefined}/>
            <ConstellationChip label="Reading" color={READING} onClick={() => undefined}/>
            <ConstellationChip label="Family" color={FAMILY} onClick={() => undefined}/>
        </div>
    </Ground>
)

export const Removable = () => (
    <Ground width={360}>
        <div style={{display: 'flex', gap: 14, flexWrap: 'wrap'}}>
            <ConstellationChip label="Travel" color={TRAVEL} onClick={() => undefined} onRemove={() => undefined}/>
            <ConstellationChip label="Reading" color={READING} onClick={() => undefined} onRemove={() => undefined}/>
        </div>
    </Ground>
)

export const Small = () => (
    <Ground width={360}>
        <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
            <ConstellationChip size="sm" label="Travel" color={TRAVEL}/>
            <ConstellationChip size="sm" label="Reading" color={READING}/>
        </div>
    </Ground>
)
