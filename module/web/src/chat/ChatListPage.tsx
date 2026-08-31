/** Post-login landing page: the user's chats (`GET /note/chats`) with a "new chat" action. */
import {useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Button, EmptyState, ListHeader, ListRow} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {type Chat, createChat, listChats} from './chatApi'
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
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        setState({status: 'loading'})
        listChats()
            .then((chats) => {
                if (active) setState({status: 'ready', chats})
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
    }, [])

    function onNewChat() {
        setCreating(true)
        setCreateError(null)
        createChat()
            .then((chat) => navigate(`/chats/${chat.id}`))
            .catch((e: unknown) => {
                if (e instanceof AuthRequiredError) return
                setCreateError(e instanceof Error ? e.message : String(e))
                setCreating(false)
            })
    }

    return (
        <div className="chat-list-screen">
            <ListHeader
                kicker="Chats"
                total={state.status === 'ready' ? state.chats.length : undefined}
                right={
                    <Button variant="quiet" onClick={onNewChat}>
                        {creating ? 'Creating…' : 'New chat'}
                    </Button>
                }
            />

            <div className="chat-list-body">
                {createError && <p className="chat-state chat-state-error">{createError}</p>}
                {state.status === 'loading' && <p className="chat-state">Loading…</p>}
                {state.status === 'error' && <p className="chat-state chat-state-error">{state.message}</p>}

                {state.status === 'ready' && state.chats.length === 0 && (
                    <EmptyState
                        title="No chats yet"
                        body="Start a conversation. Uliss keeps the thread and writes a note when a thought is worth keeping."
                        action={creating ? 'Creating…' : 'Start a chat'}
                        onAction={onNewChat}
                    />
                )}

                {state.status === 'ready' && state.chats.length > 0 && (
                    <div className="chat-list">
                        {state.chats.map((chat) => (
                            <ListRow
                                key={chat.id}
                                title={chat.title}
                                date={formatDate(chat.updatedAt ?? chat.createdAt)}
                                dots={false}
                                onClick={() => navigate(`/chats/${chat.id}`)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
