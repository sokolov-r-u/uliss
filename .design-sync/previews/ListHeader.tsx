import {Button, Icon, ListHeader} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Notes = () => (
    <Ground width={560}>
        <ListHeader kicker="Notes" total={142}
                    right={<Button variant="quiet" icon={<Icon name="plus" size={13}/>}>New note</Button>}/>
    </Ground>
)

export const Chats = () => (
    <Ground width={560}>
        <ListHeader kicker="Chats" total={18} right={<Button variant="quiet">New chat</Button>}/>
    </Ground>
)

export const EmptyCount = () => (
    <Ground width={560}>
        <ListHeader kicker="Notes" total={0}/>
    </Ground>
)
