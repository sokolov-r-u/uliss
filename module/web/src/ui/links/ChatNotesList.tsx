import {type ReactNode, useEffect, useState} from 'react'
import {ListRow} from '@uliss/design-system'
import {subscribeToChatListChanges} from '../../chat/chatApi'
import {listChatNotes, type Note, subscribeToNotesChanges} from '../../notes/noteApi'
import {toNoteViewModels} from '../../notes/NotesPage'

/**
 * The notes written from a chat as rows that open them; [empty] while there are none (or none could be loaded yet).
 * Reloads when notes change (summary finished, rename, delete) or chats change (a new summary request).
 */
export function ChatNotesList({chatId, onOpen, empty}: {
    chatId: string
    onOpen: (noteId: string) => void
    empty: ReactNode
}) {
    const [notes, setNotes] = useState<Note[]>([])
    const [revision, setRevision] = useState(0)

    useEffect(() => {
        const reload = () => setRevision((value) => value + 1)
        const unsubscribeNotes = subscribeToNotesChanges(reload)
        const unsubscribeChats = subscribeToChatListChanges(reload)
        return () => {
            unsubscribeNotes()
            unsubscribeChats()
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        listChatNotes(chatId, controller.signal)
            .then((loaded) => {
                if (!controller.signal.aborted) setNotes(loaded)
            })
            // A failed load keeps what is shown: the empty state, or the rows of the last successful load.
            .catch(() => undefined)
        return () => controller.abort()
    }, [chatId, revision])

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
