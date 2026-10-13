import {Kicker, PendingLinks} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Default = () => (
    <Ground width={340}>
        <PendingLinks/>
    </Ground>
)

export const InNotePanel = () => (
    <Ground width={340}>
        <Kicker size={9} spacing="3px" color="var(--text-faint)">Linked notes</Kicker>
        <PendingLinks label="looking for links…"/>
    </Ground>
)

export const Compact = () => (
    <Ground width={340}>
        <PendingLinks label="linking…" size={11} pad="6px 0" minHeight={28}/>
    </Ground>
)
