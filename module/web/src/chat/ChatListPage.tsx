/** Post-login landing page: the user's chats (`GET /note/chats`) with a "new chat" action. */
import {useEffect, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Button, EmptyState, Icon, ListHeader, ListRow} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {ItemActions} from '../ui/actions/ItemActions'
import {type Chat, listChats, subscribeToChatListChanges} from './chatApi'
import './chat.css'

type ListState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; chats: Chat[] }

/** Absolute and short — 'Jun 22'. The DS list never shows relative time. */
function formatDate(iso?: string): string {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
}

export function ChatListPage() {
    const navigate = useNavigate()
    const [state, setState] = useState<ListState>({status: 'loading'})
    const [revision, setRevision] = useState(0)
    const loadedRef = useRef(false)

    useEffect(() => subscribeToChatListChanges(() => setRevision((value) => value + 1)), [])

    useEffect(() => {
        let active = true
        // A refresh after rename/delete keeps the current rows instead of flashing "Loading…".
        if (!loadedRef.current) setState({status: 'loading'})
        listChats()
            .then((chats) => {
                if (!active) return
                loadedRef.current = true
                setState({status: 'ready', chats})
            })
            .catch((e: unknown) => {
                if (!active) return
                // authFetch already kicked off a login/refresh redirect — nothing to render.
                if (e instanceof AuthRequiredError) return
                setState({status: 'error', message: e instanceof Error ? e.message : String(e)})
            })
        return () => {
            active = false
        }
    }, [revision])

    function onNewChat() {
        navigate('/chats/new')
    }

    return (
        <div className="chat-list-screen">
            <ListHeader
                kicker="Chats"
                total={state.status === 'ready' ? state.chats.length : undefined}
                right={
                    <Button variant="quiet" onClick={onNewChat}>
                        New chat
                    </Button>
                }
            />

            <div className="chat-list-body">
                {state.status === 'loading' && <p className="chat-state">Loading…</p>}
                {state.status === 'error' && <p className="chat-state chat-state-error">{state.message}</p>}

                {state.status === 'ready' && state.chats.length === 0 && (
                    <EmptyState
                        title="No chats yet"
                        body="Start a conversation. Uliss keeps the thread and writes a note when a thought is worth keeping."
                        action="Start a chat"
                        onAction={onNewChat}
                    />
                )}

                {state.status === 'ready' && state.chats.length > 0 && (
                    <div className="chat-list">
                        {state.chats.map((chat) => (
                            <ItemActions key={chat.id}
                                         target={{
                                             kind: 'chat',
                                             id: chat.id,
                                             title: chat.title,
                                             noteCount: chat.noteCount
                                         }}>
                                {(openMenu) => <ListRow
                                    title={chat.title}
                                    date={formatDate(chat.updatedAt ?? chat.createdAt)}
                                    meta={<><Icon name="noteDoc" size={12}/>{chat.noteCount}</>}
                                    onClick={() => navigate(`/chats/${chat.id}`)}
                                    onMenu={openMenu}
                                    menuLabel={`Actions for ${chat.title}`}/>}
                            </ItemActions>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
