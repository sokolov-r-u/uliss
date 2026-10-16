import {Bubble, PendingStatus} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Thinking = () => (
    <Ground width={340}>
        <PendingStatus label="thinking…"/>
    </Ground>
)

export const SearchingNotes = () => (
    <Ground width={340}>
        <PendingStatus label="searching notes…"/>
    </Ground>
)

export const InChatReply = () => (
    <Ground width={420}>
        <Bubble role="me">Just listened to Bowie's new album.</Bubble>
        <Bubble role="uliss">
            <PendingStatus label="searching notes…" pad="0" minHeight={24}/>
        </Bubble>
    </Ground>
)
