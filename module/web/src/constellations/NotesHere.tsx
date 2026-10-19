import {Kicker, ListRow} from '@uliss/design-system'
import {type Note, subscribeToNotesChanges} from '../notes/noteApi'
import {formatShortDate} from '../ui/format'
import {useLinkedItems} from '../ui/links/useLinkedItems'

const SUBSCRIPTIONS = [subscribeToNotesChanges]

/**
 * "Notes here" of a constellation panel: the notes [load] returns for [id] as rows that open them, reloaded when notes
 * change. [deeper] is the line about notes further down the branch.
 */
export function NotesHere({id, load, onOpen, empty, deeper = null}: {
    id: string
    load: (id: string, signal: AbortSignal) => Promise<Note[]>
    onOpen: (noteId: string) => void
    empty: string
    deeper?: string | null
}) {
    const {items: notes} = useLinkedItems(id, load, SUBSCRIPTIONS)
    return (
        <section className="constellation-panel-notes">
            <Kicker size={9} spacing="3px" color="var(--text-faint)">Notes here</Kicker>
            {notes.length === 0
                ? <p>{empty}</p>
                : <div className="constellation-panel-note-list">
                    {notes.map((note) => (
                        <ListRow key={note.id} title={note.title || 'Untitled note'}
                                 date={formatShortDate(note.createdAt)} dots={false} onClick={() => onOpen(note.id)}/>
                    ))}
                </div>}
            {deeper && <p className="constellation-panel-deeper">{deeper}</p>}
        </section>
    )
}
