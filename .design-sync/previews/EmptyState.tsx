import {EmptyState} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const NoNotes = () => (
    <Ground width={380} pad={28}>
        <EmptyState title="Nothing written down yet"
                    body="Talk to Uliss for a while. When a thought is worth keeping, it writes the note for you — you never have to."
                    action="Start a chat" onAction={() => undefined}/>
    </Ground>
)

export const EmptySky = () => (
    <Ground width={380} pad={28}>
        <EmptyState title="Your sky fills in as you write"
                    body="Every note becomes a star. Constellations appear once a few of them belong together."/>
    </Ground>
)

export const FirstRun = () => (
    <Ground width={380} pad={28}>
        <EmptyState titleSize={24} title="Say the first thing on your mind"
                    body="Uliss listens, keeps what matters and links it to what came before."
                    action="Begin" onAction={() => undefined}/>
    </Ground>
)
