import {useNavigate} from 'react-router-dom'
import {EmptyState} from '@uliss/design-system'
import {Screen} from '../ui/Screen'

/**
 * Notes — day one. `note-service` has no notes-list endpoint, so this screen is permanently in
 * its empty state; wave 7 adds the populated list on top of this shell.
 */
export function NotesPage() {
    const navigate = useNavigate()
    return (
        <Screen kicker="Notes" count={0}>
            <div className="screen-empty">
                <EmptyState
                    title="Nothing written down yet"
                    body="Talk to Uliss for a while. When a thought is worth keeping, it writes the note for you — you never have to."
                    action="Start a chat"
                    onAction={() => navigate('/chats')}
                />
            </div>
        </Screen>
    )
}
