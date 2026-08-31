import {useNavigate} from 'react-router-dom'
import {EmptyState} from '@uliss/design-system'
import {Screen} from '../ui/Screen'

/**
 * Constellations — named branches of related notes, a tree you expand and prune. There is no
 * tagging backend, so this is the empty state; wave 8 adds the tree + delete-branch dialog
 * (`useNotice().confirm`) once notes and tags exist.
 */
export function ConstellationsPage() {
    const navigate = useNavigate()
    return (
        <Screen kicker="Constellations" count={0}>
            <div className="screen-empty">
                <EmptyState
                    title="No constellations yet"
                    body="As notes accumulate, Uliss gathers the related ones into named branches you can rename and prune. Talk to it a while first."
                    action="Start a chat"
                    onAction={() => navigate('/chats')}
                />
            </div>
        </Screen>
    )
}
