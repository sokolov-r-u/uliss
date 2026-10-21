/** Post-login landing page: the user's chats (`GET /note/chats`) with a "new chat" action. */
import {useEffect, useRef, useState} from 'react'
import {describeError} from '../lib/apiHelpers'
import {useNavigate} from 'react-router-dom'
import {Button, EmptyState, Icon, Kicker, ListRow} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {ItemActions} from '../ui/actions/ItemActions'
import {groupByMonth} from '../ui/nav/recency'
import {ScreenHeader} from '../ui/ScreenHeader'
import {type Chat, chatActivity, listChats, subscribeToChatListChanges} from './chatApi'
import './chat.css'
import {formatShortDate} from '../ui/format'

type ListState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; chats: Chat[] }

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
                // A failed background refresh keeps the loaded rows; the next list change retries.
                if (loadedRef.current) return
                setState({status: 'error', message: describeError(e)})
            })
        return () => {
            active = false
        }
    }, [revision])

    function onNewChat() {
        navigate('/chats/new')
    }

    return (
        <div className="product-view">
            <ScreenHeader
                kicker="Chats"
                count={state.status === 'ready' ? state.chats.length : undefined}
                right={
                    <Button variant="quiet" size="sm" onClick={onNewChat}>
                        New chat
                    </Button>
                }
            />

            <div className="product-body">
                {state.status === 'loading' && <p className="chat-state">Loading…</p>}
                {state.status === 'error' && <p className="chat-state chat-state-error">{state.message}</p>}

                {state.status === 'ready' && state.chats.length === 0 && <div className="product-empty">
                    <EmptyState
                        title="No chats yet"
                        body="Start a conversation. Uliss keeps the thread and writes a note when a thought is worth keeping."
                        action="Start a chat"
                        onAction={onNewChat}
                    />
                </div>}

                {state.status === 'ready' && state.chats.length > 0 && (
                    <div className="product-list">
                        {groupByMonth(state.chats, chatActivity).map((group, groupIndex) => <div
                            key={`${group.label}-${groupIndex}`} className="list-group">
                            {group.label && <div className="list-month"><Kicker size={8.5} spacing="3px"
                                                                                color="var(--text-faint)">{group.label}</Kicker></div>}
                        {group.items.map((chat, index) => (
                            <ItemActions key={chat.id} dialogHost="list"
                                         target={{
                                             kind: 'chat',
                                             id: chat.id,
                                             title: chat.title,
                                             noteCount: chat.noteCount
                                         }}>
                                {(openMenu) => <ListRow
                                    title={chat.title}
                                    first={index === 0}
                                    date={formatShortDate(chatActivity(chat))}
                                    meta={<><Icon name="noteDoc" size={12}/>{chat.noteCount}</>}
                                    onClick={() => navigate(`/chats/${chat.id}`)}
                                    onMenu={openMenu}
                                    menuLabel={`Actions for ${chat.title}`}/>}
                            </ItemActions>
                        ))}
                        </div>)}
                    </div>
                )}
            </div>
        </div>
    )
}
