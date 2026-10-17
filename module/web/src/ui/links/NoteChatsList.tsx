import {type ReactNode, useEffect, useState} from 'react'
import {ListRow} from '@uliss/design-system'
import {type Chat, chatActivity, listNoteChats, subscribeToChatListChanges} from '../../chat/chatApi'
import {formatShortDate} from '../format'

/**
 * The chats a note was written from as rows that open them; [empty] while there are none (or none could be loaded
 * yet). Reloads when chats change (rename, delete, new activity).
 */
export function NoteChatsList({noteId, onOpen, empty}: {
    noteId: string
    onOpen: (chatId: string) => void
    empty: ReactNode
}) {
    const [chats, setChats] = useState<Chat[]>([])
    const [revision, setRevision] = useState(0)

    useEffect(() => subscribeToChatListChanges(() => setRevision((value) => value + 1)), [])

    useEffect(() => {
        const controller = new AbortController()
        listNoteChats(noteId, controller.signal)
            .then((loaded) => {
                if (!controller.signal.aborted) setChats(loaded)
            })
            // A failed load keeps what is shown: the empty state, or the rows of the last successful load.
            .catch(() => undefined)
        return () => controller.abort()
    }, [noteId, revision])

    if (chats.length === 0) return <>{empty}</>
    return (
        <div className="context-links">
            {chats.map((chat) => (
                <ListRow key={chat.id} title={chat.title} date={formatShortDate(chatActivity(chat))} dots={false}
                         onClick={() => onOpen(chat.id)}/>
            ))}
        </div>
    )
}
