import {Bubble} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Conversation = () => (
    <Ground width={380} pad={18}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
            <Bubble role="uliss">You have come back to this thought three times.</Bubble>
            <Bubble role="me">It keeps being the same problem in different clothes.</Bubble>
            <Bubble role="uliss">The first time it was the house by the sea, then the letter to your brother. Both
                end with a door you did not open.</Bubble>
        </div>
    </Ground>
)

export const UlissTurn = () => (
    <Ground width={380} pad={18}>
        <Bubble role="uliss">I folded four chats into “The empty room”. Nothing else changed.</Bubble>
    </Ground>
)

export const MyTurn = () => (
    <Ground width={380} pad={18}>
        <Bubble role="me">Пусть это останется заметкой, а не разговором.</Bubble>
    </Ground>
)
