import {useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Icon, IconButton} from '@uliss/design-system'
import {ItemActions} from '../ui/actions/ItemActions'
import {ScreenHeader} from '../ui/ScreenHeader'
import {type Chat, getChat, subscribeToChatListChanges} from './chatApi'

/** 'No notes yet' · '1 note' · '3 notes' — the chat's meta line. */
export function chatNotesMeta(noteCount: number): string {
    if (noteCount <= 0) return 'No notes yet'
    return noteCount === 1 ? '1 note' : `${noteCount} notes`
}

/** Persisted chat title as the page heading, its note count, and the chat's Rename · Delete menu. */
export function ChatPageHeader({chatId, generationActive}: { chatId?: string; generationActive: boolean }) {
    const navigate = useNavigate()
    const [loadedChat, setLoadedChat] = useState<Chat | null>(null)
    const [revision, setRevision] = useState(0)
    // The page is reused across chat routes; never show (or act on) the previous chat while the next one loads.
    const chat = loadedChat?.id === chatId ? loadedChat : null

    useEffect(() => subscribeToChatListChanges(() => setRevision((value) => value + 1)), [])

    useEffect(() => {
        if (!chatId) return
        const controller = new AbortController()
        getChat(chatId, controller.signal).then(setLoadedChat).catch(() => undefined)
        return () => controller.abort()
    }, [chatId, revision])

    if (!chat) return chatId ? <ScreenHeader kicker="Conversation"/> : <ScreenHeader title="New chat"/>

    return (
        <ScreenHeader
            title={chat.title}
            meta={chatNotesMeta(chat.noteCount)}
            right={<ItemActions target={{kind: 'chat', id: chat.id, title: chat.title, noteCount: chat.noteCount}}
                                deleteDisabled={generationActive}
                                onRenamed={(title) => setLoadedChat({...chat, title})}
                                onDeleted={() => navigate('/chats', {replace: true})}>
                {(openMenu) => <IconButton s={44} title={`Actions for ${chat.title}`}
                                           onClick={(event) => openMenu(event.currentTarget)}>
                    <Icon name="dots" size={17}/>
                </IconButton>}
            </ItemActions>}/>
    )
}
