import {Button, Kicker, TopBar} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const NotesList = () => (
    <Ground width={375} pad={0}>
        <TopBar label="Notes" count={142} onMenu={() => undefined}
                right={<Kicker size={9} spacing="2px" color="var(--text-faint)">3 new</Kicker>}/>
    </Ground>
)

export const OpenNote = () => (
    <Ground width={375} pad={0}>
        <TopBar label="Note" title="Letter I never sent to my brother about the summer house"
                onMenu={() => undefined}/>
    </Ground>
)

export const ChatsWithAction = () => (
    <Ground width={375} pad={0}>
        <TopBar label="Chats" count={0} onMenu={() => undefined}
                right={<Button variant="quiet" size="sm">New</Button>}/>
    </Ground>
)
