import {type ReactNode, useEffect} from 'react'
import {ListRow} from '@uliss/design-system'
import {listChatNotes, streamNoteStatus, subscribeToNotesChanges} from '../../notes/noteApi'
import {toNoteViewModels} from '../../notes/NotesPage'
import {useLinkedItems} from './useLinkedItems'

const SUBSCRIPTIONS = [subscribeToNotesChanges]

/**
 * The notes written from a chat as rows that open them; [empty] while there are none (or none could be loaded yet).
 * Reloads when notes change (a summary requested, renamed, deleted) and once a generating or updating note settles.
 */
export function ChatNotesList({chatId, onOpen, empty}: {
    chatId: string
    onOpen: (noteId: string) => void
    empty: ReactNode
}) {
    const {items: notes, reload} = useLinkedItems(chatId, listChatNotes, SUBSCRIPTIONS)
    const pendingIds = notes.filter((note) => note.status === 'GENERATING' || note.updating).map((note) => note.id)
    const pendingKey = pendingIds.join(',')

    useEffect(() => {
        if (pendingIds.length === 0) return
        const controller = new AbortController()
        pendingIds.forEach((noteId) => {
            streamNoteStatus(noteId, {signal: controller.signal, onStatus: () => undefined})
                .then((terminal) => {
                    if (terminal && !controller.signal.aborted) reload()
                })
                // A cut stream leaves the row as it is; the next notes change reloads it.
                .catch(() => undefined)
        })
        return () => controller.abort()
        // pendingKey stands for pendingIds.
    }, [pendingKey, reload])

    if (notes.length === 0) return <>{empty}</>
    return (
        <div className="context-links">
            {toNoteViewModels(notes).map((view) => (
                <ListRow key={view.id} title={view.title} date={view.date} dots={false}
                         onClick={() => onOpen(view.id)}/>
            ))}
        </div>
    )
}
