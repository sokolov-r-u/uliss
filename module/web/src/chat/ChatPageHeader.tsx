import {useEffect, useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {Icon, IconButton, Kicker} from '@uliss/design-system'
import {ItemActions} from '../ui/actions/ItemActions'
import {type Chat, getChat, subscribeToChatListChanges} from './chatApi'

/** Back link, persisted chat title, and the chat's Rename · Delete menu. */
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

    return (
        <div className="chat-page-header">
            <Link to="/chats" className="chat-back-link">‹ chats</Link>
            {chat
                ? <span className="chat-page-title">{chat.title}</span>
                : <Kicker size={9} spacing="3px" color="var(--text-faint)">Conversation</Kicker>}
            {chat && <span className="chat-page-actions">
                <ItemActions target={{kind: 'chat', id: chat.id, title: chat.title, noteCount: chat.noteCount}}
                             deleteDisabled={generationActive}
                             onRenamed={(title) => setLoadedChat({...chat, title})}
                             onDeleted={() => navigate('/chats', {replace: true})}>
                    {(openMenu) => <IconButton s={44} title={`Actions for ${chat.title}`}
                                               onClick={(event) => openMenu(event.currentTarget)}>
                        <Icon name="dots" size={17}/>
                    </IconButton>}
                </ItemActions>
            </span>}
        </div>
    )
}
