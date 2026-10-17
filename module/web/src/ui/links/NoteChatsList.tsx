import type {ReactNode} from 'react'
import {ListRow} from '@uliss/design-system'
import {chatActivity, listNoteChats, subscribeToChatListChanges} from '../../chat/chatApi'
import {formatShortDate} from '../format'
import {useLinkedItems} from './useLinkedItems'

const SUBSCRIPTIONS = [subscribeToChatListChanges]

/**
 * The chats a note was written from as rows that open them; [empty] while there are none (or none could be loaded
 * yet). Reloads when chats change (rename, delete, new activity).
 */
export function NoteChatsList({noteId, onOpen, empty}: {
    noteId: string
    onOpen: (chatId: string) => void
    empty: ReactNode
}) {
    const {items: chats} = useLinkedItems(noteId, listNoteChats, SUBSCRIPTIONS)
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
