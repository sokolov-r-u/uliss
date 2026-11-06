import {Kicker, useMessages} from '@uliss/design-system'
import {type Note, subscribeToNotesChanges} from '../notes/noteApi'
import {useLinkedItems} from '../ui/links/useLinkedItems'
import {NoteTreeList} from './NoteTreeList'
import {commonMessages} from '../i18n/common.messages'
import {constellationsMessages} from './constellations.messages'

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
    const t = useMessages(constellationsMessages)
    const common = useMessages(commonMessages)
    const {items: notes, status} = useLinkedItems(id, load, SUBSCRIPTIONS)
    return (
        <section className="constellation-panel-notes">
            <Kicker size={9} spacing="3px" color="var(--text-faint)">{t.notesHere}</Kicker>
            {notes.length === 0
                ? <p>{status === 'loading' ? common.loading : status === 'failed' ? t.couldNotLoadNotes : empty}</p>
                : <NoteTreeList notes={notes} onOpen={onOpen}/>}
            {deeper && <p className="constellation-panel-deeper">{deeper}</p>}
        </section>
    )
}
