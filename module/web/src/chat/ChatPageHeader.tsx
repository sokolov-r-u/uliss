import {useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Icon, IconButton, useMessages} from '@uliss/design-system'
import {ItemActions} from '../ui/actions/ItemActions'
import {PanelToggle} from '../ui/ContextPanel'
import {ScreenHeader} from '../ui/ScreenHeader'
import {type Chat, getChat, subscribeToChatListChanges} from './chatApi'
import {commonMessages} from '../i18n/common.messages'
import {chatMessages} from './chat.messages'
import {chatPageMessages} from './ChatPage.messages'

/** Persisted chat title as the page heading, its note count, and the chat's Rename · Delete menu. */
export function ChatPageHeader({chatId, generationActive, panelOpen = false, onTogglePanel, onChat}: {
    chatId?: string
    generationActive: boolean
    panelOpen?: boolean
    onTogglePanel?: () => void
    /** The loaded chat (or null while none is loaded) — feeds the details panel without a second request. */
    onChat?: (chat: Chat | null) => void
}) {
    const navigate = useNavigate()
    const t = useMessages(chatMessages)
    const page = useMessages(chatPageMessages)
    const common = useMessages(commonMessages)
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

    useEffect(() => onChat?.(chat), [chat, onChat])

    if (!chat) return chatId ? <ScreenHeader back kicker={page.conversation}/> : <ScreenHeader back title={t.newChat}/>

    return (
        <ScreenHeader
            back
            title={chat.title}
            meta={common.noteCount(chat.noteCount)}
            right={<>{onTogglePanel && <PanelToggle label={t.chatDetails} open={panelOpen} onToggle={onTogglePanel}/>}
                <ItemActions dialogHost="header"
                             target={{kind: 'chat', id: chat.id, title: chat.title, noteCount: chat.noteCount}}
                                deleteDisabled={generationActive}
                                onRenamed={(title) => setLoadedChat({...chat, title})}
                                onDeleted={() => navigate('/chats', {replace: true})}>
                {(openMenu) => <IconButton s={44} title={common.actionsFor(chat.title)}
                                           onClick={(event) => openMenu(event.currentTarget)}>
                    <Icon name="dots" size={17}/>
                </IconButton>}
            </ItemActions></>}/>
    )
}
