import {Kicker} from '@uliss/design-system'
import {type Note, subscribeToNotesChanges} from '../notes/noteApi'
import {useLinkedItems} from '../ui/links/useLinkedItems'
import {NoteTreeList} from './NoteTreeList'

const SUBSCRIPTIONS = [subscribeToNotesChanges]

/**
 * "Notes here" of a constellation panel: the notes [load] returns for [id] as rows that open them, sub-notes folded
 * under their parents, reloaded when notes change. [deeper] is the line about notes further down the branch.
 */
export function NotesHere({id, load, onOpen, empty, deeper = null}: {
    id: string
    load: (id: string, signal: AbortSignal) => Promise<Note[]>
    onOpen: (noteId: string) => void
    empty: string
    deeper?: string | null
}) {
    const {items: notes, status} = useLinkedItems(id, load, SUBSCRIPTIONS)
    return (
        <section className="constellation-panel-notes">
            <Kicker size={9} spacing="3px" color="var(--text-faint)">Notes here</Kicker>
            {notes.length === 0
                ? <p>{status === 'loading' ? 'Loading…' : status === 'failed' ? 'Could not load the notes.' : empty}</p>
                : <NoteTreeList notes={notes} onOpen={onOpen}/>}
            {deeper && <p className="constellation-panel-deeper">{deeper}</p>}
        </section>
    )
}
