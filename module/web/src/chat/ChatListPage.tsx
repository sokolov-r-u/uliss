/** Post-login landing page: the user's chats (`GET /note/chats`) with a "new chat" action. */
import {useEffect, useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {Kicker} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {type Chat, createChat, listChats} from './chatApi'
import './chat.css'

type ListState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; chats: Chat[] }

function formatDate(iso?: string): string {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})
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
        <div className="page">
            <div className="page-header">
                <div>
                    <Kicker size={9} spacing="3px">chats</Kicker>
                    <h1 className="page-title">Your chats</h1>
                </div>
                <button type="button" className="link-btn" onClick={onNewChat} disabled={creating}>
                    {creating ? 'creating…' : 'new chat'}
                </button>
            </div>

            {createError && <p className="auth-error">{createError}</p>}
            {state.status === 'loading' && <p className="auth-muted">loading…</p>}
            {state.status === 'error' && <p className="auth-error">{state.message}</p>}

            {state.status === 'ready' && state.chats.length === 0 && (
                <div className="chat-empty-state">
                    <p className="auth-muted">No chats yet — start the first one.</p>
                    <button type="button" className="link-btn" onClick={onNewChat} disabled={creating}>
                        {creating ? 'creating…' : 'start a chat'}
                    </button>
                </div>
            )}

            {state.status === 'ready' && state.chats.length > 0 && (
                <ul className="chat-list">
                    {state.chats.map((chat) => (
                        <li key={chat.id} className="chat-list-item">
                            <Link to={`/chats/${chat.id}`}>
                                <span className="chat-list-item-title">{chat.title}</span>
                                <span
                                    className="chat-list-item-date">{formatDate(chat.updatedAt ?? chat.createdAt)}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
